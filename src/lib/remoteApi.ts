import { invoke } from "@tauri-apps/api/core";
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

/** Downloads (or returns cached) cloud thumbnail; absolute local path for convertFileSrc. */
export function getRemoteThumbnail(fileId: string): Promise<string> {
  return invoke("get_remote_thumbnail", { fileId });
}
