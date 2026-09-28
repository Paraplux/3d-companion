import { useEffect, useMemo, useRef, useState } from "react";
import { PreviewThumb } from "@/components/library/PreviewThumb";
import { useLibrary } from "@/hooks/useLibrary";
import { displayNameFromFilename } from "@/lib/format";
import type { LibraryFileId } from "@/types/libraryData";

type ProjectFilePickerProps = {
  projectId: string;
  memberIds: Set<LibraryFileId>;
  onAdded?: () => void;
};

export function ProjectFilePicker({
  projectId,
  memberIds,
  onAdded,
}: ProjectFilePickerProps) {
  const { files, addFileToProject } = useLibrary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const candidates = useMemo(() => {
    return files
      .filter((file) => !memberIds.has(file.libraryFileId))
      .filter((file) => {
        if (!normalizedQuery) {
          return true;
        }
        const display = displayNameFromFilename(file.name).toLowerCase();
        return (
          display.includes(normalizedQuery) ||
          file.name.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      )
      .slice(0, 12);
  }, [files, memberIds, normalizedQuery]);

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

  async function addFile(libraryFileId: LibraryFileId) {
    setBusy(true);
    try {
      await addFileToProject(libraryFileId, projectId);
      setQuery("");
      onAdded?.();
    } catch {
      // Error surfaced via LibraryProvider.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-file-picker" ref={rootRef}>
      <button
        type="button"
        className="button button--primary"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (open) {
            setQuery("");
          }
        }}
      >
        Add models
      </button>

      {open ? (
        <div
          className="project-file-picker__popover"
          role="dialog"
          aria-label="Add models to project"
        >
          <input
            ref={inputRef}
            type="search"
            className="project-file-picker__input"
            value={query}
            disabled={busy}
            placeholder="Search library…"
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="project-file-picker__results" role="listbox">
            {candidates.length === 0 ? (
              <p className="project-file-picker__empty">
                {files.length === 0
                  ? "Your library is empty."
                  : normalizedQuery
                    ? "No matching models."
                    : memberIds.size >= files.length
                      ? "All library models are already in this project."
                      : "No models available."}
              </p>
            ) : (
              candidates.map((file) => (
                  <button
                    key={file.libraryFileId}
                    type="button"
                    className="project-file-picker__option"
                    role="option"
                    disabled={busy}
                    onClick={() => void addFile(file.libraryFileId)}
                  >
                    <PreviewThumb
                      file={file}
                      className="project-file-picker__thumb"
                      placeholderClassName="project-file-picker__thumb project-file-picker__thumb--placeholder"
                    />
                    <span className="project-file-picker__names">
                      <span className="project-file-picker__display">
                        {displayNameFromFilename(file.name)}
                      </span>
                      <span className="project-file-picker__filename">
                        {file.name}
                      </span>
                    </span>
                  </button>
                ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
