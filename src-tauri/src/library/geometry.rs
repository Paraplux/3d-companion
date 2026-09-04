//! On-demand geometry extraction for the 3D viewer.
//! Reuses STL / 3MF mesh parsers from analysis — does not persist meshes in SQLite.

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use zip::ZipArchive;

use crate::library::analysis::mesh::Mesh;
use crate::library::analysis::stl::analyze_stl;
use crate::library::analysis::threemf::{append_model_mesh, read_zip_entry};
use crate::library::models::{FilamentInfo, LibraryFile, ThreeMfObject, ThreeMfPlate};

const MAX_TRIANGLES_PER_OBJECT: usize = 750_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelGeometryObject {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<Vec<f32>>,
    /// Filament color hex when reliably mapped.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Absolute path to little-endian f32 XYZ triangle soup.
    pub positions_path: String,
    pub triangle_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelGeometryResponse {
    pub format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plate_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bed_width_mm: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bed_depth_mm: Option<f32>,
    pub objects: Vec<ModelGeometryObject>,
}

pub fn load_model_geometry(
    file: &LibraryFile,
    plate_id: Option<&str>,
    cache_dir: &Path,
) -> Result<ModelGeometryResponse, String> {
    let extension = file.extension.to_ascii_lowercase();
    match extension.as_str() {
        "stl" => load_stl_geometry(file, cache_dir),
        "3mf" => load_3mf_geometry(file, plate_id, cache_dir),
        other => Err(format!("3D preview unavailable for {other} files.")),
    }
}

fn load_stl_geometry(file: &LibraryFile, cache_dir: &Path) -> Result<ModelGeometryResponse, String> {
    let analysis = analyze_stl(Path::new(&file.path))?;
    if analysis.mesh.triangle_count() == 0 {
        return Err("STL contained no geometry.".into());
    }
    if analysis.mesh.triangle_count() > MAX_TRIANGLES_PER_OBJECT {
        return Err("Model is too large for 3D preview.".into());
    }

    let positions_path = write_positions_cache(
        cache_dir,
        &file.content_hash,
        "stl",
        "0",
        &analysis.mesh.positions,
    )?;

    Ok(ModelGeometryResponse {
        format: "stl".into(),
        plate_id: None,
        bed_width_mm: None,
        bed_depth_mm: None,
        objects: vec![ModelGeometryObject {
            id: "0".into(),
            name: Some(file.name.clone()),
            transform: None,
            color: None,
            positions_path,
            triangle_count: analysis.mesh.triangle_count() as u64,
        }],
    })
}

fn load_3mf_geometry(
    file: &LibraryFile,
    plate_id: Option<&str>,
    cache_dir: &Path,
) -> Result<ModelGeometryResponse, String> {
    let threemf = file
        .threemf
        .as_ref()
        .ok_or_else(|| "3MF analysis is not ready yet.".to_string())?;

    let (bed_width_mm, bed_depth_mm) = bed_size_for_printer(
        threemf
            .bambu
            .as_ref()
            .and_then(|bambu| bambu.printer.as_deref()),
    );

    let filaments = threemf
        .bambu
        .as_ref()
        .and_then(|bambu| bambu.filaments.clone())
        .unwrap_or_default();

    let extruders = read_object_extruders(Path::new(&file.path)).unwrap_or_default();

    let (selected_plate_id, source_objects): (Option<String>, Vec<ThreeMfObject>) =
        if let Some(project) = threemf.project.as_ref() {
            if project.plates.is_empty() {
                return Err("No plate structure found in this 3MF.".into());
            }

            let plate = select_plate(&project.plates, plate_id)?;
            if plate.objects.is_empty() {
                return Err("Selected plate has no objects.".into());
            }
            (Some(plate.id.clone()), plate.objects.clone())
        } else {
            return load_3mf_flat_fallback(file, cache_dir, bed_width_mm, bed_depth_mm);
        };

    let archive_file = fs::File::open(&file.path)
        .map_err(|error| format!("Could not open 3MF: {error}"))?;
    let mut archive =
        ZipArchive::new(archive_file).map_err(|error| format!("Invalid 3MF archive: {error}"))?;

    let mut objects = Vec::new();
    for object in source_objects {
        let Some(mesh_path) = object.mesh_path.as_deref() else {
            continue;
        };
        let safe_path = sanitize_zip_path(mesh_path)?;
        let bytes = read_zip_entry(&mut archive, &safe_path)
            .map_err(|_| format!("Could not read mesh for object {}.", object.id))?;

        let mut mesh = Mesh::default();
        append_model_mesh(&mut mesh, &bytes)?;
        if mesh.triangle_count() == 0 {
            continue;
        }
        if mesh.triangle_count() > MAX_TRIANGLES_PER_OBJECT {
            return Err(format!(
                "Object {} is too large for 3D preview.",
                object.name.as_deref().unwrap_or(&object.id)
            ));
        }

        let color = extruders
            .get(&object.id)
            .and_then(|extruder| color_for_extruder(*extruder, &filaments));

        let positions_path = write_positions_cache(
            cache_dir,
            &file.content_hash,
            selected_plate_id.as_deref().unwrap_or("plate"),
            &object.id,
            &mesh.positions,
        )?;

        objects.push(ModelGeometryObject {
            id: object.id,
            name: object.name,
            transform: object.transform,
            color,
            positions_path,
            triangle_count: mesh.triangle_count() as u64,
        });
    }

    if objects.is_empty() {
        return Err("Could not extract geometry from this 3MF.".into());
    }

    Ok(ModelGeometryResponse {
        format: "3mf".into(),
        plate_id: selected_plate_id,
        bed_width_mm,
        bed_depth_mm,
        objects,
    })
}

fn load_3mf_flat_fallback(
    file: &LibraryFile,
    cache_dir: &Path,
    bed_width_mm: Option<f32>,
    bed_depth_mm: Option<f32>,
) -> Result<ModelGeometryResponse, String> {
    let archive_file = fs::File::open(&file.path)
        .map_err(|error| format!("Could not open 3MF: {error}"))?;
    let mut archive =
        ZipArchive::new(archive_file).map_err(|error| format!("Invalid 3MF archive: {error}"))?;

    let names: Vec<String> = (0..archive.len())
        .filter_map(|index| archive.by_index(index).ok().map(|entry| entry.name().to_string()))
        .collect();

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
        let Ok(bytes) = read_zip_entry(&mut archive, &name) else {
            continue;
        };
        let _ = append_model_mesh(&mut mesh, &bytes);
        if mesh.triangle_count() > MAX_TRIANGLES_PER_OBJECT {
            break;
        }
    }

    if mesh.triangle_count() == 0 {
        return Err("3MF contained no mesh geometry.".into());
    }
    if mesh.triangle_count() > MAX_TRIANGLES_PER_OBJECT {
        return Err("Model is too large for 3D preview.".into());
    }

    let positions_path =
        write_positions_cache(cache_dir, &file.content_hash, "flat", "0", &mesh.positions)?;

    Ok(ModelGeometryResponse {
        format: "3mf".into(),
        plate_id: None,
        bed_width_mm,
        bed_depth_mm,
        objects: vec![ModelGeometryObject {
            id: "0".into(),
            name: Some(file.name.clone()),
            transform: None,
            color: None,
            positions_path,
            triangle_count: mesh.triangle_count() as u64,
        }],
    })
}

fn select_plate<'a>(
    plates: &'a [ThreeMfPlate],
    plate_id: Option<&str>,
) -> Result<&'a ThreeMfPlate, String> {
    if let Some(id) = plate_id {
        return plates
            .iter()
            .find(|plate| plate.id == id)
            .ok_or_else(|| "Requested plate was not found.".to_string());
    }

    plates
        .iter()
        .min_by_key(|plate| plate.index)
        .ok_or_else(|| "No plates available.".to_string())
}

fn sanitize_zip_path(path: &str) -> Result<String, String> {
    let normalized = path.trim().trim_start_matches('/').replace('\\', "/");
    if normalized.is_empty()
        || normalized.contains("..")
        || Path::new(&normalized).is_absolute()
    {
        return Err("Invalid mesh path in 3MF package.".into());
    }
    Ok(normalized)
}

fn write_positions_cache(
    cache_dir: &Path,
    content_hash: &str,
    scope: &str,
    object_id: &str,
    positions: &[f32],
) -> Result<String, String> {
    if content_hash.is_empty() {
        return Err("Missing content hash for geometry cache.".into());
    }

    let safe_scope = scope.replace(['/', '\\', ':'], "_");
    let safe_object = object_id.replace(['/', '\\', ':'], "_");
    let dir = cache_dir.join(content_hash).join(&safe_scope);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create geometry cache: {error}"))?;

    let filename = format!("{safe_object}.f32");
    let absolute = dir.join(&filename);

    if !absolute.exists() {
        let mut bytes = Vec::with_capacity(positions.len() * 4);
        for value in positions {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        let mut file = fs::File::create(&absolute)
            .map_err(|error| format!("Could not write geometry cache: {error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("Could not write geometry cache: {error}"))?;
    }

    Ok(absolute.to_string_lossy().to_string())
}

fn read_object_extruders(path: &Path) -> Result<HashMap<String, u32>, String> {
    let archive_file =
        fs::File::open(path).map_err(|error| format!("Could not open 3MF: {error}"))?;
    let mut archive =
        ZipArchive::new(archive_file).map_err(|error| format!("Invalid 3MF archive: {error}"))?;
    let Ok(bytes) = read_zip_entry(&mut archive, "Metadata/model_settings.config") else {
        return Ok(HashMap::new());
    };

    let text = String::from_utf8_lossy(&bytes);
    let mut map = HashMap::new();
    for object_block in text.split("<object ").skip(1) {
        let Some(id) = attr_value(object_block, "id") else {
            continue;
        };
        if let Some(extruder) = xml_meta_value(object_block, "extruder") {
            if let Ok(index) = extruder.parse::<u32>() {
                if index > 0 {
                    map.insert(id, index);
                }
            }
        }
    }
    Ok(map)
}

fn color_for_extruder(extruder: u32, filaments: &[FilamentInfo]) -> Option<String> {
    let index = extruder.checked_sub(1)? as usize;
    filaments.get(index)?.color.clone()
}

fn bed_size_for_printer(printer: Option<&str>) -> (Option<f32>, Option<f32>) {
    let Some(printer) = printer else {
        return (None, None);
    };
    let lower = printer.to_ascii_lowercase();

    // Known Bambu printable areas (mm). Only used when the printer string matches reliably.
    let size = if lower.contains("a1 mini") {
        Some((180.0, 180.0))
    } else if lower.contains("a1")
        || lower.contains("p1p")
        || lower.contains("p1s")
        || lower.contains("x1c")
        || lower.contains("x1e")
        || lower.contains("x1")
    {
        Some((256.0, 256.0))
    } else if lower.contains("h2d") {
        Some((350.0, 320.0))
    } else {
        None
    };

    match size {
        Some((w, d)) => (Some(w), Some(d)),
        None => (None, None),
    }
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

pub fn geometry_cache_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("geometry-cache")
}
