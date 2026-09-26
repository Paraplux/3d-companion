import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { EcosystemIcon } from "@/components/library/EcosystemIcon";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import { FileFormatBadge } from "@/components/library/FileFormatBadge";
import { LibraryBreadcrumbs } from "@/components/library/LibraryBreadcrumbs";
import { ModelFileInfo } from "@/components/model/ModelFileInfo";
import { ModelMetadata } from "@/components/model/ModelMetadata";
import { ModelPreview } from "@/components/model/ModelPreview";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { getFileEcosystem, getFileFormat } from "@/lib/filePresentation";
import { displayNameFromFilename } from "@/lib/format";
import {
  fileParentDir,
  libraryBrowseHref,
} from "@/lib/libraryBrowse";
import { toUserError } from "@/lib/libraryApi";
import {
  returnActionLabel,
  returnLabelFromPath,
} from "@/lib/navigationReturn";
import { ModelCollections } from "@/components/model/ModelCollections";
import { ModelNotes } from "@/components/model/ModelNotes";
import { ModelProjects } from "@/components/model/ModelProjects";
import { ModelTags } from "@/components/model/ModelTags";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";

type DetailLocationState = {
  libraryReturnTo?: string;
};

export function ModelDetailPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    files,
    locations,
    ready,
    deleteCloudFile,
    renameCloudFile,
    error,
    clearError,
  } = useLibrary();
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const returnTo =
    (location.state as DetailLocationState | null)?.libraryReturnTo ?? "/library";
  const returnLabel = returnLabelFromPath(returnTo);

  const file = fileId
    ? files.find((entry) => entry.libraryFileId === fileId)
    : undefined;
  const locationName = file
    ? locations.find((locationEntry) => locationEntry.path === file.locationPath)?.name
    : undefined;

  const breadcrumbItems = useMemo(() => {
    if (!file) {
      return [];
    }

    const displayName = displayNameFromFilename(file.name);
    const items: Array<{ label: string; onClick?: () => void }> = [
      {
        label: returnLabel,
        onClick: () => navigate(returnTo),
      },
    ];

    // Only show folder crumbs when returning to Library (not Favorites / Collection / Project).
    if (returnLabel === "Library" && locationName) {
      items.push({
        label: locationName,
        onClick: () =>
          navigate(
            libraryBrowseHref({
              locationPath: file.locationPath,
              relativeDir: "",
            }),
          ),
      });

      const folderPath = fileParentDir(file.relativePath);
      if (folderPath) {
        const segments = folderPath.split("/").filter(Boolean);
        let accumulated = "";
        for (const segment of segments) {
          accumulated = accumulated ? `${accumulated}/${segment}` : segment;
          const relativeDir = accumulated;
          items.push({
            label: segment,
            onClick: () =>
              navigate(
                libraryBrowseHref({
                  locationPath: file.locationPath,
                  relativeDir,
                }),
              ),
          });
        }
      }
    }

    items.push({ label: displayName });
    return items;
  }, [file, locationName, navigate, returnLabel, returnTo]);

  async function handleDeleteFromCloud() {
    if (!file) {
      return;
    }
    setLocalError(null);
    clearError();
    setDeleting(true);
    try {
      const deleted = await deleteCloudFile(file.libraryFileId);
      if (deleted) {
        navigate(returnTo, { replace: true });
      }
    } catch (err) {
      setLocalError(toUserError(err, "Could not delete that file from the cloud."));
    } finally {
      setDeleting(false);
    }
  }

  async function handleRename() {
    if (!file) {
      return;
    }
    const trimmed = draftName.trim();
    if (!trimmed) {
      setLocalError("A name is required.");
      return;
    }
    if (trimmed === displayNameFromFilename(file.name)) {
      setRenaming(false);
      return;
    }

    setBusy(true);
    setLocalError(null);
    clearError();
    try {
      // Send stem only — server keeps/re-appends the current extension.
      await renameCloudFile(file.libraryFileId, trimmed);
      setRenaming(false);
    } catch (err) {
      setLocalError(toUserError(err, "Could not rename that file."));
    } finally {
      setBusy(false);
    }
  }

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
            <Link className="button button--primary" to={returnTo}>
              {returnActionLabel(returnTo)}
            </Link>
          }
        />
      </section>
    );
  }

  const displayName = displayNameFromFilename(file.name);
  const format = getFileFormat(file);
  const ecosystem = getFileEcosystem(file);
  const isRemote = isRemoteLibraryFile(file);
  const analyzing =
    !isRemote &&
    (file.analysisStatus === "pending" || file.analysisStatus === "analyzing");
  const bannerError = localError ?? error;
  const actionsDisabled = deleting || busy;

  return (
    <section className="page page--model-detail">
      <div className="model-detail__top">
        <PageHeader
          title={displayName}
          subtitle={file.name}
          trailing={
            <div className="model-detail__actions">
              <FavoriteButton libraryFileId={file.libraryFileId} variant="label" />
              {isRemote ? (
                renaming ? (
                  <>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={busy}
                      onClick={() => {
                        setRenaming(false);
                        setLocalError(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy || !draftName.trim()}
                      onClick={() => void handleRename()}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={actionsDisabled}
                      onClick={() => {
                        setDraftName(displayNameFromFilename(file.name));
                        setRenaming(true);
                        setLocalError(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={actionsDisabled}
                      onClick={() => void handleDeleteFromCloud()}
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </>
                )
              ) : null}
            </div>
          }
        />
        <LibraryBreadcrumbs items={breadcrumbItems} />
      </div>

      {renaming && isRemote ? (
        <form
          className="model-detail__rename"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRename();
          }}
        >
          <label className="model-detail__rename-label" htmlFor="rename-model">
            Name
          </label>
          <input
            id="rename-model"
            type="text"
            className="model-detail__rename-input"
            value={draftName}
            disabled={busy}
            autoFocus
            placeholder="chassis-v2"
            onChange={(event) => {
              setDraftName(event.target.value);
              setLocalError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setRenaming(false);
                setLocalError(null);
              }
            }}
          />
          <p className="model-detail__rename-hint">
            Extension (.{file.extension}) is kept automatically.
          </p>
        </form>
      ) : null}

      {bannerError ? (
        <div className="banner banner--error" role="alert">
          <p>{bannerError}</p>
          <button
            type="button"
            className="banner__dismiss"
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="model-detail__body">
        {analyzing ? (
          <p className="model-detail__status" role="status">
            Analyzing model… metadata and preview will update when ready.
          </p>
        ) : null}
        {isRemote ? (
          <p className="model-detail__status" role="status">
            Stored in the cloud. Plate previews download automatically on open;
            Bambu Studio reuses the same local cache.
          </p>
        ) : null}
        {file.analysisStatus === "error" && !isRemote ? (
          <p className="model-detail__status model-detail__status--error" role="status">
            Analysis failed
            {file.analysisError ? `: ${file.analysisError}` : "."} You can still
            open the file or rescan from Library.
          </p>
        ) : null}

        <ModelPreview file={file} />

        {(format || ecosystem) ? (
          <div className="model-detail__badges">
            {format ? <FileFormatBadge format={format} /> : null}
            {ecosystem ? <EcosystemIcon ecosystem={ecosystem} /> : null}
          </div>
        ) : null}

        <ModelTags libraryFileId={file.libraryFileId} />
        <ModelProjects libraryFileId={file.libraryFileId} />
        <ModelCollections libraryFileId={file.libraryFileId} />
        <ModelNotes libraryFileId={file.libraryFileId} />
        <ModelMetadata file={file} />
        <ModelFileInfo file={file} locationName={locationName} />
      </div>
    </section>
  );
}
