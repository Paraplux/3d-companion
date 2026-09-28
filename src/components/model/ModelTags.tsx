import { useEffect, useMemo, useRef, useState } from "react";
import { TagPill } from "@/components/library/TagPill";
import { ModelOrgSection } from "@/components/model/ModelOrgSection";
import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type ModelTagsProps = {
  libraryFileId: LibraryFileId;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

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
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  const busy = status === "saving";
  const normalizedQuery = query.trim();
  const suggestions = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    return tags
      .filter((tag) => !assignedIds.has(tag.id))
      .filter((tag) =>
        needle ? tag.name.toLowerCase().includes(needle) : true,
      )
      .slice(0, 12)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        fileCount: tag.fileCount,
      }));
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
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  function markSaved() {
    setStatus("saved");
    setLocalError(null);
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setStatus("idle");
      savedTimerRef.current = null;
    }, 1600);
  }

  async function attachExisting(tagId: string) {
    setStatus("saving");
    setLocalError(null);
    try {
      await addTagToFile(libraryFileId, tagId);
      setQuery("");
      setOpen(false);
      markSaved();
    } catch {
      setStatus("error");
      setLocalError("Could not add that tag.");
    }
  }

  async function createAndAttach() {
    if (!canCreate || busy) {
      return;
    }
    setStatus("saving");
    setLocalError(null);
    try {
      await addTagNameToFile(libraryFileId, normalizedQuery);
      setQuery("");
      setOpen(false);
      markSaved();
    } catch {
      setStatus("error");
      setLocalError("Could not create that tag.");
    }
  }

  async function removeTag(tagId: string) {
    setStatus("saving");
    setLocalError(null);
    try {
      await removeTagFromFile(libraryFileId, tagId);
      markSaved();
    } catch {
      setStatus("error");
      setLocalError("Could not remove that tag.");
    }
  }

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? localError ?? "Could not update tags."
          : null;

  return (
    <ModelOrgSection
      title="Tags"
      addAriaLabel="Add tag"
      dialogLabel="Add tag"
      assigned={assigned.map((tag) => ({
        id: tag.id,
        name: tag.name,
        fileCount: tag.fileCount,
      }))}
      suggestions={suggestions}
      query={query}
      onQueryChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      canCreate={canCreate}
      busy={busy}
      emptyHint="Type a label — vase, storage, décor…"
      noMatchHint="No matching tags."
      onAttach={(id) => void attachExisting(id)}
      onCreate={() => void createAndAttach()}
      onEnterFallback={() => {
        if (exactMatch && !assignedIds.has(exactMatch.id)) {
          void attachExisting(exactMatch.id);
        }
      }}
      statusSlot={
        statusLabel ? (
          <span
            className={
              status === "error"
                ? "model-notes__status model-notes__status--unsaved"
                : "model-notes__status"
            }
            aria-live="polite"
          >
            {statusLabel}
          </span>
        ) : null
      }
      renderItem={(item) => (
        <TagPill
          key={item.id}
          tag={assigned.find((tag) => tag.id === item.id)!}
          onRemove={busy ? undefined : () => void removeTag(item.id)}
        />
      )}
    />
  );
}
