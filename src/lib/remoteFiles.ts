import type { LibraryFile } from "@/types/library";
import type { RemoteFileSummary } from "@/types/remoteConfig";

/** Synthetic location path for cloud-catalog rows (never a real filesystem path). */
export const REMOTE_LOCATION_PATH = "remote://cloud";

export const REMOTE_LOCATION = {
  id: "remote-cloud",
  path: REMOTE_LOCATION_PATH,
  name: "Cloud",
} as const;

export function isRemoteLibraryFile(file: Pick<LibraryFile, "locationPath">): boolean {
  return file.locationPath === REMOTE_LOCATION_PATH;
}

export function remoteFileToLibraryFile(file: RemoteFileSummary): LibraryFile {
  const extension = file.extension.replace(/^\./, "").toLowerCase();
  const updated = Date.parse(file.updatedAt);
  return {
    libraryFileId: file.id,
    contentHash: file.contentHash,
    path: `${REMOTE_LOCATION_PATH}/${file.id}`,
    name: file.name,
    extension,
    size: file.size,
    modifiedAt: Number.isFinite(updated) ? updated : Date.now(),
    relativePath: file.name,
    locationPath: REMOTE_LOCATION_PATH,
    // No local analysis pipeline for cloud rows yet — don't show a forever "Analyzing…".
    analysisStatus: "ready",
    hasRemoteThumbnail: Boolean(file.hasThumbnail),
  };
}

export function remoteFilesToLibraryFiles(
  files: RemoteFileSummary[],
): LibraryFile[] {
  return files.map(remoteFileToLibraryFile);
}
