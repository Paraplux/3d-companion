import { describe, expect, it } from "vitest";
import {
  displayNameFromFilename,
  formatEstimatedPrintTime,
  formatModifiedDate,
  formatTriangleCount,
} from "@/lib/format";

describe("displayNameFromFilename", () => {
  it("strips the last extension", () => {
    expect(displayNameFromFilename("18650+Box_2.3mf")).toBe("18650+Box_2");
    expect(displayNameFromFilename("hodde.stl")).toBe("hodde");
  });
});

describe("formatModifiedDate", () => {
  it("formats a unix-millis timestamp", () => {
    const value = formatModifiedDate(Date.UTC(2026, 8, 3));
    expect(value.length).toBeGreaterThan(0);
    expect(value).toMatch(/2026/);
  });

  it("returns empty for invalid values", () => {
    expect(formatModifiedDate(0)).toBe("");
    expect(formatModifiedDate(Number.NaN)).toBe("");
  });
});

describe("formatTriangleCount", () => {
  it("formats with locale separators", () => {
    expect(formatTriangleCount(24582)).toMatch(/24/);
  });
});

describe("formatEstimatedPrintTime", () => {
  it("formats hours and minutes", () => {
    expect(formatEstimatedPrintTime(3660)).toBe("1h 1m");
    expect(formatEstimatedPrintTime(120)).toBe("2m");
    expect(formatEstimatedPrintTime(0)).toBeNull();
  });
});
