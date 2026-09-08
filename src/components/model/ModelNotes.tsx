import { useEffect, useState } from "react";
import { useLibrary } from "@/hooks/useLibrary";
import { toUserError } from "@/lib/libraryApi";
import type { LibraryFileId } from "@/types/libraryData";

type ModelNotesProps = {
  libraryFileId: LibraryFileId;
};

type SaveStatus = "saved" | "unsaved" | "saving";

export function ModelNotes({ libraryFileId }: ModelNotesProps) {
  const {
    noteForLibraryFile,
    upsertFileNote,
    deleteFileNote,
    ready,
    error,
    clearError,
  } = useLibrary();

  const saved = noteForLibraryFile(libraryFileId);
  const [draft, setDraft] = useState(saved?.content ?? "");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(saved?.content ?? "");
    setStatus("saved");
    setLocalError(null);
  }, [libraryFileId, saved?.content, saved?.updatedAt]);

  const trimmedDraft = draft.trim();
  const savedContent = saved?.content ?? "";
  const isDirty = trimmedDraft !== savedContent;
  const displayStatus: SaveStatus = busy
    ? "saving"
    : isDirty
      ? "unsaved"
      : status;

  async function handleSave() {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus("saving");
    setLocalError(null);
    clearError();
    try {
      await upsertFileNote(libraryFileId, draft);
      setStatus("saved");
    } catch (err) {
      setLocalError(toUserError(err, "Could not save that note."));
      setStatus("unsaved");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy || (!saved && !trimmedDraft)) {
      return;
    }
    setBusy(true);
    setStatus("saving");
    setLocalError(null);
    clearError();
    try {
      if (saved) {
        await deleteFileNote(libraryFileId);
      }
      setDraft("");
      setStatus("saved");
    } catch (err) {
      setLocalError(toUserError(err, "Could not delete that note."));
      setStatus("unsaved");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <section className="model-meta-section model-notes">
        <h2 className="model-meta-section__title">Notes</h2>
        <p className="model-notes__hint">Loading…</p>
      </section>
    );
  }

  const statusLabel =
    displayStatus === "saving"
      ? "Saving…"
      : displayStatus === "unsaved"
        ? "Unsaved changes"
        : saved
          ? "Saved"
          : "No note yet";

  return (
    <section className="model-meta-section model-notes">
      <div className="model-notes__header">
        <h2 className="model-meta-section__title">Notes</h2>
        <span
          className={
            displayStatus === "unsaved"
              ? "model-notes__status model-notes__status--unsaved"
              : "model-notes__status"
          }
        >
          {statusLabel}
        </span>
      </div>

      <textarea
        className="model-notes__textarea"
        value={draft}
        disabled={busy}
        rows={4}
        placeholder="Add a note — print settings, reminders, results…"
        aria-label="File note"
        onChange={(event) => {
          setDraft(event.target.value);
          setLocalError(null);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void handleSave();
          }
        }}
      />

      {localError || error ? (
        <p className="model-notes__error" role="alert">
          {localError ?? error}
        </p>
      ) : null}

      <div className="model-notes__actions">
        {saved || trimmedDraft ? (
          <button
            type="button"
            className="button button--ghost"
            disabled={busy}
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !isDirty}
          onClick={() => void handleSave()}
        >
          Save
        </button>
      </div>
    </section>
  );
}
