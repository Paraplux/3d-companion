/** Convert a 3MF 12- or 16-float transform into a Three.js Matrix4. */
import { Matrix4 } from "three";
import { convertFileSrc } from "@tauri-apps/api/core";
import { filamentCssColor } from "@/lib/filaments";
import type { ModelGeometryObject } from "@/types/geometry";

export function matrixFrom3mfTransform(values: number[]): Matrix4 {
  const matrix = new Matrix4();

  if (values.length === 12) {
    const a = values[0] ?? 1;
    const b = values[1] ?? 0;
    const c = values[2] ?? 0;
    const d = values[3] ?? 0;
    const e = values[4] ?? 1;
    const f = values[5] ?? 0;
    const g = values[6] ?? 0;
    const h = values[7] ?? 0;
    const i = values[8] ?? 1;
    const x = values[9] ?? 0;
    const y = values[10] ?? 0;
    const z = values[11] ?? 0;
    // 3MF stores basis columns (a,b,c), (d,e,f), (g,h,i) and translation (x,y,z).
    matrix.set(a, d, g, x, b, e, h, y, c, f, i, z, 0, 0, 0, 1);
    return matrix;
  }

  if (values.length === 16) {
    matrix.set(
      values[0] ?? 1,
      values[1] ?? 0,
      values[2] ?? 0,
      values[3] ?? 0,
      values[4] ?? 0,
      values[5] ?? 1,
      values[6] ?? 0,
      values[7] ?? 0,
      values[8] ?? 0,
      values[9] ?? 0,
      values[10] ?? 1,
      values[11] ?? 0,
      values[12] ?? 0,
      values[13] ?? 0,
      values[14] ?? 0,
      values[15] ?? 1,
    );
    return matrix;
  }

  return matrix;
}

export async function loadPositionsBuffer(absolutePath: string): Promise<Float32Array> {
  const response = await fetch(convertFileSrc(absolutePath));
  if (!response.ok) {
    throw new Error("Could not load geometry buffer.");
  }
  const buffer = await response.arrayBuffer();
  return new Float32Array(buffer);
}

export function materialColorForObject(object: ModelGeometryObject, fallback = "#8a8f98"): string {
  return filamentCssColor(object.color) ?? fallback;
}
