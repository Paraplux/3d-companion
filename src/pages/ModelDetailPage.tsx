import { Link, useNavigate, useParams } from "react-router-dom";
import { EcosystemIcon } from "@/components/library/EcosystemIcon";
import { FileFormatBadge } from "@/components/library/FileFormatBadge";
import { ModelFileInfo } from "@/components/model/ModelFileInfo";
import { ModelMetadata } from "@/components/model/ModelMetadata";
import { ModelViewerPlaceholder } from "@/components/model/ModelViewerPlaceholder";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLibrary } from "@/hooks/useLibrary";
import { getFileEcosystem, getFileFormat } from "@/lib/filePresentation";
import { displayNameFromFilename } from "@/lib/format";

export function ModelDetailPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { files, locations, ready } = useLibrary();

  const file = fileId
    ? files.find((entry) => entry.libraryFileId === fileId)
    : undefined;
  const locationName = file
    ? locations.find((location) => location.path === file.locationPath)?.name
    : undefined;

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

  return (
    <section className="page page--model-detail">
      <header className="model-detail__header">
        <button
          type="button"
          className="button button--ghost model-detail__back"
          onClick={() => navigate("/library")}
        >
          <BackIcon />
          Library
        </button>

        <h1 className="model-detail__header-title" title={displayName}>
          {displayName}
        </h1>

        <div className="model-detail__header-actions" aria-hidden="true">
          {/* Actions reserved for a later phase */}
        </div>
      </header>

      <div className="model-detail__body">
        <ModelViewerPlaceholder file={file} />

        <div className="model-detail__identity">
          {(format || ecosystem) && (
            <div className="model-detail__badges">
              {format ? <FileFormatBadge format={format} /> : null}
              {ecosystem ? <EcosystemIcon ecosystem={ecosystem} /> : null}
            </div>
          )}

          <h2 className="model-detail__name">{displayName}</h2>
          <p className="model-detail__filename">{file.name}</p>
        </div>

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
