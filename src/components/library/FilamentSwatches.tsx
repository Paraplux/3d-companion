import { HoverTooltip } from "@/components/ui/HoverTooltip";
import {
  filamentAccessibleLabel,
  filamentSwatchStyle,
  formatFilamentSummary,
} from "@/lib/filaments";
import type { FilamentInfo } from "@/types/library";

const MAX_VISIBLE_SWATCHES = 4;

type FilamentSwatchesProps = {
  filaments: FilamentInfo[];
  /** When false, omit the inline "Filaments" label (useful in labeled metadata rows). */
  showLabel?: boolean;
};

function FilamentListTooltip({ filaments }: { filaments: FilamentInfo[] }) {
  return (
    <div className="filament-tooltip">
      <p className="filament-tooltip__title">Filaments</p>
      <ul className="filament-tooltip__list">
        {filaments.map((filament, index) => (
          <li key={`${filament.material ?? ""}-${filament.color ?? ""}-${index}`}>
            <span
              className="filament-swatch filament-swatch--tooltip"
              style={filamentSwatchStyle(filament.color)}
              aria-hidden="true"
            />
            <span className="filament-tooltip__text">
              {filament.material ? (
                <span className="filament-tooltip__material">{filament.material}</span>
              ) : null}
              {filament.color ? (
                <span className="filament-tooltip__color">{filament.color}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwatchTooltip({ filament }: { filament: FilamentInfo }) {
  return (
    <div className="filament-tooltip filament-tooltip--single">
      {filament.material ? (
        <span className="filament-tooltip__material">{filament.material}</span>
      ) : null}
      {filament.color ? (
        <span className="filament-tooltip__color">{filament.color}</span>
      ) : null}
    </div>
  );
}

export function FilamentSwatches({
  filaments,
  showLabel = true,
}: FilamentSwatchesProps) {
  if (filaments.length === 0) {
    return null;
  }

  const visible = filaments.slice(0, MAX_VISIBLE_SWATCHES);
  const overflow = filaments.length - visible.length;
  const groupLabel =
    filaments.length === 1 ? "1 filament" : `${filaments.length} filaments`;

  return (
    <div className="filament-row" aria-label={groupLabel}>
      {showLabel ? (
        <HoverTooltip content={<FilamentListTooltip filaments={filaments} />}>
          <span className="filament-row__label">Filaments</span>
        </HoverTooltip>
      ) : null}

      <div className="filament-row__swatches" role="list" aria-label={groupLabel}>
        {visible.map((filament, index) => (
          <HoverTooltip
            key={`${filament.color ?? "none"}-${index}`}
            content={<SwatchTooltip filament={filament} />}
            className="filament-row__swatch-wrap"
          >
            <span
              className="filament-swatch"
              style={filamentSwatchStyle(filament.color)}
              role="listitem"
              aria-label={filamentAccessibleLabel(filament)}
              title={formatFilamentSummary(filament)}
            />
          </HoverTooltip>
        ))}

        {overflow > 0 ? (
          <HoverTooltip
            content={<FilamentListTooltip filaments={filaments} />}
            className="filament-row__more-wrap"
          >
            <span className="filament-row__more" aria-label={`${overflow} more filaments`}>
              +{overflow}
            </span>
          </HoverTooltip>
        ) : null}
      </div>
    </div>
  );
}
