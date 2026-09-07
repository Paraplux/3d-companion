import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ask } from "@tauri-apps/plugin-dialog";
import { FileCard } from "@/components/library/FileCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import {
  formatCollectionCount,
  resolveCollectionFiles,
} from "@/lib/collections";
import { toUserError } from "@/lib/libraryApi";

export function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const {
    files,
    locations,
    collections,
    fileCollectionMap,
    ready,
    renameCollection,
    deleteCollection,
    removeFileFromCollection,
    error,
    clearError,
  } = useLibrary();

  const collection = collectionId
    ? collections.find((entry) => entry.id === collectionId)
    : undefined;

  const fileIds = useMemo(() => {
    if (!collectionId) {
      return [];
    }
    const ids: string[] = [];
    for (const [libraryFileId, collectionIds] of Object.entries(fileCollectionMap)) {
      if (collectionIds.includes(collectionId)) {
        ids.push(libraryFileId);
      }
    }
    return ids;
  }, [collectionId, fileCollectionMap]);

  const models = useMemo(
    () => resolveCollectionFiles(files, fileIds),
    [fileIds, files],
  );

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleRename() {
    if (!collection) {
      return;
    }
    const trimmed = draftName.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setLocalError(null);
    clearError();
    try {
      await renameCollection(collection.id, trimmed);
      setRenaming(false);
    } catch (err) {
      setLocalError(toUserError(err, "Could not rename that collection."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!collection) {
      return;
    }
    const confirmed = await ask(
      collection.fileCount > 0
        ? `Delete “${collection.name}”?\n\nIt contains ${collection.fileCount} model${
            collection.fileCount === 1 ? "" : "s"
          }. The models themselves will not be deleted.`
        : `Delete “${collection.name}”?`,
      {
        title: "Delete collection",
        kind: "warning",
      },
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deleteCollection(collection.id);
      navigate("/collections");
    } catch (err) {
      setLocalError(toUserError(err, "Could not delete that collection."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <section className="page">
        <p className="page-loading">Loading…</p>
      </section>
    );
  }

  if (!collectionId || !collection) {
    return (
      <section className="page">
        <EmptyState
          title="Collection not found"
          description="This collection may have been deleted."
          action={
            <Link className="button button--primary" to="/collections">
              Back to Collections
            </Link>
          }
        />
      </section>
    );
  }

  const subtitle = formatCollectionCount(collection.fileCount);

  return (
    <section className="page page--library">
      <PageHeader
        title={collection.name}
        subtitle={subtitle}
        trailing={
          <div className="collection-detail__actions">
            {renaming ? (
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
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => {
                    setDraftName(collection.name);
                    setRenaming(true);
                    setLocalError(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        }
      />

      <p className="collection-detail__back">
        <Link to="/collections">← Collections</Link>
      </p>

      {renaming ? (
        <form
          className="collection-detail__rename"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRename();
          }}
        >
          <label className="collection-detail__rename-label" htmlFor="rename-collection">
            Name
          </label>
          <input
            id="rename-collection"
            type="text"
            className="collection-detail__rename-input"
            value={draftName}
            disabled={busy}
            autoFocus
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
        </form>
      ) : null}

      {localError || error ? (
        <div className="banner banner--error" role="alert">
          <p>{localError ?? error}</p>
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

      {models.length === 0 ? (
        <EmptyState
          title="No models in this collection"
          description="Add models from their detail page, or keep this collection as a placeholder for later."
          action={
            <Link className="button button--primary" to="/library">
              Browse Library
            </Link>
          }
        />
      ) : (
        <div className="library-grid">
          {models.map((file) => (
            <FileCard
              key={file.libraryFileId}
              file={file}
              showPath
              showLocation={locations.length > 1}
              locationName={
                locations.find((location) => location.path === file.locationPath)
                  ?.name
              }
              onRemoveFromCollection={() =>
                void removeFileFromCollection(file.libraryFileId, collection.id)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
