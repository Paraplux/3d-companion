import { convertFileSrc } from "@tauri-apps/api/core";
import { FileTypeBadge } from "@/components/library/FileTypeBadge";
import { useRemoteThumbnailSrc } from "@/hooks/useRemoteThumbnailSrc";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import type { LibraryFile } from "@/types/library";

type ModelViewerPlaceholderProps = {
  file: LibraryFile;
  plateId?: string | null;
};

function resolveLocalPreviewSrc(file: LibraryFile, plateId?: string | null): string | null {
  const plates = file.threemf?.project?.plates ?? [];
  const plate = plateId
    ? plates.find((entry) => entry.id === plateId)
    : undefined;

  const path =
    plate?.thumbnailPath
    ?? file.threemf?.project?.thumbnailPath
    ?? file.thumbnailPath
    ?? null;

  return path ? convertFileSrc(path) : null;
}

export function ModelViewerPlaceholder({
  file,
  plateId,
}: ModelViewerPlaceholderProps) {
  const isRemote = isRemoteLibraryFile(file);
  const remoteSrc = useRemoteThumbnailSrc(
    file.libraryFileId,
    Boolean(isRemote && file.hasRemoteThumbnail),
  );
  const previewSrc = remoteSrc ?? resolveLocalPreviewSrc(file, plateId);

  return (
    <div className="model-viewer-placeholder" aria-label="Model preview">
      {previewSrc ? (
        <img
          className="model-viewer-placeholder__thumb"
          src={previewSrc}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="model-viewer-placeholder__empty">
          <FileTypeBadge extension={file.extension} />
          <p className="model-viewer-placeholder__label">Preview</p>
        </div>
      )}
    </div>
  );
}
