import { FILE_FORMAT_LABEL } from "@/types/filePresentation";
import { getFileFormat } from "@/lib/filePresentation";
import {
  formatBytes,
  formatModifiedDate,
  formatRelativePath,
} from "@/lib/format";
import type { LibraryFile } from "@/types/library";

type ModelFileInfoProps = {
  file: LibraryFile;
  locationName?: string;
};

type InfoRow = {
  label: string;
  value: string;
};

export function ModelFileInfo({ file, locationName }: ModelFileInfoProps) {
  const format = getFileFormat(file);
  const modified = formatModifiedDate(file.modifiedAt);
  const pathLabel = [locationName, formatRelativePath(file.relativePath)]
    .filter(Boolean)
    .join(" / ");

  const rows: InfoRow[] = [];

  if (format) {
    rows.push({ label: "Format", value: FILE_FORMAT_LABEL[format] });
  } else if (file.extension) {
    rows.push({ label: "Format", value: file.extension.toUpperCase() });
  }

  rows.push({ label: "Filename", value: file.name });
  rows.push({ label: "Size", value: formatBytes(file.size) });

  if (file.addedAt != null) {
    const added = formatModifiedDate(file.addedAt);
    if (added) {
      rows.push({ label: "Added", value: added });
    }
  }

  if (modified) {
    rows.push({ label: "Modified", value: modified });
  }

  if (pathLabel) {
    rows.push({ label: "Location", value: pathLabel });
  }

  return (
    <section className="model-meta-section">
      <h2 className="model-meta-section__title">File</h2>
      <dl className="model-meta-list">
        {rows.map((row) => (
          <div key={row.label} className="model-meta-list__row">
            <dt>{row.label}</dt>
            <dd title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
