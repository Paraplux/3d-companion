import { convertFileSrc } from "@tauri-apps/api/core";
import { FileTypeBadge } from "@/components/library/FileTypeBadge";
import type { LibraryFile } from "@/types/library";

type ModelViewerPlaceholderProps = {
  file: LibraryFile;
};

function resolvePreviewSrc(file: LibraryFile): string | null {
  const projectThumb = file.threemf?.project?.thumbnailPath;
  if (projectThumb) {
    return convertFileSrc(projectThumb);
  }
  if (file.thumbnailPath) {
    return convertFileSrc(file.thumbnailPath);
  }
  return null;
}

/**
 * Temporary preview surface for Phase 5.0 / 5.1.
 * Phase 5.2+ replaces this with the real ModelViewer without changing page layout.
 */
export function ModelViewerPlaceholder({ file }: ModelViewerPlaceholderProps) {
  const previewSrc = resolvePreviewSrc(file);
  const plateCount = file.threemf?.project?.plates?.length
    ?? file.threemf?.bambu?.plateCount
    ?? 0;

  return (
    <div className="model-viewer-placeholder" aria-label="3D preview">
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
          <p className="model-viewer-placeholder__label">3D Preview</p>
        </div>
      )}
      {plateCount > 1 ? (
        <p className="model-viewer-placeholder__plates">
          {plateCount} plates
        </p>
      ) : null}
    </div>
  );
}
