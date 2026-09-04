use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::Value;
use zip::ZipArchive;

use crate::library::analysis::mesh::Mesh;
use crate::library::analysis::thumbnail::png_bytes_to_webp;
use crate::library::models::{BambuMetadata, FilamentInfo, ThreeMfMetadata};

#[derive(Debug)]
pub struct ThreeMfAnalysis {
    pub metadata: ThreeMfMetadata,
    pub thumbnail_webp: Option<Vec<u8>>,
    pub mesh: Option<Mesh>,
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

    let thumbnail_webp = extract_embedded_preview(&mut archive, &names)?;
    let mesh = if thumbnail_webp.is_none() {
        extract_mesh(&mut archive, &names).ok()
    } else {
        None
    };

    let bambu = bambu.and_then(|meta| {
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

    Ok(ThreeMfAnalysis {
        metadata: ThreeMfMetadata { is_bambu, bambu },
        thumbnail_webp,
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

    // Strong Bambu layout signals only when paired with Bambu-like application metadata.
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
        .filter_map(|name| {
            let lower = name.to_ascii_lowercase();
            if !(lower.starts_with("metadata/plate_")
                && (lower.ends_with(".png") || lower.ends_with(".json") || lower.ends_with(".gcode")))
            {
                return None;
            }
            lower
                .trim_start_matches("metadata/plate_")
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u32>()
                .ok()
        })
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

fn zip_filament_rows(materials: &[String], colors: &[String]) -> Vec<FilamentInfo> {
    let len = materials.len().max(colors.len());
    let mut rows = Vec::with_capacity(len);
    for index in 0..len {
        let material = materials.get(index).cloned().filter(|value| !value.trim().is_empty());
        let color = colors.get(index).cloned().filter(|value| !value.trim().is_empty());
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

fn extract_embedded_preview(
    archive: &mut ZipArchive<std::fs::File>,
    names: &[String],
) -> Result<Option<Vec<u8>>, String> {
    let candidates = [
        "Metadata/plate_1.png",
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

fn append_model_mesh(mesh: &mut Mesh, bytes: &[u8]) -> Result<(), String> {
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

fn read_zip_entry(archive: &mut ZipArchive<std::fs::File>, name: &str) -> Result<Vec<u8>, String> {
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
