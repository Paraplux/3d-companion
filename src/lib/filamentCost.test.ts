import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILAMENT_COST,
  estimateFilamentCost,
  filamentCostDisplay,
  formatFilamentCost,
  normalizeFilamentCostSettings,
  pricePerGram,
} from "@/lib/filamentCost";

describe("filamentCost", () => {
  it("defaults to 20 EUR / 1000 g", () => {
    expect(pricePerGram(DEFAULT_FILAMENT_COST)).toBe(0.02);
  });

  it("estimates cost from weight", () => {
    expect(estimateFilamentCost(45, DEFAULT_FILAMENT_COST)).toBeCloseTo(0.9, 5);
    expect(estimateFilamentCost(0, DEFAULT_FILAMENT_COST)).toBeNull();
    expect(estimateFilamentCost(undefined, DEFAULT_FILAMENT_COST)).toBeNull();
  });

  it("shows Not sliced when weight is missing", () => {
    expect(filamentCostDisplay(undefined, DEFAULT_FILAMENT_COST)).toEqual({
      kind: "not-sliced",
      label: "Not sliced",
    });
  });

  it("shows approximate currency when sliced", () => {
    const display = filamentCostDisplay(50, DEFAULT_FILAMENT_COST);
    expect(display).toEqual({
      kind: "estimate",
      amount: 1,
      label: `~${formatFilamentCost(1, "EUR")}`,
    });
  });

  it("normalizes invalid settings to defaults", () => {
    expect(
      normalizeFilamentCostSettings({ spoolPrice: -1, spoolGrams: 0 }),
    ).toEqual(DEFAULT_FILAMENT_COST);
  });
});
