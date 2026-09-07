import { Link } from "react-router-dom";
import { FileCard } from "@/components/library/FileCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { resolveFavoriteFiles } from "@/lib/favorites";

export function FavoritesPage() {
  const { files, locations, favoriteIds, ready } = useLibrary();
  const favorites = resolveFavoriteFiles(files, favoriteIds);

  if (!ready) {
    return (
      <section className="page">
        <p className="page-loading">Loading…</p>
      </section>
    );
  }

  const subtitle =
    favorites.length === 0
      ? "Models you star for quick access"
      : favorites.length === 1
        ? "1 favorite"
        : `${favorites.length} favorites`;

  return (
    <section className="page page--library">
      <PageHeader title="Favorites" subtitle={subtitle} />

      {favorites.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Star models you use often and they will show up here."
          action={
            <Link className="button button--primary" to="/library">
              Browse Library
            </Link>
          }
        />
      ) : (
        <div className="library-grid">
          {favorites.map((file) => (
            <FileCard
              key={file.libraryFileId}
              file={file}
              showPath
              showLocation={locations.length > 1}
              locationName={
                locations.find((location) => location.path === file.locationPath)?.name
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
