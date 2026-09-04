import { convertFileSrc } from "@tauri-apps/api/core";
import type { ThreeMfPlate } from "@/types/library";

type PlateSelectorProps = {
  plates: ThreeMfPlate[];
  selectedPlateId: string;
  onSelect: (plateId: string) => void;
};

export function PlateSelector({ plates, selectedPlateId, onSelect }: PlateSelectorProps) {
  if (plates.length <= 1) {
    return null;
  }

  return (
    <div className="model-viewer__plates" role="tablist" aria-label="Plates">
      {plates.map((plate) => {
        const selected = plate.id === selectedPlateId;
        const label = plate.name?.trim() || `Plate ${plate.index}`;
        const thumb = plate.thumbnailPath ? convertFileSrc(plate.thumbnailPath) : null;

        return (
          <button
            key={plate.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={label}
            title={label}
            className={
              selected
                ? "model-viewer__plate is-selected"
                : "model-viewer__plate"
            }
            onClick={() => onSelect(plate.id)}
          >
            {thumb ? (
              <img src={thumb} alt="" className="model-viewer__plate-thumb" />
            ) : null}
            <span>{plate.index}</span>
          </button>
        );
      })}
    </div>
  );
}
