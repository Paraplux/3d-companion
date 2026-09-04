import type { BambuMetadata, FilamentInfo } from "@/types/library";

const FALLBACK_SWATCH = "var(--text-tertiary)";

/** Resolve filament rows from new or legacy Bambu metadata. Never invents entries. */
export function resolveFilaments(bambu?: BambuMetadata | null): FilamentInfo[] {
  if (!bambu) {
    return [];
  }

  if (bambu.filaments && bambu.filaments.length > 0) {
    return bambu.filaments.filter((item) => item.material || item.color);
  }

  if (bambu.colors && bambu.colors.length > 0) {
    return bambu.colors.map((color) => ({
      material: bambu.filament,
      color,
    }));
  }

  if (bambu.filament || bambu.color) {
    return [
      {
        material: bambu.filament,
        color: bambu.color,
      },
    ];
  }

  return [];
}

/** Normalize a filament color string into a CSS color, or null if invalid. */
export function filamentCssColor(color?: string | null): string | null {
  if (!color) {
    return null;
  }

  const trimmed = color.trim();
  if (!trimmed) {
    return null;
  }

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    if (trimmed.length === 9) {
      return trimmed.slice(0, 7);
    }
    if (trimmed.length === 5) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }

  if (/^[0-9a-fA-F]{6}$/.test(trimmed) || /^[0-9a-fA-F]{8}$/.test(trimmed)) {
    return `#${trimmed.slice(0, 6)}`;
  }

  return null;
}

export function filamentSwatchStyle(color?: string | null): { backgroundColor: string } {
  return {
    backgroundColor: filamentCssColor(color) ?? FALLBACK_SWATCH,
  };
}

export function filamentAccessibleLabel(filament: FilamentInfo): string {
  const parts = [filament.material, filament.color].filter(Boolean);
  return parts.join(", ") || "Filament";
}

export function formatFilamentSummary(filament: FilamentInfo): string {
  return filamentAccessibleLabel(filament);
}
