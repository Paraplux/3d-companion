import { describe, expect, it } from "vitest";
import {
  filamentAccessibleLabel,
  filamentCssColor,
  resolveFilaments,
} from "@/lib/filaments";

describe("resolveFilaments", () => {
  it("prefers the filaments array when present", () => {
    expect(
      resolveFilaments({
        filament: "PLA",
        color: "#111111",
        colors: ["#111111", "#222222"],
        filaments: [
          { material: "PLA", color: "#C12E1F" },
          { material: "PETG", color: "#0047BB" },
        ],
      }),
    ).toEqual([
      { material: "PLA", color: "#C12E1F" },
      { material: "PETG", color: "#0047BB" },
    ]);
  });

  it("falls back to colors plus shared material", () => {
    expect(
      resolveFilaments({
        filament: "PLA",
        colors: ["#C12E1F", "#000000"],
      }),
    ).toEqual([
      { material: "PLA", color: "#C12E1F" },
      { material: "PLA", color: "#000000" },
    ]);
  });

  it("falls back to a single filament/color pair", () => {
    expect(resolveFilaments({ filament: "PETG", color: "#FFFFFF" })).toEqual([
      { material: "PETG", color: "#FFFFFF" },
    ]);
  });

  it("returns an empty list when no filament data exists", () => {
    expect(resolveFilaments({ printer: "A1 mini" })).toEqual([]);
    expect(resolveFilaments(null)).toEqual([]);
  });
});

describe("filamentCssColor", () => {
  it("accepts hex colors and strips 8-digit alpha", () => {
    expect(filamentCssColor("#C12E1F")).toBe("#C12E1F");
    expect(filamentCssColor("#C12E1FFF")).toBe("#C12E1F");
    expect(filamentCssColor("00AA88")).toBe("#00AA88");
  });

  it("rejects invalid colors", () => {
    expect(filamentCssColor("not-a-color")).toBeNull();
    expect(filamentCssColor("")).toBeNull();
    expect(filamentCssColor(undefined)).toBeNull();
  });
});

describe("filamentAccessibleLabel", () => {
  it("joins material and color without inventing values", () => {
    expect(filamentAccessibleLabel({ material: "PLA", color: "#C12E1F" })).toBe(
      "PLA, #C12E1F",
    );
    expect(filamentAccessibleLabel({ material: "PETG" })).toBe("PETG");
    expect(filamentAccessibleLabel({ color: "#000000" })).toBe("#000000");
  });
});
