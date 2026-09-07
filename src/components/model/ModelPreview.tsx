import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ModelViewerPlaceholder } from "@/components/model/ModelViewerPlaceholder";
import { PlateSelector } from "@/components/model/viewer/PlateSelector";
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

  const [selectedPlateId, setSelectedPlateId] = useState<string | null>(initialPlateId);
  const [viewerActive, setViewerActive] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);

  useEffect(() => {
    setSelectedPlateId(initialPlateId);
    setViewerActive(false);
    setCameraReset(0);
  }, [file.libraryFileId, initialPlateId]);

  useEffect(() => {
    if (!previewable) {
      return;
    }

    let cancelled = false;
    const plateForFile = file.extension.toLowerCase() === "3mf" ? selectedPlateId : null;
    const remaining = (file.threemf?.project?.plates ?? [])
      .filter((plate) => plate.id !== selectedPlateId)
      .sort((a, b) => a.index - b.index);

    void (async () => {
      try {
        await getModelGeometry(file.libraryFileId, plateForFile, file.contentHash);
      } catch {
        return;
      }

      for (const plate of remaining) {
        if (cancelled) {
          return;
        }
        try {
          await getModelGeometry(file.libraryFileId, plate.id, file.contentHash);
        } catch {
          // Keep prefetching other plates even if one fails.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    file.analysisStatus,
    file.contentHash,
    file.extension,
    file.libraryFileId,
    previewable,
    selectedPlateId,
  ]);

  const showToolbar = plates.length > 1 || previewable;

  return (
    <div className="model-viewer">
      <div className="model-viewer__stage">
        <ModelViewerPlaceholder file={file} plateId={selectedPlateId} />
        {viewerActive && previewable ? (
          <Suspense
            fallback={
              <div className="model-viewer__overlay">
                <p>Loading 3D preview…</p>
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

            {previewable ? (
              <button
                type="button"
                className={viewerActive ? "button button--ghost" : "button button--primary"}
                onClick={() => setViewerActive((active) => !active)}
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
