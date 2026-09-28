import { convertFileSrc } from "@tauri-apps/api/core";
import { useRemoteThumbnailSrc } from "@/hooks/useRemoteThumbnailSrc";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import type { LibraryFile } from "@/types/library";

type PreviewThumbProps = {
  file: LibraryFile | undefined;
  className: string;
  placeholderClassName: string;
};

/**
 * Mosaic / card preview that supports both local analysis thumbs and
 * authenticated cloud thumbnails (`hasRemoteThumbnail`).
 */
export function PreviewThumb({
  file,
  className,
  placeholderClassName,
}: PreviewThumbProps) {
  const isRemote = Boolean(file && isRemoteLibraryFile(file));
  const remoteSrc = useRemoteThumbnailSrc(
    file?.libraryFileId ?? "",
    Boolean(isRemote && file?.hasRemoteThumbnail),
    file?.contentHash,
  );
  const localSrc = file?.thumbnailPath
    ? convertFileSrc(file.thumbnailPath)
    : null;
  // Prefer cloud thumb for remote rows so a post-sync cover wins over a stale
  // local plate preview left from opening the model.
  const src = isRemote ? (remoteSrc ?? localSrc) : (localSrc ?? remoteSrc);

  if (!src) {
    return <div className={placeholderClassName} />;
  }

  return (
    <img className={className} src={src} alt="" loading="lazy" draggable={false} />
  );
}
