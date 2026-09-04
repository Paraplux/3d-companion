export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatRelativePath(relativePath: string): string {
  return relativePath.split("/").filter(Boolean).join(" / ");
}

export function extensionLabel(extension: string): string {
  return extension.toUpperCase();
}

/** Display name derived from the filename (strip last extension). */
export function displayNameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

/** Format a unix-millis timestamp for user-facing metadata. */
export function formatModifiedDate(modifiedAtMs: number): string {
  if (!Number.isFinite(modifiedAtMs) || modifiedAtMs <= 0) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(modifiedAtMs));
}

export function formatTriangleCount(count: number): string {
  return new Intl.NumberFormat(undefined).format(count);
}

export function formatEstimatedPrintTime(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${total}s`;
}
