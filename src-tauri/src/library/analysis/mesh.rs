//! Shared triangle mesh for analysis / offscreen thumbnails.

use crate::library::models::{BoundingBox, Vec3};

#[derive(Debug, Clone, Default)]
pub struct Mesh {
    /// Packed triangles: 9 floats per triangle (v0, v1, v2).
    pub positions: Vec<f32>,
}

impl Mesh {
    pub fn triangle_count(&self) -> usize {
        self.positions.len() / 9
    }

    pub fn push_triangle(&mut self, a: [f32; 3], b: [f32; 3], c: [f32; 3]) {
        self.positions.extend_from_slice(&a);
        self.positions.extend_from_slice(&b);
        self.positions.extend_from_slice(&c);
    }

    pub fn bounding_box(&self) -> Option<BoundingBox> {
        if self.positions.len() < 3 {
            return None;
        }

        let mut min = [f32::INFINITY; 3];
        let mut max = [f32::NEG_INFINITY; 3];

        for chunk in self.positions.chunks_exact(3) {
            for axis in 0..3 {
                min[axis] = min[axis].min(chunk[axis]);
                max[axis] = max[axis].max(chunk[axis]);
            }
        }

        Some(BoundingBox {
            min: Vec3 {
                x: min[0],
                y: min[1],
                z: min[2],
            },
            max: Vec3 {
                x: max[0],
                y: max[1],
                z: max[2],
            },
        })
    }

    /// Signed volume via divergence theorem (closed manifold assumed).
    pub fn signed_volume(&self) -> f32 {
        let mut volume = 0.0_f32;
        for tri in self.positions.chunks_exact(9) {
            let ax = tri[0];
            let ay = tri[1];
            let az = tri[2];
            let bx = tri[3];
            let by = tri[4];
            let bz = tri[5];
            let cx = tri[6];
            let cy = tri[7];
            let cz = tri[8];
            volume += ax * (by * cz - bz * cy)
                - ay * (bx * cz - bz * cx)
                + az * (bx * cy - by * cx);
        }
        volume / 6.0
    }
}
