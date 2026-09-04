import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { matrixFrom3mfTransform } from "@/lib/viewerMath";

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
