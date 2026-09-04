use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;

use crate::library::analysis::mesh::Mesh;
use crate::library::models::StlMetadata;

#[derive(Debug)]
pub struct StlAnalysis {
    pub metadata: StlMetadata,
    pub mesh: Mesh,
}

pub fn analyze_stl(path: &Path) -> Result<StlAnalysis, String> {
    let mut file = File::open(path).map_err(|error| format!("Could not open STL: {error}"))?;
    let mut header = [0_u8; 84];
    let read = file
        .read(&mut header)
        .map_err(|error| format!("Could not read STL header: {error}"))?;

    if read < 84 {
        return Err("STL file is too small.".into());
    }

    let triangle_count = u32::from_le_bytes([header[80], header[81], header[82], header[83]]);
    let file_len = std::fs::metadata(path)
        .map_err(|error| format!("Could not read STL size: {error}"))?
        .len();
    let expected_binary_len = 84_u64 + u64::from(triangle_count) * 50;

    let looks_like_ascii = header.starts_with(b"solid") && expected_binary_len != file_len;

    if looks_like_ascii {
        analyze_ascii_stl(path)
    } else {
        analyze_binary_stl(path, triangle_count)
    }
}

fn analyze_binary_stl(path: &Path, triangle_count: u32) -> Result<StlAnalysis, String> {
    let file = File::open(path).map_err(|error| format!("Could not open STL: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut skip = [0_u8; 84];
    reader
        .read_exact(&mut skip)
        .map_err(|error| format!("Could not read STL header: {error}"))?;

    let mut mesh = Mesh::default();
    mesh.positions.reserve(triangle_count as usize * 9);
    let mut tri_buf = [0_u8; 50];

    for _ in 0..triangle_count {
        reader
            .read_exact(&mut tri_buf)
            .map_err(|error| format!("Could not read STL triangle: {error}"))?;

        let a = read_f32_3(&tri_buf[12..24]);
        let b = read_f32_3(&tri_buf[24..36]);
        let c = read_f32_3(&tri_buf[36..48]);
        mesh.push_triangle(a, b, c);
    }

    finalize_stl("binary", mesh)
}

fn analyze_ascii_stl(path: &Path) -> Result<StlAnalysis, String> {
    let file = File::open(path).map_err(|error| format!("Could not open STL: {error}"))?;
    let reader = BufReader::new(file);
    let mut mesh = Mesh::default();
    let mut vertices = Vec::with_capacity(3);

    for line in reader.lines() {
        let line = line.map_err(|error| format!("Could not read STL: {error}"))?;
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("vertex") {
            let coords = parse_xyz(rest)?;
            vertices.push(coords);
            if vertices.len() == 3 {
                mesh.push_triangle(vertices[0], vertices[1], vertices[2]);
                vertices.clear();
            }
        }
    }

    if mesh.triangle_count() == 0 {
        return Err("ASCII STL contained no triangles.".into());
    }

    finalize_stl("ascii", mesh)
}

fn finalize_stl(encoding: &str, mesh: Mesh) -> Result<StlAnalysis, String> {
    let bounding_box = mesh
        .bounding_box()
        .ok_or_else(|| "STL mesh is empty.".to_string())?;
    let dimensions_mm = bounding_box.dimensions_mm();
    let volume = mesh.signed_volume().abs();
    let volume_mm3 = if volume.is_finite() && volume > 0.0 {
        Some(volume)
    } else {
        None
    };

    Ok(StlAnalysis {
        metadata: StlMetadata {
            encoding: encoding.to_string(),
            triangle_count: mesh.triangle_count() as u64,
            bounding_box,
            dimensions_mm,
            volume_mm3,
        },
        mesh,
    })
}

fn read_f32_3(bytes: &[u8]) -> [f32; 3] {
    [
        f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        f32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]),
        f32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]),
    ]
}

fn parse_xyz(input: &str) -> Result<[f32; 3], String> {
    let mut values = input.split_whitespace().filter_map(|part| part.parse::<f32>().ok());
    let x = values
        .next()
        .ok_or_else(|| "Invalid STL vertex.".to_string())?;
    let y = values
        .next()
        .ok_or_else(|| "Invalid STL vertex.".to_string())?;
    let z = values
        .next()
        .ok_or_else(|| "Invalid STL vertex.".to_string())?;
    Ok([x, y, z])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("3d-library-stl-{name}"))
    }

    #[test]
    fn parses_ascii_stl() {
        let path = temp_path("ascii.stl");
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test"
        )
        .unwrap();

        let analysis = analyze_stl(&path).unwrap();
        assert_eq!(analysis.metadata.encoding, "ascii");
        assert_eq!(analysis.metadata.triangle_count, 1);
        assert!((analysis.metadata.dimensions_mm.x - 1.0).abs() < 0.001);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn parses_binary_stl() {
        let path = temp_path("binary.stl");
        let mut bytes = vec![0_u8; 84];
        bytes[80..84].copy_from_slice(&1_u32.to_le_bytes());
        let mut tri = vec![0_u8; 50];
        // vertices: (0,0,0) (1,0,0) (0,1,0)
        tri[12..24].copy_from_slice(&f32_bytes([0.0, 0.0, 0.0]));
        tri[24..36].copy_from_slice(&f32_bytes([1.0, 0.0, 0.0]));
        tri[36..48].copy_from_slice(&f32_bytes([0.0, 1.0, 0.0]));
        bytes.extend_from_slice(&tri);
        std::fs::write(&path, bytes).unwrap();

        let analysis = analyze_stl(&path).unwrap();
        assert_eq!(analysis.metadata.encoding, "binary");
        assert_eq!(analysis.metadata.triangle_count, 1);
        let _ = std::fs::remove_file(path);
    }

    fn f32_bytes(values: [f32; 3]) -> [u8; 12] {
        let mut out = [0_u8; 12];
        out[0..4].copy_from_slice(&values[0].to_le_bytes());
        out[4..8].copy_from_slice(&values[1].to_le_bytes());
        out[8..12].copy_from_slice(&values[2].to_le_bytes());
        out
    }
}
