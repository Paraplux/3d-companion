use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::Value;
use zip::ZipArchive;

use crate::library::analysis::mesh::Mesh;
use crate::library::analysis::thumbnail::png_bytes_to_webp;
use crate::library::models::{
    BambuMetadata, FilamentInfo, ThreeMfMetadata, ThreeMfObject, ThreeMfPlate, ThreeMfProject,
};

#[derive(Debug)]
pub struct ThreeMfAnalysis {
    pub metadata: ThreeMfMetadata,
    /// Primary card/detail preview (project → first plate → legacy).
    pub thumbnail_webp: Option<Vec<u8>>,
    pub project_thumbnail_webp: Option<Vec<u8>>,
    /// Plate index (1-based) → WebP bytes.
    pub plate_thumbnails: BTreeMap<u32, Vec<u8>>,
    pub mesh: Option<Mesh>,
}

#[derive(Debug, Default)]
struct ParsedObjectInfo {
    name: Option<String>,
    mesh_path: Option<String>,
    transform: Option<Vec<f32>>,
}

#[derive(Debug)]
struct ParsedPlate {
    index: u32,
    name: Option<String>,
    thumbnail_entry: Option<String>,
    object_ids: Vec<String>,
    estimated_time_seconds: Option<u64>,
    weight_grams: Option<f32>,
}

pub fn analyze_3mf(path: &Path) -> Result<ThreeMfAnalysis, String> {
    let file = std::fs::File::open(path).map_err(|error| format!("Could not open 3MF: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Invalid 3MF archive: {error}"))?;

    let names: Vec<String> = (0..archive.len())
        .filter_map(|index| archive.by_index(index).ok().map(|entry| entry.name().to_string()))
        .collect();

    let application = read_application_metadata(&mut archive);
    let is_bambu = detect_bambu(&application, &mut archive, &names);

    let bambu = if is_bambu {
        Some(extract_bambu_metadata(&mut archive, &names)?)
    } else {
        None
    };

    let object_infos = parse_object_infos(&mut archive, &names);
    let mut plates = parse_plates(&mut archive, &names, &object_infos);

    if let Some(bambu_meta) = bambu.as_ref() {
        enrich_plates_from_slice_info(&mut plates, bambu_meta, &mut archive);
    }

    let project_thumbnail_webp = extract_project_thumbnail(&mut archive, &names).ok().flatten();
    let plate_thumbnails = extract_plate_thumbnails(&mut archive, &plates);
    let legacy_preview = if project_thumbnail_webp.is_none() && plate_thumbnails.is_empty() {
        extract_legacy_preview(&mut archive, &names).ok().flatten()
    } else {
        None
    };

    let thumbnail_webp = project_thumbnail_webp
        .clone()
        .or_else(|| plate_thumbnails.values().next().cloned())
        .or(legacy_preview);

    let mesh = if thumbnail_webp.is_none() {
        extract_mesh(&mut archive, &names).ok()
    } else {
        None
    };

    let bambu = bambu.and_then(|mut meta| {
        if meta.plate_count.is_none() && !plates.is_empty() {
            meta.plate_count = Some(plates.len() as u32);
        }
        let has_any = meta.printer.is_some()
            || meta.filament.is_some()
            || meta.filaments.as_ref().is_some_and(|items| !items.is_empty())
            || meta.weight_grams.is_some()
            || meta.estimated_time_seconds.is_some()
            || meta.plate_count.is_some()
            || meta.nozzle.is_some()
            || meta.layer_height.is_some()
            || meta.infill.is_some()
            || meta.color.is_some()
            || meta.colors.as_ref().is_some_and(|items| !items.is_empty());
        if has_any {
            Some(meta)
        } else {
            None
        }
    });

    let project = if plates.is_empty() && project_thumbnail_webp.is_none() {
        None
    } else {
        Some(ThreeMfProject {
            thumbnail_path: None,
            plates: plates
                .into_iter()
                .map(|plate| ThreeMfPlate {
                    id: format!("plate-{}", plate.index),
                    index: plate.index,
                    name: plate.name,
                    thumbnail_path: None,
                    objects: plate
                        .object_ids
                        .into_iter()
                        .map(|object_id| {
                            let info = object_infos.get(&object_id);
                            ThreeMfObject {
                                id: object_id,
                                name: info.and_then(|value| value.name.clone()),
                                mesh_path: info.and_then(|value| value.mesh_path.clone()),
                                transform: info.and_then(|value| value.transform.clone()),
                            }
                        })
                        .collect(),
                    estimated_time_seconds: plate.estimated_time_seconds,
                    weight_grams: plate.weight_grams,
                })
                .collect(),
        })
    };

    Ok(ThreeMfAnalysis {
        metadata: ThreeMfMetadata {
            is_bambu,
            bambu,
            project,
        },
        thumbnail_webp,
        project_thumbnail_webp,
        plate_thumbnails,
        mesh,
    })
}

fn detect_bambu(
    application: &Option<String>,
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> bool {
    if application
        .as_deref()
        .is_some_and(|value| value.to_ascii_lowercase().contains("bambustudio"))
    {
        return true;
    }

    if detect_bbl_client(archive) {
        return true;
    }

    let has_project_settings = names
        .iter()
        .any(|name| name.eq_ignore_ascii_case("Metadata/project_settings.config"));
    let has_model_settings = names
        .iter()
        .any(|name| name.eq_ignore_ascii_case("Metadata/model_settings.config"));

    if has_project_settings && has_model_settings {
        if let Ok(bytes) = read_zip_entry(archive, "Metadata/project_settings.config") {
            if let Ok(json) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(printer) = json_string(&json, "printer_model") {
                    if printer.to_ascii_lowercase().contains("bambu") {
                        return true;
                    }
                }
            }
        }
    }

    false
}

fn detect_bbl_client(archive: &mut ZipArchive<std::fs::File>) -> bool {
    let Ok(bytes) = read_zip_entry(archive, "Metadata/slice_info.config") else {
        return false;
    };
    let text = String::from_utf8_lossy(&bytes);
    text.contains("X-BBL-Client") || text.contains("BBL-")
}

fn read_application_metadata(archive: &mut ZipArchive<std::fs::File>) -> Option<String> {
    let bytes = read_zip_entry(archive, "3D/3dmodel.model").ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let lower = text.to_ascii_lowercase();
    let key = "name=\"application\"";
    let idx = lower.find(key)?;
    let slice = &text[idx..];
    let start = slice.find('>')? + 1;
    let end = slice[start..].find('<')? + start;
    Some(slice[start..end].trim().to_string())
}

fn extract_bambu_metadata(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> Result<BambuMetadata, String> {
    let mut meta = BambuMetadata {
        printer: None,
        nozzle: None,
        layer_height: None,
        filament: None,
        color: None,
        colors: None,
        filaments: None,
        infill: None,
        plate_count: None,
        estimated_time_seconds: None,
        weight_grams: None,
    };

    if let Ok(bytes) = read_zip_entry(archive, "Metadata/project_settings.config") {
        if let Ok(json) = serde_json::from_slice::<Value>(&bytes) {
            meta.printer = json_string(&json, "printer_model");
            if let Some(variant) = json_string(&json, "printer_variant") {
                meta.nozzle = Some(format!("{variant} mm"));
            }
            if let Some(height) = json_string(&json, "layer_height") {
                meta.layer_height = Some(format_mm(&height));
            }
            if let Some(infill) = json_string(&json, "sparse_infill_density") {
                meta.infill = Some(format_percent(&infill));
            }

            let types = json
                .get("filament_type")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            let colours = json
                .get("filament_colour")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            if let Some(first) = types.first() {
                meta.filament = Some(first.clone());
            }
            if let Some(first) = colours.first() {
                meta.color = Some(first.clone());
            }
            if !colours.is_empty() {
                meta.colors = Some(colours.clone());
            }

            let filament_rows = zip_filament_rows(&types, &colours);
            if !filament_rows.is_empty() {
                meta.filaments = Some(filament_rows);
            }
        }
    }

    if let Ok(bytes) = read_zip_entry(archive, "Metadata/slice_info.config") {
        apply_slice_info(&mut meta, &bytes);
    }

    if meta.filaments.as_ref().is_none_or(|items| items.is_empty()) {
        meta.filaments = synthesize_filaments_from_legacy(&meta);
    }

    let plate_count = names
        .iter()
        .filter_map(|name| parse_plate_index_from_name(name))
        .max();

    if meta.plate_count.is_none() {
        meta.plate_count = plate_count;
    }

    if meta.plate_count.is_none() {
        if let Ok(bytes) = read_zip_entry(archive, "Metadata/model_settings.config") {
            let text = String::from_utf8_lossy(&bytes);
            let count = text.matches("<plate>").count() as u32;
            if count > 0 {
                meta.plate_count = Some(count);
            }
        }
    }

    Ok(meta)
}

fn apply_slice_info(meta: &mut BambuMetadata, bytes: &[u8]) {
    let text = String::from_utf8_lossy(bytes);

    if meta.printer.is_none() {
        meta.printer = xml_meta_value(&text, "printer_model_id");
    }
    if meta.nozzle.is_none() {
        if let Some(nozzle) = xml_meta_value(&text, "nozzle_diameters") {
            meta.nozzle = Some(format_mm(&nozzle));
        }
    }

    let mut total_weight = 0.0_f32;
    let mut total_time = 0_u64;
    let mut plate_count = 0_u32;
    let mut materials = Vec::new();
    let mut colors = Vec::new();

    for plate in text.split("<plate>").skip(1) {
        plate_count += 1;
        if let Some(prediction) = xml_meta_value(plate, "prediction") {
            if let Ok(seconds) = prediction.parse::<u64>() {
                total_time += seconds;
            }
        }
        if let Some(weight) = xml_meta_value(plate, "weight") {
            if let Ok(grams) = weight.parse::<f32>() {
                total_weight += grams;
            }
        }

        for filament in plate.split("<filament ").skip(1) {
            materials.push(attr_value(filament, "type"));
            colors.push(attr_value(filament, "color"));
        }
    }

    if plate_count > 0 {
        meta.plate_count = Some(plate_count);
    }
    if total_time > 0 {
        meta.estimated_time_seconds = Some(total_time);
    }
    if total_weight > 0.0 {
        meta.weight_grams = Some(total_weight);
    }

    let material_values: Vec<String> = materials.into_iter().flatten().collect();
    let color_values: Vec<String> = colors.into_iter().flatten().collect();

    if meta.filament.is_none() {
        meta.filament = material_values.first().cloned();
    }
    if meta.color.is_none() {
        meta.color = color_values.first().cloned();
    }
    if meta.colors.is_none() && !color_values.is_empty() {
        meta.colors = Some(color_values.clone());
    }

    if meta.filaments.as_ref().is_none_or(|items| items.is_empty()) {
        let rows = zip_filament_rows(&material_values, &color_values);
        if !rows.is_empty() {
            meta.filaments = Some(rows);
        }
    }
}

fn enrich_plates_from_slice_info(
    plates: &mut [ParsedPlate],
    _bambu: &BambuMetadata,
    archive: &mut ZipArchive<std::fs::File>,
) {
    let Ok(bytes) = read_zip_entry(archive, "Metadata/slice_info.config") else {
        return;
    };
    let text = String::from_utf8_lossy(&bytes);
    let mut plate_index = 0_u32;
    for plate_text in text.split("<plate>").skip(1) {
        plate_index += 1;
        let Some(target) = plates.iter_mut().find(|plate| plate.index == plate_index) else {
            continue;
        };
        if let Some(prediction) = xml_meta_value(plate_text, "prediction") {
            if let Ok(seconds) = prediction.parse::<u64>() {
                target.estimated_time_seconds = Some(seconds);
            }
        }
        if let Some(weight) = xml_meta_value(plate_text, "weight") {
            if let Ok(grams) = weight.parse::<f32>() {
                target.weight_grams = Some(grams);
            }
        }
    }
}

fn zip_filament_rows(materials: &[String], colors: &[String]) -> Vec<FilamentInfo> {
    let len = materials.len().max(colors.len());
    let mut rows = Vec::with_capacity(len);
    for index in 0..len {
        let material = materials
            .get(index)
            .cloned()
            .filter(|value| !value.trim().is_empty());
        let color = colors
            .get(index)
            .cloned()
            .filter(|value| !value.trim().is_empty());
        if material.is_none() && color.is_none() {
            continue;
        }
        rows.push(FilamentInfo { material, color });
    }
    rows
}

fn synthesize_filaments_from_legacy(meta: &BambuMetadata) -> Option<Vec<FilamentInfo>> {
    if let Some(colors) = meta.colors.as_ref() {
        if !colors.is_empty() {
            return Some(
                colors
                    .iter()
                    .map(|color| FilamentInfo {
                        material: meta.filament.clone(),
                        color: Some(color.clone()),
                    })
                    .collect(),
            );
        }
    }

    if meta.filament.is_some() || meta.color.is_some() {
        return Some(vec![FilamentInfo {
            material: meta.filament.clone(),
            color: meta.color.clone(),
        }]);
    }

    None
}

fn parse_object_infos(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> HashMap<String, ParsedObjectInfo> {
    let mut infos: HashMap<String, ParsedObjectInfo> = HashMap::new();

    if names
        .iter()
        .any(|name| name.eq_ignore_ascii_case("3D/3dmodel.model"))
    {
        if let Ok(bytes) = read_zip_entry(archive, "3D/3dmodel.model") {
            parse_build_model_objects(&bytes, &mut infos);
        }
    }

    if names
        .iter()
        .any(|name| name.eq_ignore_ascii_case("Metadata/model_settings.config"))
    {
        if let Ok(bytes) = read_zip_entry(archive, "Metadata/model_settings.config") {
            parse_model_settings_object_names(&bytes, &mut infos);
        }
    }

    infos
}

fn parse_build_model_objects(bytes: &[u8], infos: &mut HashMap<String, ParsedObjectInfo>) {
    let text = String::from_utf8_lossy(bytes);

    for item in text.split("<item").skip(1) {
        let object_id = attr_value(item, "objectid").or_else(|| attr_value(item, "objectId"));
        let Some(object_id) = object_id else {
            continue;
        };
        let transform = attr_value(item, "transform").and_then(|value| parse_transform(&value));
        let entry = infos.entry(object_id).or_default();
        if entry.transform.is_none() {
            entry.transform = transform;
        }
    }

    let mut reader = Reader::from_str(&text);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut current_object_id: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(tag)) | Ok(Event::Empty(tag)) => {
                let local = String::from_utf8_lossy(tag.local_name().as_ref()).to_ascii_lowercase();
                if local == "object" {
                    current_object_id = None;
                    for attr in tag.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_ascii_lowercase();
                        if key == "id" {
                            current_object_id = Some(attr.unescape_value().unwrap_or_default().to_string());
                        }
                    }
                } else if local == "component" {
                    let Some(object_id) = current_object_id.clone() else {
                        continue;
                    };
                    let mut mesh_path = None;
                    let mut component_transform = None;
                    for attr in tag.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.local_name().as_ref())
                            .to_ascii_lowercase();
                        let value = attr.unescape_value().unwrap_or_default().to_string();
                        if key == "path" {
                            mesh_path = Some(normalize_package_path(&value));
                        } else if key == "transform" {
                            component_transform = parse_transform(&value);
                        }
                    }
                    let entry = infos.entry(object_id).or_default();
                    if entry.mesh_path.is_none() {
                        entry.mesh_path = mesh_path;
                    }
                    if entry.transform.is_none() {
                        entry.transform = component_transform;
                    }
                }
            }
            Ok(Event::End(tag)) => {
                let local = String::from_utf8_lossy(tag.local_name().as_ref()).to_ascii_lowercase();
                if local == "object" {
                    current_object_id = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
}

fn parse_model_settings_object_names(bytes: &[u8], infos: &mut HashMap<String, ParsedObjectInfo>) {
    let text = String::from_utf8_lossy(bytes);
    for object_block in text.split("<object ").skip(1) {
        let Some(object_id) = attr_value(&format!("<{object_block}"), "id")
            .or_else(|| {
                object_block
                    .split('>')
                    .next()
                    .and_then(|attrs| attr_value(&format!("x {attrs}"), "id"))
            })
        else {
            continue;
        };
        // Prefer: <object id="N"> ... <metadata key="name" value="..."/>
        let name = xml_meta_value(object_block, "name");
        if let Some(name) = name {
            infos.entry(object_id).or_default().name = Some(name);
        }
    }
}

fn parse_plates(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
    _object_infos: &HashMap<String, ParsedObjectInfo>,
) -> Vec<ParsedPlate> {
    if let Ok(bytes) = read_zip_entry(archive, "Metadata/model_settings.config") {
        let plates = parse_plates_from_model_settings(&bytes);
        if !plates.is_empty() {
            return plates;
        }
    }

    derive_plates_from_thumbnails(names)
}

fn parse_plates_from_model_settings(bytes: &[u8]) -> Vec<ParsedPlate> {
    let text = String::from_utf8_lossy(bytes);
    let mut plates = Vec::new();

    for plate_text in text.split("<plate>").skip(1) {
        let index = xml_meta_value(plate_text, "plater_id")
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or((plates.len() as u32) + 1);
        let name = xml_meta_value(plate_text, "plater_name").and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        });
        let thumbnail_entry = xml_meta_value(plate_text, "thumbnail_file");

        let mut object_ids = Vec::new();
        for instance in plate_text.split("<model_instance>").skip(1) {
            if let Some(object_id) = xml_meta_value(instance, "object_id") {
                if !object_ids.contains(&object_id) {
                    object_ids.push(object_id);
                }
            }
        }

        plates.push(ParsedPlate {
            index,
            name,
            thumbnail_entry,
            object_ids,
            estimated_time_seconds: None,
            weight_grams: None,
        });
    }

    plates.sort_by_key(|plate| plate.index);
    plates
}

fn derive_plates_from_thumbnails(names: &[String]) -> Vec<ParsedPlate> {
    let mut indexes: Vec<u32> = names.iter().filter_map(|name| parse_plate_index_from_name(name)).collect();
    indexes.sort_unstable();
    indexes.dedup();

    indexes
        .into_iter()
        .map(|index| ParsedPlate {
            index,
            name: None,
            thumbnail_entry: names
                .iter()
                .find(|name| {
                    let lower = name.to_ascii_lowercase();
                    lower == format!("metadata/plate_{index}.png")
                })
                .cloned(),
            object_ids: Vec::new(),
            estimated_time_seconds: None,
            weight_grams: None,
        })
        .collect()
}

fn parse_plate_index_from_name(name: &str) -> Option<u32> {
    let lower = name.to_ascii_lowercase();
    if !(lower.starts_with("metadata/plate_")
        && (lower.ends_with(".png") || lower.ends_with(".json") || lower.ends_with(".gcode")))
    {
        return None;
    }
    if lower.contains("pattern") || lower.contains("no_light") || lower.contains("_small") {
        return None;
    }
    lower
        .trim_start_matches("metadata/plate_")
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse::<u32>()
        .ok()
}

fn extract_project_thumbnail(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> Result<Option<Vec<u8>>, String> {
    let candidates = [
        "Auxiliaries/.thumbnails/thumbnail_3mf.png",
        "Auxiliaries/.thumbnails/thumbnail_middle.png",
        "Auxiliaries/.thumbnails/thumbnail_small.png",
        "Metadata/thumbnail.png",
    ];

    for candidate in candidates {
        if names.iter().any(|name| name.eq_ignore_ascii_case(candidate)) {
            if let Ok(bytes) = read_zip_entry(archive, candidate) {
                return Ok(Some(png_bytes_to_webp(&bytes)?));
            }
        }
    }

    Ok(None)
}

fn extract_plate_thumbnails(
    archive: &mut ZipArchive<std::fs::File>,
    plates: &[ParsedPlate],
) -> BTreeMap<u32, Vec<u8>> {
    let mut thumbs = BTreeMap::new();
    for plate in plates {
        let candidates = [
            plate.thumbnail_entry.clone(),
            Some(format!("Metadata/plate_{}.png", plate.index)),
            Some(format!("Metadata/pick_{}.png", plate.index)),
            Some(format!("Metadata/top_{}.png", plate.index)),
        ];

        for candidate in candidates.into_iter().flatten() {
            if let Ok(bytes) = read_zip_entry(archive, &candidate) {
                if let Ok(webp) = png_bytes_to_webp(&bytes) {
                    thumbs.insert(plate.index, webp);
                    break;
                }
            }
        }
    }
    thumbs
}

fn extract_legacy_preview(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> Result<Option<Vec<u8>>, String> {
    let candidates = [
        "Metadata/plate_1.png",
        "Metadata/pick_1.png",
        "Metadata/top_1.png",
        "Metadata/pick_plate_1.png",
        "Metadata/top_plate_1.png",
        "Metadata/thumbnail.png",
    ];

    for candidate in candidates {
        if names.iter().any(|name| name.eq_ignore_ascii_case(candidate)) {
            if let Ok(bytes) = read_zip_entry(archive, candidate) {
                return Ok(Some(png_bytes_to_webp(&bytes)?));
            }
        }
    }

    if let Some(name) = names.iter().find(|name| {
        let lower = name.to_ascii_lowercase();
        lower.starts_with("metadata/plate_")
            && lower.ends_with(".png")
            && !lower.contains("pattern")
            && !lower.contains("no_light")
            && !lower.contains("_small")
    }) {
        if let Ok(bytes) = read_zip_entry(archive, name) {
            return Ok(Some(png_bytes_to_webp(&bytes)?));
        }
    }

    Ok(None)
}

fn extract_mesh(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> Result<Mesh, String> {
    let mut mesh = Mesh::default();

    let mut model_files: Vec<String> = names
        .iter()
        .filter(|name| {
            let lower = name.to_ascii_lowercase();
            lower.ends_with(".model") && !lower.contains("_rels")
        })
        .cloned()
        .collect();
    model_files.sort();

    for name in model_files {
        let Ok(bytes) = read_zip_entry(archive, &name) else {
            continue;
        };
        append_model_mesh(&mut mesh, &bytes)?;
        if mesh.triangle_count() > 250_000 {
            break;
        }
    }

    if mesh.triangle_count() == 0 {
        return Err("3MF contained no mesh geometry.".into());
    }

    Ok(mesh)
}

pub(crate) fn append_model_mesh(mesh: &mut Mesh, bytes: &[u8]) -> Result<(), String> {
    let text = String::from_utf8_lossy(bytes);
    let mut reader = Reader::from_str(&text);
    reader.config_mut().trim_text(true);

    let mut vertices: Vec<[f32; 3]> = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(tag)) | Ok(Event::Start(tag)) => {
                let local = String::from_utf8_lossy(tag.local_name().as_ref()).to_ascii_lowercase();
                if local == "vertex" {
                    let mut x = 0.0;
                    let mut y = 0.0;
                    let mut z = 0.0;
                    for attr in tag.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_ascii_lowercase();
                        let value = attr
                            .unescape_value()
                            .unwrap_or_default()
                            .parse::<f32>()
                            .unwrap_or(0.0);
                        match key.as_str() {
                            "x" => x = value,
                            "y" => y = value,
                            "z" => z = value,
                            _ => {}
                        }
                    }
                    vertices.push([x, y, z]);
                } else if local == "triangle" {
                    let mut v1 = 0_usize;
                    let mut v2 = 0_usize;
                    let mut v3 = 0_usize;
                    for attr in tag.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_ascii_lowercase();
                        let value = attr
                            .unescape_value()
                            .unwrap_or_default()
                            .parse::<usize>()
                            .unwrap_or(0);
                        match key.as_str() {
                            "v1" => v1 = value,
                            "v2" => v2 = value,
                            "v3" => v3 = value,
                            _ => {}
                        }
                    }
                    if let (Some(a), Some(b), Some(c)) =
                        (vertices.get(v1), vertices.get(v2), vertices.get(v3))
                    {
                        mesh.push_triangle(*a, *b, *c);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Could not parse 3MF model XML: {error}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(())
}

pub(crate) fn read_zip_entry(
    archive: &mut ZipArchive<std::fs::File>,
    name: &str,
) -> Result<Vec<u8>, String> {
    let index = (0..archive.len())
        .find(|&i| {
            archive
                .by_index(i)
                .map(|entry| entry.name().eq_ignore_ascii_case(name))
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("Missing ZIP entry: {name}"))?;

    let mut entry = archive
        .by_index(index)
        .map_err(|error| format!("Could not read ZIP entry: {error}"))?;
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read ZIP entry bytes: {error}"))?;
    Ok(bytes)
}

fn json_string(json: &Value, key: &str) -> Option<String> {
    json.get(key).and_then(|value| match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Array(items) => items.first().and_then(|item| match item {
            Value::String(text) => Some(text.clone()),
            Value::Number(number) => Some(number.to_string()),
            _ => None,
        }),
        _ => None,
    })
}

fn xml_meta_value(text: &str, key: &str) -> Option<String> {
    let pattern = format!("key=\"{key}\"");
    let idx = text.find(&pattern)?;
    let slice = &text[idx..];
    let value_idx = slice.find("value=\"")?;
    let start = value_idx + "value=\"".len();
    let end = slice[start..].find('"')? + start;
    Some(slice[start..end].to_string())
}

fn attr_value(text: &str, key: &str) -> Option<String> {
    let pattern = format!("{key}=\"");
    let idx = text.find(&pattern)?;
    let start = idx + pattern.len();
    let end = text[start..].find('"')? + start;
    Some(text[start..end].to_string())
}

fn parse_transform(value: &str) -> Option<Vec<f32>> {
    let values: Vec<f32> = value
        .split_whitespace()
        .filter_map(|part| part.parse::<f32>().ok())
        .collect();
    if values.len() == 12 || values.len() == 16 {
        Some(values)
    } else {
        None
    }
}

fn normalize_package_path(path: &str) -> String {
    path.trim_start_matches('/').to_string()
}

fn format_mm(value: &str) -> String {
    if value.contains("mm") {
        value.to_string()
    } else {
        format!("{value} mm")
    }
}

fn format_percent(value: &str) -> String {
    if value.contains('%') {
        value.to_string()
    } else {
        format!("{value}%")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn write_zip(path: &Path, files: &[(&str, &str)]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, contents) in files {
            zip.start_file(*name, options).unwrap();
            zip.write_all(contents.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    fn tiny_png() -> Vec<u8> {
        // Valid 2x2 RGB PNG
        vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00,
            0x00, 0xFD, 0xD4, 0x9A, 0x73, 0x00, 0x00, 0x00, 0x10, 0x49, 0x44, 0x41, 0x54, 0x78,
            0xDA, 0x63, 0x38, 0x21, 0x27, 0x07, 0x44, 0x0C, 0x10, 0x0A, 0x00, 0x1F, 0x26, 0x04,
            0x11, 0x4A, 0x8E, 0x8D, 0x20, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
            0x42, 0x60, 0x82,
        ]
    }

    fn write_zip_bytes(path: &Path, files: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, contents) in files {
            zip.start_file(*name, options).unwrap();
            zip.write_all(contents).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn parses_bambu_multi_plate_project() {
        let dir = std::env::temp_dir().join(format!("threemf-multi-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("multi.3mf");

        let model = r#"<?xml version="1.0"?>
<model>
  <metadata name="Application">BambuStudio-02.04.00.70</metadata>
  <resources>
    <object id="2" type="model">
      <components>
        <component path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
      </components>
    </object>
    <object id="4" type="model">
      <components>
        <component path="/3D/Objects/object_2.model" objectid="3" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
      </components>
    </object>
  </resources>
  <build>
    <item objectid="2" transform="1 0 0 0 1 0 0 0 1 10 20 30" printable="1" />
    <item objectid="4" transform="1 0 0 0 1 0 0 0 1 40 50 60" printable="1" />
  </build>
</model>"#;

        let settings = r#"<?xml version="1.0"?>
<config>
  <object id="2">
    <metadata key="name" value="Body"/>
  </object>
  <object id="4">
    <metadata key="name" value="Lid"/>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="Body + lid"/>
    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>
    <model_instance>
      <metadata key="object_id" value="2"/>
    </model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="2"/>
    <metadata key="plater_name" value=""/>
    <metadata key="thumbnail_file" value="Metadata/plate_2.png"/>
    <model_instance>
      <metadata key="object_id" value="4"/>
    </model_instance>
  </plate>
</config>"#;

        let project_settings = r##"{
          "printer_model": "Bambu Lab A1 mini",
          "printer_variant": "0.4",
          "layer_height": "0.2",
          "filament_type": ["PLA"],
          "filament_colour": ["#C12E1F"]
        }"##;

        let png = tiny_png();
        write_zip_bytes(
            &path,
            &[
                ("3D/3dmodel.model", model.as_bytes()),
                ("Metadata/model_settings.config", settings.as_bytes()),
                ("Metadata/project_settings.config", project_settings.as_bytes()),
                ("Metadata/slice_info.config", b"<config><header><header_item key=\"X-BBL-Client-Type\" value=\"slicer\"/></header></config>"),
                ("Metadata/plate_1.png", &png),
                ("Metadata/plate_2.png", &png),
                ("Auxiliaries/.thumbnails/thumbnail_3mf.png", &png),
                ("3D/Objects/object_1.model", b"<model><resources></resources></model>"),
                ("3D/Objects/object_2.model", b"<model><resources></resources></model>"),
            ],
        );

        let analysis = analyze_3mf(&path).unwrap();
        assert!(analysis.metadata.is_bambu);
        let project = analysis.metadata.project.as_ref().unwrap();
        assert_eq!(project.plates.len(), 2);
        assert_eq!(project.plates[0].id, "plate-1");
        assert_eq!(project.plates[0].name.as_deref(), Some("Body + lid"));
        assert_eq!(project.plates[0].objects[0].name.as_deref(), Some("Body"));
        assert_eq!(project.plates[0].objects[0].mesh_path.as_deref(), Some("3D/Objects/object_1.model"));
        assert!(project.plates[0].objects[0].transform.is_some());
        assert_eq!(project.plates[1].name, None);
        assert_eq!(project.plates[1].objects[0].name.as_deref(), Some("Lid"));
        assert!(analysis.project_thumbnail_webp.is_some());
        assert_eq!(analysis.plate_thumbnails.len(), 2);
        assert!(analysis.metadata.bambu.as_ref().unwrap().plate_count == Some(2));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn generic_3mf_without_plates_does_not_invent_structure() {
        let dir = std::env::temp_dir().join(format!("threemf-generic-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("generic.3mf");

        write_zip(
            &path,
            &[(
                "3D/3dmodel.model",
                r#"<?xml version="1.0"?><model><metadata name="Application">OtherSlicer</metadata><resources></resources><build></build></model>"#,
            )],
        );

        let analysis = analyze_3mf(&path).unwrap();
        assert!(!analysis.metadata.is_bambu);
        assert!(analysis.metadata.project.is_none() || analysis.metadata.project.as_ref().unwrap().plates.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn malformed_archive_returns_error() {
        let dir = std::env::temp_dir().join(format!("threemf-bad-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bad.3mf");
        std::fs::write(&path, b"not a zip").unwrap();
        assert!(analyze_3mf(&path).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn smoke_real_bambu_multi_plate_when_available() {
        let path = Path::new("/Users/marcbouchez/Documents/3D Models/18650+Box_2.3mf");
        if !path.exists() {
            return;
        }

        let analysis = analyze_3mf(path).expect("real 3MF should analyze");
        assert!(analysis.metadata.is_bambu);
        let project = analysis.metadata.project.as_ref().expect("project structure");
        assert!(project.plates.len() >= 2);
        assert!(analysis.plate_thumbnails.len() >= 2);
        assert!(analysis.project_thumbnail_webp.is_some() || analysis.thumbnail_webp.is_some());
        assert!(project.plates.iter().any(|plate| !plate.objects.is_empty()));
        assert!(project
            .plates
            .iter()
            .flat_map(|plate| plate.objects.iter())
            .any(|object| object.transform.is_some()));
    }
}
