use image::{Rgba, RgbaImage};
use webp::Encoder;

use crate::library::analysis::mesh::Mesh;
use crate::library::models::BoundingBox;

const THUMB_SIZE: u32 = 256;
const PADDING: f32 = 0.12;

pub fn render_mesh_webp(mesh: &Mesh) -> Result<Vec<u8>, String> {
    let bbox = mesh
        .bounding_box()
        .ok_or_else(|| "Cannot render empty mesh.".to_string())?;
    let rgba = rasterize(mesh, &bbox, THUMB_SIZE);
    encode_webp(&rgba)
}

pub fn png_bytes_to_webp(png_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(png_bytes)
        .map_err(|error| format!("Could not decode embedded preview: {error}"))?
        .into_rgba8();
    let resized = image::imageops::resize(
        &image,
        THUMB_SIZE,
        THUMB_SIZE,
        image::imageops::FilterType::Triangle,
    );
    encode_webp(&resized)
}

fn encode_webp(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let encoder = Encoder::from_rgba(image.as_raw(), image.width(), image.height());
    let encoded = encoder.encode(80.0);
    Ok(encoded.to_vec())
}

fn rasterize(mesh: &Mesh, bbox: &BoundingBox, size: u32) -> RgbaImage {
    let mut image = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));
    let mut zbuf = vec![f32::NEG_INFINITY; (size * size) as usize];

    let sx = (bbox.max.x - bbox.min.x).max(1e-6);
    let sy = (bbox.max.y - bbox.min.y).max(1e-6);
    let sz = (bbox.max.z - bbox.min.z).max(1e-6);
    let scale = (1.0 - 2.0 * PADDING) / sx.max(sy).max(sz);
    let cx = (bbox.min.x + bbox.max.x) * 0.5;
    let cy = (bbox.min.y + bbox.max.y) * 0.5;
    let cz = (bbox.min.z + bbox.max.z) * 0.5;

    let light = normalize([0.35, 0.85, 0.45]);
    let size_f = size as f32;

    for tri in mesh.positions.chunks_exact(9) {
        let a = [tri[0], tri[1], tri[2]];
        let b = [tri[3], tri[4], tri[5]];
        let c = [tri[6], tri[7], tri[8]];

        let pa = project(a, cx, cy, cz, scale, size_f);
        let pb = project(b, cx, cy, cz, scale, size_f);
        let pc = project(c, cx, cy, cz, scale, size_f);

        let normal = triangle_normal(a, b, c);
        let ndot = normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2];
        let shade = (0.35 + 0.65 * ndot.clamp(0.0, 1.0)).clamp(0.0, 1.0);
        let color = [
            (38.0 + 140.0 * shade) as u8,
            (52.0 + 150.0 * shade) as u8,
            (58.0 + 130.0 * shade) as u8,
            255,
        ];

        fill_triangle(&mut image, &mut zbuf, size, pa, pb, pc, color);
    }

    image
}

fn project(p: [f32; 3], cx: f32, cy: f32, cz: f32, scale: f32, size: f32) -> [f32; 3] {
    let x = (p[0] - cx) * scale;
    let y = (p[1] - cy) * scale;
    let z = (p[2] - cz) * scale;

    // Mild isometric-style projection for a readable silhouette.
    let sx = (x - z) * 0.866_025_4;
    let sy = y * 0.95 + (x + z) * 0.5;
    let depth = x * 0.3 + y * 0.6 + z * 0.5;

    [
        size * 0.5 + sx * size * 0.5,
        size * 0.55 - sy * size * 0.5,
        depth,
    ]
}

fn triangle_normal(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> [f32; 3] {
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    normalize([
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ])
}

fn normalize(v: [f32; 3]) -> [f32; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt().max(1e-8);
    [v[0] / len, v[1] / len, v[2] / len]
}

fn fill_triangle(
    image: &mut RgbaImage,
    zbuf: &mut [f32],
    size: u32,
    a: [f32; 3],
    b: [f32; 3],
    c: [f32; 3],
    color: [u8; 4],
) {
    let min_x = a[0].min(b[0]).min(c[0]).floor().max(0.0) as i32;
    let max_x = a[0].max(b[0]).max(c[0]).ceil().min((size - 1) as f32) as i32;
    let min_y = a[1].min(b[1]).min(c[1]).floor().max(0.0) as i32;
    let max_y = a[1].max(b[1]).max(c[1]).ceil().min((size - 1) as f32) as i32;

    let area = edge(a, b, c);
    if area.abs() < 1e-8 {
        return;
    }

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let p = [x as f32 + 0.5, y as f32 + 0.5, 0.0];
            let w0 = edge(b, c, p) / area;
            let w1 = edge(c, a, p) / area;
            let w2 = edge(a, b, p) / area;
            if w0 < 0.0 || w1 < 0.0 || w2 < 0.0 {
                continue;
            }

            let depth = w0 * a[2] + w1 * b[2] + w2 * c[2];
            let index = (y as u32 * size + x as u32) as usize;
            if depth >= zbuf[index] {
                zbuf[index] = depth;
                image.put_pixel(x as u32, y as u32, Rgba(color));
            }
        }
    }
}

fn edge(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> f32 {
    (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])
}
