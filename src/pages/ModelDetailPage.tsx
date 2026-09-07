import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EcosystemIcon } from "@/components/library/EcosystemIcon";
import { FileFormatBadge } from "@/components/library/FileFormatBadge";
import { ModelFileInfo } from "@/components/model/ModelFileInfo";
import { ModelMetadata } from "@/components/model/ModelMetadata";
import { ModelViewerPlaceholder } from "@/components/model/ModelViewerPlaceholder";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { getFileEcosystem, getFileFormat } from "@/lib/filePresentation";
import { displayNameFromFilename } from "@/lib/format";

const ModelViewer = lazy(async () => {
  const module = await import("@/components/model/ModelViewer");
  return { default: module.ModelViewer };
});

function canPreview3d(extension: string): boolean {
  const normalized = extension.toLowerCase();
  return normalized === "stl" || normalized === "3mf";
}

function goBack(navigate: ReturnType<typeof useNavigate>) {
  const index = window.history.state?.idx;
  if (typeof index === "number" && index > 0) {
    navigate(-1);
    return;
  }
  navigate("/library");
}

export function ModelDetailPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { files, locations, ready } = useLibrary();
  const [viewerActive, setViewerActive] = useState(false);

  const file = fileId
    ? files.find((entry) => entry.libraryFileId === fileId)
    : undefined;
  const locationName = file
    ? locations.find((location) => location.path === file.locationPath)?.name
    : undefined;

  useEffect(() => {
    setViewerActive(false);
  }, [fileId]);

  if (!ready) {
    return (
      <section className="page page--model-detail">
        <p className="model-detail__loading">Loading model…</p>
      </section>
    );
  }

  if (!fileId || !file) {
    return (
      <section className="page page--model-detail">
        <EmptyState
          title="Model not found"
          description="This model is no longer in your library, or the link is invalid."
          action={
            <Link className="button button--primary" to="/library">
              Back to Library
            </Link>
          }
        />
      </section>
    );
  }

  const displayName = displayNameFromFilename(file.name);
  const format = getFileFormat(file);
  const ecosystem = getFileEcosystem(file);
  const previewable = canPreview3d(file.extension);

  return (
    <section className="page page--model-detail">
      <PageHeader
        title={displayName}
        subtitle={file.name}
        leading={
          <button
            type="button"
            className="button button--ghost page-header__back"
            onClick={() => goBack(navigate)}
          >
            <BackIcon />
            Back
          </button>
        }
      />

      <div className="model-detail__body">
        {viewerActive && previewable ? (
          <Suspense
            fallback={
              <div className="model-viewer model-viewer--message">
                <p>Loading 3D preview…</p>
              </div>
            }
          >
            <ModelViewer file={file} />
          </Suspense>
        ) : (
          <ModelViewerPlaceholder
            file={file}
            onActivate={previewable ? () => setViewerActive(true) : undefined}
          />
        )}

        {(format || ecosystem) ? (
          <div className="model-detail__badges">
            {format ? <FileFormatBadge format={format} /> : null}
            {ecosystem ? <EcosystemIcon ecosystem={ecosystem} /> : null}
          </div>
        ) : null}

        <ModelMetadata file={file} />
        <ModelFileInfo file={file} locationName={locationName} />
      </div>
    </section>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M8.5 2.5 4 7l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
