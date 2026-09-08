import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ModelViewerPlaceholder } from "@/components/model/ModelViewerPlaceholder";
import { OpenInBambuStudioButton } from "@/components/model/OpenInBambuStudioButton";
import { PlateSelector } from "@/components/model/viewer/PlateSelector";
import { canOpenInBambuStudio } from "@/lib/bambuStudio";
import { getModelGeometry } from "@/lib/libraryApi";
import type { LibraryFile } from "@/types/library";

const ModelViewer = lazy(async () => {
  const module = await import("@/components/model/ModelViewer");
  return { default: module.ModelViewer };
});

type ModelPreviewProps = {
  file: LibraryFile;
};

function canPreview3d(extension: string): boolean {
  const normalized = extension.toLowerCase();
  return normalized === "stl" || normalized === "3mf";
}

function firstPlateId(file: LibraryFile): string | null {
  const plates = file.threemf?.project?.plates ?? [];
  if (plates.length === 0) {
    return null;
  }
  return [...plates].sort((a, b) => a.index - b.index)[0]?.id ?? null;
}

export function ModelPreview({ file }: ModelPreviewProps) {
  const plates = file.threemf?.project?.plates ?? [];
  const initialPlateId = useMemo(() => firstPlateId(file), [file]);
  const previewable = canPreview3d(file.extension);
  const canOpenBambu = canOpenInBambuStudio(file);

  const [selectedPlateId, setSelectedPlateId] = useState<string | null>(initialPlateId);
  const [viewerActive, setViewerActive] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);

  useEffect(() => {
    setSelectedPlateId(initialPlateId);
    setViewerActive(false);
    setCameraReset(0);
  }, [file.libraryFileId, initialPlateId]);

  // Prefetch only after the user opens the viewer; then warm the next plate.
  useEffect(() => {
    if (!viewerActive || !previewable) {
      return;
    }

    let cancelled = false;
    const plateForFile = file.extension.toLowerCase() === "3mf" ? selectedPlateId : null;
    const nextPlate = (file.threemf?.project?.plates ?? [])
      .filter((plate) => plate.id !== selectedPlateId)
      .sort((a, b) => a.index - b.index)[0];

    void (async () => {
      try {
        await getModelGeometry(file.libraryFileId, plateForFile, file.contentHash);
      } catch {
        return;
      }

      if (cancelled || !nextPlate) {
        return;
      }

      try {
        await getModelGeometry(file.libraryFileId, nextPlate.id, file.contentHash);
      } catch {
        // Prefetch is best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    file.contentHash,
    file.extension,
    file.libraryFileId,
    file.threemf?.project?.plates,
    previewable,
    selectedPlateId,
    viewerActive,
  ]);

  const showToolbar = plates.length > 1 || previewable || canOpenBambu;
  const analyzing =
    file.analysisStatus === "pending" || file.analysisStatus === "analyzing";

  return (
    <div className="model-viewer">
      <div className="model-viewer__stage">
        {viewerActive && previewable ? null : (
          <ModelViewerPlaceholder file={file} plateId={selectedPlateId} />
        )}
        {viewerActive && previewable ? (
          <Suspense
            fallback={
              <div className="model-viewer__overlay">
                <p>Loading viewer…</p>
              </div>
            }
          >
            <ModelViewer
              file={file}
              selectedPlateId={selectedPlateId}
              cameraReset={cameraReset}
            />
          </Suspense>
        ) : null}
      </div>

      {analyzing && !viewerActive ? (
        <p className="model-viewer__analysis-hint" role="status">
          Analyzing model… preview will update when ready.
        </p>
      ) : null}

      {file.analysisStatus === "error" && !viewerActive ? (
        <p className="model-viewer__analysis-hint model-viewer__analysis-hint--error" role="status">
          Analysis failed. You can still open the file or try Rescan from Library.
        </p>
      ) : null}

      {showToolbar ? (
        <div className="model-viewer__toolbar">
          <PlateSelector
            plates={plates}
            selectedPlateId={selectedPlateId ?? ""}
            onSelect={setSelectedPlateId}
          />

          <div className="model-viewer__actions">
            {viewerActive ? (
              <button
                type="button"
                className="button button--ghost"
                aria-label="Reset camera"
                title="Reset camera"
                onClick={() => setCameraReset((value) => value + 1)}
              >
                Reset
              </button>
            ) : null}

            {canOpenBambu ? <OpenInBambuStudioButton file={file} /> : null}

            {previewable ? (
              <button
                type="button"
                className={viewerActive ? "button button--ghost" : "button button--primary"}
                onClick={() => setViewerActive((active) => !active)}
                disabled={analyzing && file.analysisStatus !== "ready" && !file.threemf && !file.stl}
                title={
                  analyzing && !file.threemf && !file.stl
                    ? "Waiting for analysis…"
                    : undefined
                }
              >
                {viewerActive ? "Close 3D" : "View 3D"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
