import { convertFileSrc } from "@tauri-apps/api/core";
import { FileTypeBadge } from "@/components/library/FileTypeBadge";
import type { LibraryFile } from "@/types/library";

type ModelViewerPlaceholderProps = {
  file: LibraryFile;
};

/**
 * Temporary preview surface for Phase 5.0.
 * Phase 5.1 replaces this with the real ModelViewer without changing page layout.
 */
export function ModelViewerPlaceholder({ file }: ModelViewerPlaceholderProps) {
  const thumbnailSrc = file.thumbnailPath ? convertFileSrc(file.thumbnailPath) : null;

  return (
    <div className="model-viewer-placeholder" aria-label="3D preview">
      {thumbnailSrc ? (
        <img
          className="model-viewer-placeholder__thumb"
          src={thumbnailSrc}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="model-viewer-placeholder__empty">
          <FileTypeBadge extension={file.extension} />
          <p className="model-viewer-placeholder__label">3D Preview</p>
        </div>
      )}
    </div>
  );
}
