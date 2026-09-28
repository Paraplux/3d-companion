import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PreviewThumb } from "@/components/library/PreviewThumb";
import { useLibrary } from "@/hooks/useLibrary";
import { displayNameFromFilename } from "@/lib/format";
import type { LibraryFileId } from "@/types/libraryData";

type AddModelsModalProps = {
  open: boolean;
  onClose: () => void;
  /** e.g. “Add models to Summer prints” */
  title: string;
  /** Shown when the selection is empty / footer CTA. */
  destinationLabel: string;
  memberIds: Set<LibraryFileId>;
  onAdd: (libraryFileIds: LibraryFileId[]) => Promise<void>;
};

/**
 * Full-library picker: search, scrollable thumb grid, multi-select.
 * Already-in members stay visible (checked, not selectable).
 */
export function AddModelsModal({
  open,
  onClose,
  title,
  destinationLabel,
  memberIds,
  onAdd,
}: AddModelsModalProps) {
  const { files } = useLibrary();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<LibraryFileId>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [hideMembers, setHideMembers] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setSelected(new Set());
    setBusy(false);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  const candidates = useMemo(() => {
    return files
      .filter((file) => {
        if (hideMembers && memberIds.has(file.libraryFileId)) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const display = displayNameFromFilename(file.name).toLowerCase();
        return (
          display.includes(normalizedQuery) ||
          file.name.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) => {
        const leftMember = memberIds.has(left.libraryFileId) ? 1 : 0;
        const rightMember = memberIds.has(right.libraryFileId) ? 1 : 0;
        if (leftMember !== rightMember) {
          return leftMember - rightMember;
        }
        return left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
        });
      });
  }, [files, hideMembers, memberIds, normalizedQuery]);

  const selectableCount = useMemo(
    () => candidates.filter((file) => !memberIds.has(file.libraryFileId)).length,
    [candidates, memberIds],
  );

  function toggle(libraryFileId: LibraryFileId) {
    if (memberIds.has(libraryFileId) || busy) {
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(libraryFileId)) {
        next.delete(libraryFileId);
      } else {
        next.add(libraryFileId);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const file of candidates) {
        if (!memberIds.has(file.libraryFileId)) {
          next.add(file.libraryFileId);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleAdd() {
    if (selected.size === 0 || busy) {
      return;
    }
    const ids = [...selected];
    setBusy(true);
    try {
      await onAdd(ids);
      onClose();
    } catch {
      // Error surfaced via LibraryProvider.
      setBusy(false);
    }
  }

  if (!open) {
    return null;
  }

  const selectedCount = selected.size;
  const addLabel =
    selectedCount === 0
      ? `Add to ${destinationLabel}`
      : selectedCount === 1
        ? `Add 1 model to ${destinationLabel}`
        : `Add ${selectedCount} models to ${destinationLabel}`;

  return createPortal(
    <div
      className="add-models-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="add-models-modal__backdrop"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      />
      <div className="add-models-modal__panel">
        <header className="add-models-modal__header">
          <div className="add-models-modal__heading">
            <h2 className="add-models-modal__title">{title}</h2>
            <p className="add-models-modal__subtitle">
              {selectableCount === 0
                ? memberIds.size >= files.length && files.length > 0
                  ? "Every library model is already included."
                  : files.length === 0
                    ? "Your library is empty."
                    : "No matching models."
                : `${selectableCount} available · ${memberIds.size} already included`}
            </p>
          </div>
          <button
            type="button"
            className="button button--ghost"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="add-models-modal__toolbar">
          <input
            ref={inputRef}
            type="search"
            className="add-models-modal__search"
            value={query}
            disabled={busy}
            placeholder="Search library…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="add-models-modal__toggle">
            <input
              type="checkbox"
              checked={hideMembers}
              disabled={busy || memberIds.size === 0}
              onChange={(event) => setHideMembers(event.target.checked)}
            />
            Hide already included
          </label>
          <div className="add-models-modal__bulk">
            <button
              type="button"
              className="button button--ghost"
              disabled={busy || selectableCount === 0}
              onClick={selectAllVisible}
            >
              Select all
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy || selectedCount === 0}
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="add-models-modal__grid" role="listbox" aria-multiselectable="true">
          {candidates.length === 0 ? (
            <p className="add-models-modal__empty">
              {files.length === 0
                ? "Upload or sync models into your library first."
                : normalizedQuery
                  ? "No matching models."
                  : hideMembers && memberIds.size >= files.length
                    ? "All library models are already included."
                    : "No models available."}
            </p>
          ) : (
            candidates.map((file) => {
              const isMember = memberIds.has(file.libraryFileId);
              const isSelected = isMember || selected.has(file.libraryFileId);
              return (
                <button
                  key={file.libraryFileId}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={busy || isMember}
                  className={
                    isMember
                      ? "add-models-tile add-models-tile--member"
                      : isSelected
                        ? "add-models-tile add-models-tile--selected"
                        : "add-models-tile"
                  }
                  title={file.name}
                  onClick={() => toggle(file.libraryFileId)}
                >
                  <span className="add-models-tile__preview" aria-hidden="true">
                    <PreviewThumb
                      file={file}
                      className="add-models-tile__thumb"
                      placeholderClassName="add-models-tile__thumb add-models-tile__thumb--placeholder"
                    />
                    <span
                      className={
                        isSelected
                          ? "add-models-tile__check add-models-tile__check--on"
                          : "add-models-tile__check"
                      }
                    >
                      {isSelected ? "✓" : null}
                    </span>
                  </span>
                  <span className="add-models-tile__names">
                    <span className="add-models-tile__display">
                      {displayNameFromFilename(file.name)}
                    </span>
                    <span className="add-models-tile__meta">
                      {isMember ? "Already included" : file.extension.toUpperCase()}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <footer className="add-models-modal__footer">
          <p className="add-models-modal__selection">
            {selectedCount === 0
              ? "Select one or more models"
              : selectedCount === 1
                ? "1 model selected"
                : `${selectedCount} models selected`}
          </p>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || selectedCount === 0}
            onClick={() => void handleAdd()}
          >
            {busy ? "Adding…" : addLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
