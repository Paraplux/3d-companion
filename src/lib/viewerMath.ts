/** Convert a 3MF 12- or 16-float transform into a Three.js Matrix4. */
import { Box3, Matrix4, Sphere, Vector3 } from "three";
import { convertFileSrc } from "@tauri-apps/api/core";
import { filamentCssColor } from "@/lib/filaments";
import type { ModelGeometryObject } from "@/types/geometry";

/** Target ~70% of the useful viewport (1 / 0.70 ≈ 1.43 → slightly tighter). */
export const CAMERA_FIT_PADDING = 1.28;

/** Default three-quarter viewing direction (world space). */
export const CAMERA_FIT_DIRECTION = new Vector3(0.9, 0.75, 1).normalize();

export type CameraFitResult = {
  target: Vector3;
  position: Vector3;
  radius: number;
  distance: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
};

/**
 * Perspective distance so a sphere of `radius` fits in the viewport,
 * then scaled by `padding` (>1 leaves margin around the model).
 */
export function perspectiveFitDistance(
  radius: number,
  fovDegrees: number,
  aspect: number,
  padding = CAMERA_FIT_PADDING,
): number {
  const safeRadius = Math.max(radius, 1);
  const safeAspect = Math.max(aspect, 0.0001);
  const vFov = (fovDegrees * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
  const distVertical = safeRadius / Math.sin(vFov / 2);
  const distHorizontal = safeRadius / Math.sin(hFov / 2);
  return Math.max(distVertical, distHorizontal) * padding;
}

/**
 * Frame a bounding box with a three-quarter camera.
 * Uses the box's bounding sphere so wide and tall models both fit.
 */
export function computeCameraFit(
  box: Box3,
  fovDegrees: number,
  aspect: number,
  padding = CAMERA_FIT_PADDING,
): CameraFitResult | null {
  if (box.isEmpty()) {
    return null;
  }

  const sphere = box.getBoundingSphere(new Sphere());
  const target = sphere.center.clone();
  const radius = Math.max(sphere.radius, 1);
  const distance = perspectiveFitDistance(radius, fovDegrees, aspect, padding);
  const position = target.clone().addScaledVector(CAMERA_FIT_DIRECTION, distance);

  return {
    target,
    position,
    radius,
    distance,
    near: Math.max(distance / 250, 0.01),
    far: Math.max(distance * 50, 1000),
    minDistance: Math.max(radius * 0.12, 0.5),
    // Keep zoom range tight around the fitted distance so orbit/zoom stay responsive.
    maxDistance: Math.max(distance * 3.5, radius * 6, 40),
  };
}

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
