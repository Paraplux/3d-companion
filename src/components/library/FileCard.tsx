import { Link } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { EcosystemIcon } from "@/components/library/EcosystemIcon";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import { FilamentSwatches } from "@/components/library/FilamentSwatches";
import { FileFormatBadge } from "@/components/library/FileFormatBadge";
import { FileTypeBadge } from "@/components/library/FileTypeBadge";
import { TagPill } from "@/components/library/TagPill";
import { useLibrary } from "@/hooks/useLibrary";
import { getFileEcosystem, getFileFormat } from "@/lib/filePresentation";
import { resolveFilaments } from "@/lib/filaments";
import {
  displayNameFromFilename,
  formatBytes,
  formatRelativePath,
} from "@/lib/format";
import { visibleTagsForCard } from "@/lib/tags";
import type { LibraryFile } from "@/types/library";

type FileCardProps = {
  file: LibraryFile;
  showPath?: boolean;
  showLocation?: boolean;
  locationName?: string;
  onRemoveFromCollection?: () => void;
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

export function FileCard({
  file,
  showPath = false,
  showLocation = false,
  locationName,
  onRemoveFromCollection,
}: FileCardProps) {
  const { tagsForLibraryFile } = useLibrary();
  const pathLabel = showLocation
    ? [locationName, formatRelativePath(file.relativePath)].filter(Boolean).join(" / ")
    : formatRelativePath(file.relativePath);

  const displayName = displayNameFromFilename(file.name);
  const thumbnailSrc = file.thumbnailPath ? convertFileSrc(file.thumbnailPath) : null;
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
    file.analysisStatus === "pending" || file.analysisStatus === "analyzing";
  const { visible: cardTags, overflow: tagOverflow } = visibleTagsForCard(
    tagsForLibraryFile(file.libraryFileId),
    2,
  );

  return (
    <Link
      to={`/library/file/${file.libraryFileId}`}
      className="file-card"
      title={file.path}
    >
      <div className="file-card__preview">
        <FavoriteButton libraryFileId={file.libraryFileId} />
        {onRemoveFromCollection ? (
          <button
            type="button"
            className="file-card__collection-remove"
            aria-label="Remove from collection"
            title="Remove from collection"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemoveFromCollection();
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
        <p className="file-card__filename">{file.name}</p>

        {hasBambuDetails ? (
          <>
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
