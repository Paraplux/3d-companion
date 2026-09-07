import type { Collection } from "@/types/library";

type CollectionPillProps = {
  collection: Collection;
  onRemove?: () => void;
  onClick?: () => void;
  title?: string;
};

export function CollectionPill({
  collection,
  onRemove,
  onClick,
  title,
}: CollectionPillProps) {
  const label = title ?? collection.name;

  if (onRemove) {
    return (
      <span className="collection-pill collection-pill--editable" title={label}>
        <span className="collection-pill__label">{collection.name}</span>
        <button
          type="button"
          className="collection-pill__remove"
          aria-label={`Remove from collection ${collection.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      </span>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className="collection-pill collection-pill--button"
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
      >
        {collection.name}
      </button>
    );
  }

  return (
    <span className="collection-pill" title={label}>
      {collection.name}
    </span>
  );
}
