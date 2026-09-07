import type { Tag } from "@/types/library";

type TagPillProps = {
  tag: Tag;
  onRemove?: () => void;
  onClick?: () => void;
  title?: string;
};

export function TagPill({ tag, onRemove, onClick, title }: TagPillProps) {
  const label = title ?? tag.name;

  if (onRemove) {
    return (
      <span className="tag-pill tag-pill--editable" title={label}>
        <span className="tag-pill__label">{tag.name}</span>
        <button
          type="button"
          className="tag-pill__remove"
          aria-label={`Remove tag ${tag.name}`}
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
        className="tag-pill tag-pill--button"
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
      >
        {tag.name}
      </button>
    );
  }

  return (
    <span className="tag-pill" title={label}>
      {tag.name}
    </span>
  );
}
