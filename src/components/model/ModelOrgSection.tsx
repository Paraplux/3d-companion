import { useEffect, useRef, type ReactNode } from "react";

export type ModelOrgItem = {
  id: string;
  name: string;
  fileCount: number;
};

type ModelOrgSectionProps = {
  title: string;
  addAriaLabel: string;
  dialogLabel: string;
  assigned: ModelOrgItem[];
  suggestions: ModelOrgItem[];
  query: string;
  onQueryChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreate: boolean;
  busy?: boolean;
  statusSlot?: ReactNode;
  emptyHint: string;
  noMatchHint: string;
  onAttach: (id: string) => void;
  onCreate: () => void;
  onEnterFallback?: () => void;
  renderItem: (item: ModelOrgItem) => ReactNode;
};

/**
 * Shared chrome for Tags / Projects / Collections on the model detail page:
 * title + compact “+”, suggestion popover, pill list (no flat “No X” empty copy).
 */
export function ModelOrgSection({
  title,
  addAriaLabel,
  dialogLabel,
  assigned,
  suggestions,
  query,
  onQueryChange,
  open,
  onOpenChange,
  canCreate,
  busy = false,
  statusSlot,
  emptyHint,
  noMatchHint,
  onAttach,
  onCreate,
  onEnterFallback,
  renderItem,
}: ModelOrgSectionProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
        onQueryChange("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        onQueryChange("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange, onQueryChange, open]);

  return (
    <section className="model-org" ref={rootRef}>
      <div className="model-org__header">
        <div className="model-org__title-row">
          <h2 className="model-org__title">{title}</h2>
          <button
            type="button"
            className="model-org__add"
            aria-label={addAriaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            disabled={busy}
            onClick={() => {
              onOpenChange(!open);
              if (open) {
                onQueryChange("");
              }
            }}
          >
            +
          </button>
        </div>
        {statusSlot ? (
          <div className="model-org__status">{statusSlot}</div>
        ) : null}
        {open ? (
          <div className="model-org__popover" role="dialog" aria-label={dialogLabel}>
            <input
              ref={inputRef}
              type="text"
              className="model-org__input"
              value={query}
              disabled={busy}
              placeholder="Search or create…"
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                if (suggestions[0]) {
                  onAttach(suggestions[0].id);
                } else if (canCreate) {
                  onCreate();
                } else {
                  onEnterFallback?.();
                }
              }}
            />
            <div className="model-org__suggestions" role="listbox">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="model-org__suggestion"
                  role="option"
                  disabled={busy}
                  onClick={() => onAttach(item.id)}
                >
                  <span>{item.name}</span>
                  <span className="model-org__suggestion-count">{item.fileCount}</span>
                </button>
              ))}
              {canCreate ? (
                <button
                  type="button"
                  className="model-org__suggestion model-org__suggestion--create"
                  disabled={busy}
                  onClick={onCreate}
                >
                  Create “{query.trim()}”
                </button>
              ) : null}
              {suggestions.length === 0 && !canCreate ? (
                <p className="model-org__suggestion-empty">
                  {query.trim() ? noMatchHint : emptyHint}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {assigned.length > 0 ? (
        <div className="model-org__list">{assigned.map((item) => renderItem(item))}</div>
      ) : null}
    </section>
  );
}
