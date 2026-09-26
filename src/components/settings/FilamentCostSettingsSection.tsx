import { useEffect, useState } from "react";
import { useFilamentCostSettings } from "@/hooks/useFilamentCostSettings";
import {
  DEFAULT_FILAMENT_COST,
  formatFilamentCost,
  pricePerGram,
} from "@/lib/filamentCost";

/**
 * Average spool price used to approximate filament cost on sliced 3MFs.
 */
export function FilamentCostSettingsSection() {
  const { settings, setSettings } = useFilamentCostSettings();
  const [priceDraft, setPriceDraft] = useState(String(settings.spoolPrice));
  const [gramsDraft, setGramsDraft] = useState(String(settings.spoolGrams));

  useEffect(() => {
    setPriceDraft(String(settings.spoolPrice));
    setGramsDraft(String(settings.spoolGrams));
  }, [settings.spoolPrice, settings.spoolGrams]);

  function commit() {
    const spoolPrice = Number(priceDraft.replace(",", "."));
    const spoolGrams = Number(gramsDraft.replace(",", "."));
    setSettings({
      ...settings,
      spoolPrice: Number.isFinite(spoolPrice) ? spoolPrice : settings.spoolPrice,
      spoolGrams: Number.isFinite(spoolGrams) ? spoolGrams : settings.spoolGrams,
    });
  }

  const example = formatFilamentCost(
    50 * pricePerGram(settings),
    settings.currency,
  );

  return (
    <section className="settings-block">
      <div className="settings-block__header">
        <div>
          <h2 className="settings-section__title">Filament cost</h2>
          <p className="settings-section__description">
            Rough estimate only — used when a 3MF has been sliced (weight from
            Bambu). Unsliced models show “Not sliced”. Example at current rate:
            50&nbsp;g ≈ {example}.
          </p>
        </div>
      </div>

      <div className="settings-form">
        <label className="settings-field settings-field--narrow">
          <span className="settings-field__label">Spool price ({settings.currency})</span>
          <input
            className="settings-field__input"
            type="number"
            min={0.01}
            step={0.5}
            inputMode="decimal"
            value={priceDraft}
            onChange={(event) => setPriceDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
            }}
          />
          <span className="settings-field__hint">
            Default {DEFAULT_FILAMENT_COST.spoolPrice} {DEFAULT_FILAMENT_COST.currency}
          </span>
        </label>

        <label className="settings-field settings-field--narrow">
          <span className="settings-field__label">Spool weight (g)</span>
          <input
            className="settings-field__input"
            type="number"
            min={1}
            step={100}
            inputMode="numeric"
            value={gramsDraft}
            onChange={(event) => setGramsDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
            }}
          />
          <span className="settings-field__hint">
            Usually 1000&nbsp;g (1&nbsp;kg)
          </span>
        </label>
      </div>
    </section>
  );
}
