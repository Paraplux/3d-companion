import { useEffect, useMemo, useRef, useState } from "react";
import { CollectionCard } from "@/components/library/CollectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { toUserError } from "@/lib/libraryApi";

export function CollectionsPage() {
  const {
    files,
    collections,
    ready,
    createCollection,
    error,
    clearError,
  } = useLibrary();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const filesById = useMemo(() => {
    const map = new Map(files.map((file) => [file.libraryFileId, file]));
    return map;
  }, [files]);

  useEffect(() => {
    if (!createOpen) {
      return;
    }
    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!formRef.current?.contains(event.target as Node)) {
        setCreateOpen(false);
        setName("");
        setLocalError(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateOpen(false);
        setName("");
        setLocalError(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createOpen]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setLocalError(null);
    clearError();
    try {
      await createCollection(trimmed);
      setName("");
      setCreateOpen(false);
    } catch (err) {
      setLocalError(toUserError(err, "Could not create that collection."));
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

  const subtitle =
    collections.length === 0
      ? "Group models into intentional sets"
      : collections.length === 1
        ? "1 collection"
        : `${collections.length} collections`;

  return (
    <section className="page page--library">
      <PageHeader
        title="Collections"
        subtitle={subtitle}
        trailing={
          <div className="collections-create" ref={formRef}>
            <button
              type="button"
              className="button button--primary"
              aria-expanded={createOpen}
              onClick={() => {
                setCreateOpen((current) => !current);
                setLocalError(null);
                if (createOpen) {
                  setName("");
                }
              }}
            >
              New collection
            </button>

            {createOpen ? (
              <form
                className="collections-create__popover"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleCreate();
                }}
              >
                <label className="collections-create__label" htmlFor="collection-name">
                  Name
                </label>
                <input
                  id="collection-name"
                  ref={inputRef}
                  type="text"
                  className="collections-create__input"
                  value={name}
                  disabled={busy}
                  placeholder="e.g. Ghostface"
                  onChange={(event) => {
                    setName(event.target.value);
                    setLocalError(null);
                  }}
                />
                {localError || error ? (
                  <p className="collections-create__error" role="alert">
                    {localError ?? error}
                  </p>
                ) : null}
                <div className="collections-create__actions">
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() => {
                      setCreateOpen(false);
                      setName("");
                      setLocalError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={busy || !name.trim()}
                  >
                    Create
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        }
      />

      {collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="Create a collection to group models you want to keep together — print queues, gift ideas, themed sets."
          action={
            <button
              type="button"
              className="button button--primary"
              onClick={() => setCreateOpen(true)}
            >
              New collection
            </button>
          }
        />
      ) : (
        <div className="collections-grid">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              filesById={filesById}
            />
          ))}
        </div>
      )}
    </section>
  );
}
