import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { DownloadRemoteFileButton } from "@/components/model/DownloadRemoteFileButton";
import { ModelViewerPlaceholder } from "@/components/model/ModelViewerPlaceholder";
import { OpenInBambuStudioButton } from "@/components/model/OpenInBambuStudioButton";
import { PlateSelector } from "@/components/model/viewer/PlateSelector";
import { useLibrary } from "@/hooks/useLibrary";
import { canOpenInBambuStudio } from "@/lib/bambuStudio";
import { getModelGeometryForFile } from "@/lib/libraryApi";
import { prepareRemoteFilePreview } from "@/lib/remoteApi";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
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
  const { patchLibraryFile } = useLibrary();
  const plates = file.threemf?.project?.plates ?? [];
  const initialPlateId = useMemo(() => firstPlateId(file), [file]);
  const isRemote = isRemoteLibraryFile(file);
  const extension = file.extension.toLowerCase();
  /** Remote 3MF needs local analysis (threemf) before View 3D / plates. */
  const needsRemoteThreemf = isRemote && extension === "3mf" && !file.threemf;
  const remotePreviewReady =
    !isRemote || extension === "stl" || Boolean(file.threemf);
  const canOpenBambu = canOpenInBambuStudio(file);

  const [selectedPlateId, setSelectedPlateId] = useState<string | null>(initialPlateId);
  const [viewerActive, setViewerActive] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);
  const [platePhase, setPlatePhase] = useState<"idle" | "downloading" | "analyzing">(
    "idle",
  );

  const previewable =
    canPreview3d(file.extension) && remotePreviewReady && platePhase === "idle";

  useEffect(() => {
    setSelectedPlateId(initialPlateId);
    setViewerActive(false);
    setCameraReset(0);
  }, [file.libraryFileId, initialPlateId]);

  // Cache (download if needed) + analyze cloud 3MF so plates + View 3D work.
  useEffect(() => {
    if (!needsRemoteThreemf) {
      return;
    }

    let cancelled = false;
    setPlatePhase("downloading");

    void prepareRemoteFilePreview(
      file.libraryFileId,
      file.contentHash,
      file.name,
      file.extension,
    )
      .then((result) => {
        if (cancelled || !result.available) {
          return;
        }
        setPlatePhase("analyzing");
        patchLibraryFile(file.libraryFileId, {
          threemf: result.threemf,
          stl: result.stl,
          analysisStatus: "ready",
          ...(result.thumbnailPath
            ? { thumbnailPath: result.thumbnailPath }
            : {}),
        });
      })
      .catch(() => {
        // Keep cloud thumbnail only.
      })
      .finally(() => {
        if (!cancelled) {
          setPlatePhase("idle");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    file.contentHash,
    file.extension,
    file.libraryFileId,
    file.name,
    needsRemoteThreemf,
    patchLibraryFile,
  ]);

  // Prefetch only after the user opens the viewer; then warm the next plate.
  useEffect(() => {
    if (!viewerActive || !previewable) {
      return;
    }

    let cancelled = false;
    const plateForFile = extension === "3mf" ? selectedPlateId : null;
    const nextPlate = (file.threemf?.project?.plates ?? [])
      .filter((plate) => plate.id !== selectedPlateId)
      .sort((a, b) => a.index - b.index)[0];

    void (async () => {
      try {
        await getModelGeometryForFile(file, plateForFile);
      } catch {
        return;
      }

      if (cancelled || !nextPlate) {
        return;
      }

      try {
        await getModelGeometryForFile(file, nextPlate.id);
      } catch {
        // Prefetch is best-effort.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [extension, file, previewable, selectedPlateId, viewerActive]);

  const showToolbar =
    plates.length > 1 || canPreview3d(file.extension) || canOpenBambu || isRemote;
  const plateHydrating = platePhase !== "idle";
  const analyzing =
    (!isRemote &&
      (file.analysisStatus === "pending" || file.analysisStatus === "analyzing")) ||
    plateHydrating;

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
          {platePhase === "downloading"
            ? "Downloading model for previews…"
            : platePhase === "analyzing"
              ? "Reading plate previews…"
              : "Analyzing model… preview will update when ready."}
        </p>
      ) : null}

      {file.analysisStatus === "error" && !viewerActive && !isRemote ? (
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

            {isRemote ? <DownloadRemoteFileButton file={file} /> : null}
            {canOpenBambu ? <OpenInBambuStudioButton file={file} /> : null}

            {canPreview3d(file.extension) ? (
              <button
                type="button"
                className={viewerActive ? "button button--ghost" : "button button--primary"}
                onClick={() => setViewerActive((active) => !active)}
                disabled={!previewable}
                title={
                  !previewable
                    ? isRemote && plateHydrating
                      ? "Downloading model…"
                      : "Waiting for analysis…"
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
