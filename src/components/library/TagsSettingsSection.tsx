import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ask } from "@tauri-apps/plugin-dialog";
import { useLibrary } from "@/hooks/useLibrary";
import { libraryHrefForTag } from "@/lib/libraryBrowse";
import type { Tag } from "@/types/library";

export function TagsSettingsSection() {
  const { tags, createTag, renameTag, deleteTag, error, clearError } = useLibrary();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const name = draft.trim();
    if (!name || busy) {
      return;
    }
    setBusy(true);
    try {
      await createTag(name);
      setDraft("");
    } catch {
      // Error via provider.
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(tag: Tag) {
    const name = editingName.trim();
    if (!name || busy) {
      return;
    }
    setBusy(true);
    try {
      await renameTag(tag.id, name);
      setEditingId(null);
      setEditingName("");
    } catch {
      // Error via provider.
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(tag: Tag) {
    const used = tag.fileCount > 0;
    const confirmed = await ask(
      used
        ? `Delete “${tag.name}”?\n\nIt is used on ${tag.fileCount} model${
            tag.fileCount === 1 ? "" : "s"
          }. The models themselves will not be deleted.`
        : `Delete “${tag.name}”?`,
      {
        title: "Delete tag",
        kind: "warning",
      },
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deleteTag(tag.id);
    } catch {
      // Error via provider.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-block">
      <div className="settings-block__header">
        <div>
          <h2 className="settings-section__title">Tags</h2>
          <p className="settings-section__description">
            Organize models with free-form labels. Tags stay with a model even if
            the file moves on disk.
          </p>
        </div>
      </div>

      {error ? (
        <div className="banner banner--error" role="alert">
          <p>{error}</p>
          <button type="button" className="banner__dismiss" onClick={clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <form
        className="tags-create"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <input
          type="text"
          value={draft}
          disabled={busy}
          placeholder="New tag name…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          className="button button--primary"
          disabled={busy || !draft.trim()}
        >
          Create
        </button>
      </form>

      {tags.length === 0 ? (
        <p className="settings-empty">No tags yet.</p>
      ) : (
        <ul className="tag-list">
          {tags.map((tag) => {
            const editing = editingId === tag.id;
            return (
              <li key={tag.id} className="tag-list__item">
                {editing ? (
                  <form
                    className="tag-list__edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleRename(tag);
                    }}
                  >
                    <input
                      type="text"
                      value={editingName}
                      autoFocus
                      disabled={busy}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                    <button
                      type="submit"
                      className="button button--primary"
                      disabled={busy || !editingName.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => {
                        setEditingId(null);
                        setEditingName("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="tag-list__main"
                      onClick={() => navigate(libraryHrefForTag(tag.id))}
                      title={`Show models tagged ${tag.name}`}
                    >
                      <span className="tag-list__name">{tag.name}</span>
                      <span className="tag-list__count">{tag.fileCount}</span>
                    </button>
                    <div className="tag-list__actions">
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditingName(tag.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => void handleDelete(tag)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
