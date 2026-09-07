import { describe, expect, it } from "vitest";
import { canOpenInBambuStudio } from "@/lib/bambuStudio";

describe("canOpenInBambuStudio", () => {
  it("allows STL and 3MF only", () => {
    expect(canOpenInBambuStudio({ extension: "stl" })).toBe(true);
    expect(canOpenInBambuStudio({ extension: "STL" })).toBe(true);
    expect(canOpenInBambuStudio({ extension: "3mf" })).toBe(true);
    expect(canOpenInBambuStudio({ extension: "3MF" })).toBe(true);
    expect(canOpenInBambuStudio({ extension: "obj" })).toBe(false);
    expect(canOpenInBambuStudio({ extension: "gcode" })).toBe(false);
  });
});
