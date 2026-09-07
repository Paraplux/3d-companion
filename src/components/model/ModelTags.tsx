import { useEffect, useMemo, useRef, useState } from "react";
import { TagPill } from "@/components/library/TagPill";
import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type ModelTagsProps = {
  libraryFileId: LibraryFileId;
};

export function ModelTags({ libraryFileId }: ModelTagsProps) {
  const {
    tags,
    tagsForLibraryFile,
    addTagToFile,
    removeTagFromFile,
    addTagNameToFile,
  } = useLibrary();

  const assigned = tagsForLibraryFile(libraryFileId);
  const assignedIds = useMemo(
    () => new Set(assigned.map((tag) => tag.id)),
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
    return tags
      .filter((tag) => !assignedIds.has(tag.id))
      .filter((tag) =>
        needle ? tag.name.toLowerCase().includes(needle) : true,
      )
      .slice(0, 8);
  }, [assignedIds, normalizedQuery, tags]);

  const exactMatch = tags.find(
    (tag) => tag.name.toLowerCase() === normalizedQuery.toLowerCase(),
  );
  const canCreate =
    normalizedQuery.length > 0 &&
    !exactMatch &&
    !assigned.some(
      (tag) => tag.name.toLowerCase() === normalizedQuery.toLowerCase(),
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

  async function attachExisting(tagId: string) {
    setBusy(true);
    try {
      await addTagToFile(libraryFileId, tagId);
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
      await addTagNameToFile(libraryFileId, normalizedQuery);
      setQuery("");
      setOpen(false);
    } catch {
      // Error surfaced via LibraryProvider.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="model-meta-section model-tags" ref={rootRef}>
      <div className="model-tags__header">
        <h2 className="model-meta-section__title">Tags</h2>
        <div className="model-tags__action">
          <button
            type="button"
            className="model-tags__add"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => {
              setOpen((current) => !current);
              if (open) {
                setQuery("");
              }
            }}
          >
            Add tag
          </button>

          {open ? (
            <div className="model-tags__popover" role="dialog" aria-label="Add tag">
              <input
                ref={inputRef}
                type="text"
                className="model-tags__input"
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

              <div className="model-tags__suggestions" role="listbox">
                {suggestions.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className="model-tags__suggestion"
                    role="option"
                    disabled={busy}
                    onClick={() => void attachExisting(tag.id)}
                  >
                    <span>{tag.name}</span>
                    <span className="model-tags__suggestion-count">
                      {tag.fileCount}
                    </span>
                  </button>
                ))}

                {canCreate ? (
                  <button
                    type="button"
                    className="model-tags__suggestion model-tags__suggestion--create"
                    disabled={busy}
                    onClick={() => void createAndAttach()}
                  >
                    Create “{normalizedQuery}”
                  </button>
                ) : null}

                {suggestions.length === 0 && !canCreate ? (
                  <p className="model-tags__suggestion-empty">
                    {normalizedQuery
                      ? "No matching tags."
                      : "Type to find a tag."}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {assigned.length === 0 ? (
        <p className="model-tags__empty">No tags</p>
      ) : (
        <div className="model-tags__list">
          {assigned.map((tag) => (
            <TagPill
              key={tag.id}
              tag={tag}
              onRemove={() => void removeTagFromFile(libraryFileId, tag.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
