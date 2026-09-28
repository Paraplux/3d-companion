import { memo, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { EcosystemIcon } from "@/components/library/EcosystemIcon";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import { FilamentSwatches } from "@/components/library/FilamentSwatches";
import { FileFormatBadge } from "@/components/library/FileFormatBadge";
import { FileTypeBadge } from "@/components/library/FileTypeBadge";
import { TagPill } from "@/components/library/TagPill";
import { useLibrary } from "@/hooks/useLibrary";
import { useRemoteThumbnailSrc } from "@/hooks/useRemoteThumbnailSrc";
import { getFileEcosystem, getFileFormat } from "@/lib/filePresentation";
import { resolveFilaments } from "@/lib/filaments";
import {
  displayNameFromFilename,
  formatBytes,
  formatRelativePath,
} from "@/lib/format";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import { visibleTagsForCard } from "@/lib/tags";
import type { LibraryFile } from "@/types/library";

type FileCardProps = {
  file: LibraryFile;
  showPath?: boolean;
  showLocation?: boolean;
  locationName?: string;
  onRemoveFromCollection?: () => void;
  onRemoveFromProject?: () => void;
};

function formatDimensions(file: LibraryFile): string | null {
  const dims = file.stl?.dimensionsMm;
  if (!dims) {
    return null;
  }
  const x = dims.x.toFixed(dims.x >= 10 ? 0 : 1);
  const y = dims.y.toFixed(dims.y >= 10 ? 0 : 1);
  const z = dims.z.toFixed(dims.z >= 10 ? 0 : 1);
  return `${x} × ${y} × ${z} mm`;
}

function formatPrinterNozzleLine(file: LibraryFile): string | null {
  const bambu = file.threemf?.bambu;
  if (!bambu) {
    return null;
  }

  const parts: string[] = [];
  if (bambu.printer) {
    parts.push(bambu.printer);
  }
  if (bambu.nozzle) {
    parts.push(`Nozzle ${bambu.nozzle}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatLayerHeightLine(file: LibraryFile): string | null {
  const layerHeight = file.threemf?.bambu?.layerHeight;
  if (!layerHeight) {
    return null;
  }
  return `Layer height ${layerHeight}`;
}

function formatWeightLine(file: LibraryFile): string | null {
  const weight = file.threemf?.bambu?.weightGrams;
  if (typeof weight !== "number") {
    return null;
  }
  return `${weight.toFixed(1)} g`;
}

function FileCardComponent({
  file,
  showPath = false,
  showLocation = false,
  locationName,
  onRemoveFromCollection,
  onRemoveFromProject,
}: FileCardProps) {
  const location = useLocation();
  const { tagsForLibraryFile, hasNote } = useLibrary();
  const [thumbFailed, setThumbFailed] = useState(false);
  const isRemote = isRemoteLibraryFile(file);
  const remoteThumbSrc = useRemoteThumbnailSrc(
    file.libraryFileId,
    Boolean(isRemote && file.hasRemoteThumbnail),
    file.contentHash,
  );

  useEffect(() => {
    setThumbFailed(false);
  }, [file.thumbnailPath, remoteThumbSrc]);

  const pathLabel = showLocation
    ? [locationName, formatRelativePath(file.relativePath)].filter(Boolean).join(" / ")
    : formatRelativePath(file.relativePath);

  const displayName = displayNameFromFilename(file.name);
  const localThumbSrc =
    !thumbFailed && file.thumbnailPath ? convertFileSrc(file.thumbnailPath) : null;
  const thumbnailSrc =
    !thumbFailed && (remoteThumbSrc || localThumbSrc) ? remoteThumbSrc ?? localThumbSrc : null;
  const format = getFileFormat(file);
  const ecosystem = getFileEcosystem(file);
  const printerNozzle = formatPrinterNozzleLine(file);
  const filaments = resolveFilaments(file.threemf?.bambu);
  const layerHeight = formatLayerHeightLine(file);
  const weight = formatWeightLine(file);
  const dimensions = formatDimensions(file);
  const hasBambuDetails =
    Boolean(printerNozzle) ||
    filaments.length > 0 ||
    Boolean(layerHeight) ||
    Boolean(weight);
  const analyzing =
    !isRemote &&
    (file.analysisStatus === "pending" || file.analysisStatus === "analyzing");
  const { visible: cardTags, overflow: tagOverflow } = visibleTagsForCard(
    tagsForLibraryFile(file.libraryFileId),
    2,
  );
  const onRemove = onRemoveFromProject ?? onRemoveFromCollection;
  const removeLabel = onRemoveFromProject
    ? "Remove from project"
    : "Remove from collection";
  const showNoteIndicator = hasNote(file.libraryFileId);

  return (
    <Link
      to={`/library/file/${file.libraryFileId}`}
      state={{ libraryReturnTo: `${location.pathname}${location.search}` }}
      className="file-card"
      title={file.path}
    >
      <div className="file-card__preview">
        <FavoriteButton libraryFileId={file.libraryFileId} />
        {showNoteIndicator ? (
          <span className="file-card__note-indicator" title="Note" aria-label="Has note">
            <NoteIcon />
          </span>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            className="file-card__collection-remove"
            aria-label={removeLabel}
            title={removeLabel}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        ) : null}
        {thumbnailSrc ? (
          <img
            className="file-card__thumb"
            src={thumbnailSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <FileTypeBadge extension={file.extension} />
        )}

        {format || ecosystem ? (
          <div className="file-card__markers">
            {format ? <FileFormatBadge format={format} /> : null}
            {ecosystem ? <EcosystemIcon ecosystem={ecosystem} /> : null}
          </div>
        ) : null}
      </div>

      <div className="file-card__meta">
        <h3 className="file-card__name">{displayName}</h3>
        {hasBambuDetails ? (
          <>
            <p className="file-card__detail">
              {file.extension.toUpperCase()} · {formatBytes(file.size)}
            </p>
            {printerNozzle ? (
              <p className="file-card__detail">{printerNozzle}</p>
            ) : null}
            {filaments.length > 0 ? <FilamentSwatches filaments={filaments} /> : null}
            {layerHeight ? <p className="file-card__detail">{layerHeight}</p> : null}
            {weight ? <p className="file-card__detail">{weight}</p> : null}
          </>
        ) : (
          <>
            <p className="file-card__detail">
              {file.extension.toUpperCase()} · {formatBytes(file.size)}
            </p>
            {dimensions ? <p className="file-card__detail">{dimensions}</p> : null}
          </>
        )}

        {analyzing ? <p className="file-card__status">Analyzing…</p> : null}
        {file.analysisStatus === "error" ? (
          <p className="file-card__status file-card__status--error">Analysis failed</p>
        ) : null}

        {cardTags.length > 0 ? (
          <div className="file-card__tags" aria-label="Tags">
            {cardTags.map((tag) => (
              <TagPill key={tag.id} tag={tag} />
            ))}
            {tagOverflow > 0 ? (
              <span className="tag-pill tag-pill--more" title={`${tagOverflow} more`}>
                +{tagOverflow}
              </span>
            ) : null}
          </div>
        ) : null}

        {showPath ? <p className="file-card__path">{pathLabel}</p> : null}
      </div>
    </Link>
  );
}

function NoteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 2.5h9v11l-2.2-1.6H3.5v-9.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 5.5h6M5.5 8h6M5.5 10.5h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const FileCard = memo(FileCardComponent);
