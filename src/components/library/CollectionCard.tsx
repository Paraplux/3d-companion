import { Link } from "react-router-dom";
import { PreviewThumb } from "@/components/library/PreviewThumb";
import {
  collectionPreviewThumbnails,
  formatCollectionCount,
} from "@/lib/collections";
import type { Collection, LibraryFile } from "@/types/library";

type CollectionCardProps = {
  collection: Collection;
  filesById: Map<string, LibraryFile>;
};

export function CollectionCard({ collection, filesById }: CollectionCardProps) {
  const previews = collectionPreviewThumbnails(collection, filesById, 4);
  const countLabel = formatCollectionCount(collection.fileCount);

  return (
    <Link
      to={`/collections/${collection.id}`}
      className="collection-card"
      title={collection.name}
    >
      <div className="collection-card__preview" aria-hidden="true">
        {previews.length === 0 ? (
          <div className="collection-card__empty-preview">
            <span>Empty</span>
          </div>
        ) : (
          <div
            className={`collection-card__mosaic collection-card__mosaic--${Math.min(
              previews.length,
              4,
            )}`}
          >
            {previews.map((preview) => (
              <PreviewThumb
                key={preview.libraryFileId}
                file={filesById.get(preview.libraryFileId)}
                className="collection-card__thumb"
                placeholderClassName="collection-card__thumb collection-card__thumb--placeholder"
              />
            ))}
          </div>
        )}
      </div>

      <div className="collection-card__meta">
        <h3 className="collection-card__name">{collection.name}</h3>
        <p className="collection-card__count">{countLabel}</p>
      </div>
    </Link>
  );
}
