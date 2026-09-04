import { FileTypeBadge } from "@/components/library/FileTypeBadge";
import { formatBytes, formatRelativePath } from "@/lib/format";
import type { LibraryFile } from "@/types/library";

type FileCardProps = {
  file: LibraryFile;
  showPath?: boolean;
  showLocation?: boolean;
  locationName?: string;
};

export function FileCard({
  file,
  showPath = false,
  showLocation = false,
  locationName,
}: FileCardProps) {
  const pathLabel = showLocation
    ? [locationName, formatRelativePath(file.relativePath)].filter(Boolean).join(" / ")
    : formatRelativePath(file.relativePath);

  return (
    <article className="file-card" title={file.path}>
      <FileTypeBadge extension={file.extension} />
      <div className="file-card__meta">
        <h3 className="file-card__name">{file.name}</h3>
        <p className="file-card__detail">{formatBytes(file.size)}</p>
        {showPath ? <p className="file-card__path">{pathLabel}</p> : null}
      </div>
    </article>
  );
}
