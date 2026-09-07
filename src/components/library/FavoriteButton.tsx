import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type FavoriteButtonProps = {
  libraryFileId: LibraryFileId;
  /** Compact icon for cards; labeled control for detail pages. */
  variant?: "icon" | "label";
  className?: string;
};

export function FavoriteButton({
  libraryFileId,
  variant = "icon",
  className,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useLibrary();
  const favorited = isFavorite(libraryFileId);
  const label = favorited ? "Remove from Favorites" : "Add to Favorites";

  if (variant === "label") {
    return (
      <button
        type="button"
        className={["button button--ghost favorite-button favorite-button--label", className]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={favorited}
        aria-label={label}
        title={label}
        onClick={() => void toggleFavorite(libraryFileId)}
      >
        <StarIcon filled={favorited} />
        <span>{favorited ? "Remove from Favorites" : "Add to Favorites"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={[
        "favorite-button favorite-button--icon",
        favorited ? "is-favorite" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={favorited}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleFavorite(libraryFileId);
      }}
    >
      <StarIcon filled={favorited} />
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 12.6 3.7 14.7l.9-4.7L1.2 6.7l4.8-.6L8 1.8l2 4.3 4.8.6-3.4 3.3.9 4.7L8 12.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}
