import type { ReactNode } from "react";
import { FilamentSwatches } from "@/components/library/FilamentSwatches";
import { useFilamentCostSettings } from "@/hooks/useFilamentCostSettings";
import { filamentCostDisplay } from "@/lib/filamentCost";
import { resolveFilaments } from "@/lib/filaments";
import {
  formatEstimatedPrintTime,
  formatTriangleCount,
} from "@/lib/format";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import type { LibraryFile } from "@/types/library";

type ModelMetadataProps = {
  file: LibraryFile;
};

type MetaRow = {
  label: string;
  value: ReactNode;
};

function MetaSection({ title, rows }: { title: string; rows: MetaRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="model-meta-section">
      <h2 className="model-meta-section__title">{title}</h2>
      <dl className="model-meta-list">
        {rows.map((row) => (
          <div key={row.label} className="model-meta-list__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function isThreeMf(file: LibraryFile): boolean {
  return file.extension.replace(/^\./, "").toLowerCase() === "3mf";
}

function resolveWeightGrams(file: LibraryFile): number | undefined {
  const bambu = file.threemf?.bambu;
  if (typeof bambu?.weightGrams === "number" && bambu.weightGrams > 0) {
    return bambu.weightGrams;
  }
  const plates = file.threemf?.project?.plates ?? [];
  let total = 0;
  let any = false;
  for (const plate of plates) {
    if (typeof plate.weightGrams === "number" && plate.weightGrams > 0) {
      total += plate.weightGrams;
      any = true;
    }
  }
  return any ? total : undefined;
}

/** True once we know whether slice weight exists (avoid flashing Not sliced). */
function canShowFilamentCost(file: LibraryFile): boolean {
  if (!isThreeMf(file)) {
    return false;
  }
  if (file.threemf) {
    return true;
  }
  // Cloud: wait for prepareRemoteFilePreview to hydrate threemf.
  if (isRemoteLibraryFile(file)) {
    return false;
  }
  return file.analysisStatus === "ready" || file.analysisStatus === "error";
}

function buildPrintRows(
  file: LibraryFile,
  costLabel: string | null,
): MetaRow[] {
  const bambu = file.threemf?.bambu;
  const projectPlates = file.threemf?.project?.plates?.length ?? 0;
  const plateCount = bambu?.plateCount ?? (projectPlates > 0 ? projectPlates : undefined);

  if (!bambu && projectPlates === 0 && !costLabel) {
    return [];
  }

  const rows: MetaRow[] = [];
  const filaments = resolveFilaments(bambu);

  if (bambu?.printer) {
    rows.push({ label: "Printer", value: bambu.printer });
  }
  if (bambu?.nozzle) {
    rows.push({ label: "Nozzle", value: bambu.nozzle });
  }
  if (filaments.length > 0) {
    rows.push({
      label: "Filaments",
      value: <FilamentSwatches filaments={filaments} showLabel={false} />,
    });
  }
  if (bambu?.layerHeight) {
    rows.push({ label: "Layer height", value: bambu.layerHeight });
  }
  if (bambu?.infill) {
    rows.push({ label: "Infill", value: bambu.infill });
  }
  if (typeof bambu?.weightGrams === "number") {
    rows.push({ label: "Weight", value: `${bambu.weightGrams.toFixed(1)} g` });
  }
  if (costLabel) {
    rows.push({
      label: "Est. filament",
      value: costLabel,
    });
  }
  if (typeof bambu?.estimatedTimeSeconds === "number") {
    const formatted = formatEstimatedPrintTime(bambu.estimatedTimeSeconds);
    if (formatted) {
      rows.push({ label: "Estimated time", value: formatted });
    }
  }
  if (typeof plateCount === "number" && plateCount > 0) {
    rows.push({
      label: "Plates",
      value: String(plateCount),
    });
  }

  return rows;
}

function buildGeometryRows(file: LibraryFile): MetaRow[] {
  const stl = file.stl;
  if (!stl) {
    return [];
  }

  const rows: MetaRow[] = [];
  const dims = stl.dimensionsMm;
  if (dims) {
    const x = dims.x.toFixed(dims.x >= 10 ? 0 : 1);
    const y = dims.y.toFixed(dims.y >= 10 ? 0 : 1);
    const z = dims.z.toFixed(dims.z >= 10 ? 0 : 1);
    rows.push({ label: "Dimensions", value: `${x} × ${y} × ${z} mm` });
  }
  if (typeof stl.triangleCount === "number" && stl.triangleCount > 0) {
    rows.push({
      label: "Triangles",
      value: formatTriangleCount(stl.triangleCount),
    });
  }

  return rows;
}

export function ModelMetadata({ file }: ModelMetadataProps) {
  const { settings } = useFilamentCostSettings();

  const costLabel = canShowFilamentCost(file)
    ? filamentCostDisplay(resolveWeightGrams(file), settings).label
    : null;

  const printRows = buildPrintRows(file, costLabel);
  const geometryRows = buildGeometryRows(file);

  if (printRows.length === 0 && geometryRows.length === 0) {
    return null;
  }

  return (
    <div className="model-metadata">
      <MetaSection title="Print" rows={printRows} />
      <MetaSection title="Geometry" rows={geometryRows} />
    </div>
  );
}
