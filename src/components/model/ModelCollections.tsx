import { useEffect, useMemo, useRef, useState } from "react";
import { CollectionPill } from "@/components/library/CollectionPill";
import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type ModelCollectionsProps = {
  libraryFileId: LibraryFileId;
};

export function ModelCollections({ libraryFileId }: ModelCollectionsProps) {
  const {
    collections,
    collectionsForLibraryFile,
    addFileToCollection,
    removeFileFromCollection,
    addCollectionNameToFile,
  } = useLibrary();

  const assigned = collectionsForLibraryFile(libraryFileId);
  const assignedIds = useMemo(
    () => new Set(assigned.map((collection) => collection.id)),
    [assigned],
  );

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = query.trim();
  const suggestions = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    return collections
      .filter((collection) => !assignedIds.has(collection.id))
      .filter((collection) =>
        needle ? collection.name.toLowerCase().includes(needle) : true,
      )
      .slice(0, 8);
  }, [assignedIds, collections, normalizedQuery]);

  const exactMatch = collections.find(
    (collection) =>
      collection.name.toLowerCase() === normalizedQuery.toLowerCase(),
  );
  const canCreate =
    normalizedQuery.length > 0 &&
    !exactMatch &&
    !assigned.some(
      (collection) =>
        collection.name.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function attachExisting(collectionId: string) {
    setBusy(true);
    try {
      await addFileToCollection(libraryFileId, collectionId);
      setQuery("");
      setOpen(false);
    } catch {
      // Error surfaced via LibraryProvider.
    } finally {
      setBusy(false);
    }
  }

  async function createAndAttach() {
    if (!canCreate || busy) {
      return;
    }
    setBusy(true);
    try {
      await addCollectionNameToFile(libraryFileId, normalizedQuery);
      setQuery("");
      setOpen(false);
    } catch {
      // Error surfaced via LibraryProvider.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="model-meta-section model-collections" ref={rootRef}>
      <div className="model-collections__header">
        <h2 className="model-meta-section__title">Collections</h2>
        <div className="model-collections__action">
          <button
            type="button"
            className="model-collections__add"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => {
              setOpen((current) => !current);
              if (open) {
                setQuery("");
              }
            }}
          >
            Add
          </button>

          {open ? (
            <div
              className="model-collections__popover"
              role="dialog"
              aria-label="Add to collection"
            >
              <input
                ref={inputRef}
                type="text"
                className="model-collections__input"
                value={query}
                disabled={busy}
                placeholder="Search or create…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (suggestions[0]) {
                      void attachExisting(suggestions[0].id);
                    } else if (canCreate) {
                      void createAndAttach();
                    } else if (exactMatch && !assignedIds.has(exactMatch.id)) {
                      void attachExisting(exactMatch.id);
                    }
                  }
                }}
              />

              <div className="model-collections__suggestions" role="listbox">
                {suggestions.map((collection) => (
                  <button
                    key={collection.id}
                    type="button"
                    className="model-collections__suggestion"
                    role="option"
                    disabled={busy}
                    onClick={() => void attachExisting(collection.id)}
                  >
                    <span>{collection.name}</span>
                    <span className="model-collections__suggestion-count">
                      {collection.fileCount}
                    </span>
                  </button>
                ))}

                {canCreate ? (
                  <button
                    type="button"
                    className="model-collections__suggestion model-collections__suggestion--create"
                    disabled={busy}
                    onClick={() => void createAndAttach()}
                  >
                    Create “{normalizedQuery}”
                  </button>
                ) : null}

                {suggestions.length === 0 && !canCreate ? (
                  <p className="model-collections__suggestion-empty">
                    {normalizedQuery
                      ? "No matching collections."
                      : "Type to find a collection."}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {assigned.length === 0 ? (
        <p className="model-collections__empty">No collections</p>
      ) : (
        <div className="model-collections__list">
          {assigned.map((collection) => (
            <CollectionPill
              key={collection.id}
              collection={collection}
              onRemove={() =>
                void removeFileFromCollection(libraryFileId, collection.id)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
