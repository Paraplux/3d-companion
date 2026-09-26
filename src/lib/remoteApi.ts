import { invoke } from "@tauri-apps/api/core";
import type { StlMetadata, ThreeMfMetadata } from "@/types/library";
import type {
  RemoteConfig,
  RemoteConnectionTestResult,
  RemoteFileSummary,
  RemoteIngestResult,
  RemoteLibraryResponse,
} from "@/types/remoteConfig";

export const REMOTE_CONFIG_CHANGED_EVENT = "remote-config-changed";

export function notifyRemoteConfigChanged(): void {
  window.dispatchEvent(new Event(REMOTE_CONFIG_CHANGED_EVENT));
}

export function getRemoteConfig(): Promise<RemoteConfig> {
  return invoke("get_remote_config");
}

export function saveRemoteConfig(config: RemoteConfig): Promise<RemoteConfig> {
  return invoke("save_remote_config", { config });
}

export function testRemoteConnection(
  config?: RemoteConfig,
): Promise<RemoteConnectionTestResult> {
  return invoke("test_remote_connection", {
    config: config ?? null,
  });
}

export function getRemoteFiles(): Promise<RemoteFileSummary[]> {
  return invoke("get_remote_files");
}

export function getRemoteLibrary(): Promise<RemoteLibraryResponse> {
  return invoke("get_remote_library");
}

export function putRemoteLibrary(
  document: unknown,
  ifMatch: string,
): Promise<string> {
  return invoke("put_remote_library", { document, ifMatch });
}

export function uploadRemoteFile(path: string): Promise<RemoteIngestResult> {
  return invoke("upload_remote_file", { path });
}

/** Soft-delete on the gateway (`files/{id}/` → `.trash/`). */
export function deleteRemoteFile(fileId: string): Promise<void> {
  return invoke("delete_remote_file", { fileId });
}

/** Rename display name (metadata only; extension must stay the same). */
export function renameRemoteFile(
  fileId: string,
  name: string,
): Promise<RemoteFileSummary> {
  return invoke("rename_remote_file", { fileId, name });
}

/** Ensure cloud object is in the local app cache; returns absolute path. */
export function cacheRemoteFile(
  fileId: string,
  contentHash: string,
  filename: string,
): Promise<string> {
  return invoke("cache_remote_file", { fileId, contentHash, filename });
}

/** Download cloud object to a user-chosen absolute path. */
export function saveRemoteFile(fileId: string, destPath: string): Promise<void> {
  return invoke("save_remote_file", { fileId, destPath });
}

/** Cache then open a cloud STL/3MF in Bambu Studio. */
export function openRemoteInBambuStudio(
  fileId: string,
  contentHash: string,
  filename: string,
  extension: string,
): Promise<void> {
  return invoke("open_remote_in_bambu_studio", {
    fileId,
    contentHash,
    filename,
    extension,
  });
}

export type CachedRemoteAnalysis = {
  available: boolean;
  threemf?: ThreeMfMetadata;
  stl?: StlMetadata;
  thumbnailPath?: string;
};

/** Analyze a cloud file only when already present in the local download cache. */
export function analyzeCachedRemoteFile(
  fileId: string,
  contentHash: string,
  filename: string,
  extension: string,
): Promise<CachedRemoteAnalysis> {
  return invoke("analyze_cached_remote_file", {
    fileId,
    contentHash,
    filename,
    extension,
  });
}

/** Download into cache if needed, then analyze (plates / metadata). */
export function prepareRemoteFilePreview(
  fileId: string,
  contentHash: string,
  filename: string,
  extension: string,
): Promise<CachedRemoteAnalysis> {
  return invoke("prepare_remote_file_preview", {
    fileId,
    contentHash,
    filename,
    extension,
  });
}

/** Downloads (or returns cached) cloud thumbnail; absolute local path for convertFileSrc. */
export function getRemoteThumbnail(fileId: string): Promise<string> {
  return invoke("get_remote_thumbnail", { fileId });
}
