import { Link, useNavigate, useParams } from "react-router-dom";
import { EcosystemIcon } from "@/components/library/EcosystemIcon";
import { FileFormatBadge } from "@/components/library/FileFormatBadge";
import { ModelFileInfo } from "@/components/model/ModelFileInfo";
import { ModelMetadata } from "@/components/model/ModelMetadata";
import { ModelPreview } from "@/components/model/ModelPreview";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { getFileEcosystem, getFileFormat } from "@/lib/filePresentation";
import { displayNameFromFilename } from "@/lib/format";

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
        <ModelPreview file={file} />

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
