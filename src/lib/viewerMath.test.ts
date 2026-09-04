import { describe, expect, it } from "vitest";
import { Box3, Matrix4, Vector3 } from "three";
import {
  computeCameraFit,
  matrixFrom3mfTransform,
  perspectiveFitDistance,
} from "@/lib/viewerMath";

describe("matrixFrom3mfTransform", () => {
  it("maps a 12-float 3MF transform with translation", () => {
    const matrix = matrixFrom3mfTransform([1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30]);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(10);
    expect(position.y).toBeCloseTo(20);
    expect(position.z).toBeCloseTo(30);
  });

  it("returns identity for invalid lengths", () => {
    const matrix = matrixFrom3mfTransform([1, 2, 3]);
    expect(matrix.equals(new Matrix4())).toBe(true);
  });
});

describe("camera framing", () => {
  it("returns null for an empty box", () => {
    expect(computeCameraFit(new Box3(), 40, 16 / 9)).toBeNull();
  });

  it("targets the model bounding-box center, not the origin", () => {
    const box = new Box3(
      new Vector3(80, 10, 40),
      new Vector3(160, 50, 120),
    );
    const fit = computeCameraFit(box, 40, 16 / 9);
    expect(fit).not.toBeNull();
    expect(fit!.target.x).toBeCloseTo(120);
    expect(fit!.target.y).toBeCloseTo(30);
    expect(fit!.target.z).toBeCloseTo(80);
  });

  it("frames a small model much closer than a large plate-sized box", () => {
    const model = computeCameraFit(
      new Box3(new Vector3(50, 0, 50), new Vector3(150, 40, 130)),
      40,
      1,
    );
    const plate = computeCameraFit(
      new Box3(new Vector3(0, 0, 0), new Vector3(256, 1, 256)),
      40,
      1,
    );

    expect(model).not.toBeNull();
    expect(plate).not.toBeNull();
    expect(model!.distance).toBeLessThan(plate!.distance * 0.55);
  });

  it("pulls the camera back on narrower aspect ratios to keep the sphere in frame", () => {
    const narrow = perspectiveFitDistance(50, 40, 0.6, 1);
    const wide = perspectiveFitDistance(50, 40, 2.2, 1);
    expect(narrow).toBeGreaterThan(wide);
  });
});
