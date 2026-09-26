import type { FilamentCostSettings } from "@/types/filamentCost";

export const FILAMENT_COST_STORAGE_KEY = "3d-library.filament-cost";

export const DEFAULT_FILAMENT_COST: FilamentCostSettings = {
  spoolPrice: 20,
  spoolGrams: 1000,
  currency: "EUR",
};

type Listener = () => void;

const listeners = new Set<Listener>();

/** Cached snapshot so useSyncExternalStore can compare by reference. */
let cachedSettings: FilamentCostSettings | null = null;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeFilamentCost(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clampPositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

export function normalizeFilamentCostSettings(
  raw: Partial<FilamentCostSettings> | null | undefined,
): FilamentCostSettings {
  return {
    spoolPrice: clampPositive(
      Number(raw?.spoolPrice),
      DEFAULT_FILAMENT_COST.spoolPrice,
    ),
    spoolGrams: clampPositive(
      Number(raw?.spoolGrams),
      DEFAULT_FILAMENT_COST.spoolGrams,
    ),
    currency:
      typeof raw?.currency === "string" && raw.currency.trim()
        ? raw.currency.trim().toUpperCase()
        : DEFAULT_FILAMENT_COST.currency,
  };
}

function settingsEqual(
  a: FilamentCostSettings,
  b: FilamentCostSettings,
): boolean {
  return (
    a.spoolPrice === b.spoolPrice &&
    a.spoolGrams === b.spoolGrams &&
    a.currency === b.currency
  );
}

export function readFilamentCostSettings(): FilamentCostSettings {
  let next: FilamentCostSettings;
  try {
    const stored = localStorage.getItem(FILAMENT_COST_STORAGE_KEY);
    next = stored
      ? normalizeFilamentCostSettings(
          JSON.parse(stored) as Partial<FilamentCostSettings>,
        )
      : { ...DEFAULT_FILAMENT_COST };
  } catch {
    next = { ...DEFAULT_FILAMENT_COST };
  }

  if (cachedSettings && settingsEqual(cachedSettings, next)) {
    return cachedSettings;
  }
  cachedSettings = next;
  return next;
}

export function writeFilamentCostSettings(
  next: FilamentCostSettings,
): FilamentCostSettings {
  const normalized = normalizeFilamentCostSettings(next);
  try {
    localStorage.setItem(FILAMENT_COST_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // localStorage may be unavailable
  }
  cachedSettings = normalized;
  emit();
  return normalized;
}

/** Euros (or currency) per gram from spool settings. */
export function pricePerGram(settings: FilamentCostSettings): number {
  const grams = clampPositive(settings.spoolGrams, DEFAULT_FILAMENT_COST.spoolGrams);
  const price = clampPositive(settings.spoolPrice, DEFAULT_FILAMENT_COST.spoolPrice);
  return price / grams;
}

/**
 * Approximate filament cost from sliced weight.
 * Returns null when weight is missing / invalid.
 */
export function estimateFilamentCost(
  weightGrams: number | null | undefined,
  settings: FilamentCostSettings,
): number | null {
  if (
    typeof weightGrams !== "number" ||
    !Number.isFinite(weightGrams) ||
    weightGrams <= 0
  ) {
    return null;
  }
  return weightGrams * pricePerGram(settings);
}

/** Format a currency amount for UI (approx filament cost). */
export function formatFilamentCost(
  amount: number,
  currency: string = DEFAULT_FILAMENT_COST.currency,
): string {
  if (!Number.isFinite(amount) || amount < 0) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export type FilamentCostDisplay =
  | { kind: "estimate"; amount: number; label: string }
  | { kind: "not-sliced"; label: string };

/**
 * UI label for a 3MF model: ~price when sliced weight exists, else "Not sliced".
 */
export function filamentCostDisplay(
  weightGrams: number | null | undefined,
  settings: FilamentCostSettings,
): FilamentCostDisplay {
  const amount = estimateFilamentCost(weightGrams, settings);
  if (amount === null) {
    return { kind: "not-sliced", label: "Not sliced" };
  }
  return {
    kind: "estimate",
    amount,
    label: `~${formatFilamentCost(amount, settings.currency)}`,
  };
}
