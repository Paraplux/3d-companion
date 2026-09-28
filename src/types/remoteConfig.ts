/**
 * Machine-local cloud gateway connection.
 * Persisted in app data via Rust — never synced between machines.
 */

export type ImportsAfterAction = "keep" | "move" | "delete";

export type RemoteConfig = {
  /** Prefer cloud catalog when true (local folders remain available for migrate). */
  enabled: boolean;
  /** Gateway origin, e.g. https://3d-library.example.com (with or without /v1). */
  baseUrl: string;
  /** Bearer API key. */
  apiKey: string;
  /** Local download cache TTL in days (default 7). */
  cacheTtlDays: number;
  /**
   * Absolute path to the Bambu / MakerWorld download folder used as staging.
   * Empty = Imports feature inactive.
   */
  importsFolderPath: string;
  /**
   * After a successful cloud upload from Imports:
   * - keep: leave the file in place
   * - move: move into an `Imported/` subfolder
   * - delete: remove the local file
   */
  importsAfterAction: ImportsAfterAction;
};

export type RemoteConnectionTestResult = {
  ok: boolean;
  message: string;
  fileCount: number | null;
  healthOk: boolean;
  authenticated: boolean;
};

export type RemoteFileSummary = {
  id: string;
  name: string;
  extension: string;
  size: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  /** Optional until the gateway ships thumbnail support. */
  hasThumbnail?: boolean;
};

export type RemoteLibraryResponse = {
  document: unknown;
  etag: string | null;
};

export type RemoteIngestResult = {
  id: string;
  name: string;
  extension: string;
  size: number;
  contentHash: string;
  deduplicated: boolean;
};

export type ImportCandidate = {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
};

export type RemoteCacheStats = {
  bytes: number;
  fileCount: number;
};

export type RemoteCacheMaintenanceResult = RemoteCacheStats & {
  removedFiles: number;
  removedBytes: number;
};

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  enabled: false,
  baseUrl: "",
  apiKey: "",
  cacheTtlDays: 7,
  importsFolderPath: "",
  importsAfterAction: "move",
};

export function isRemoteConfigured(config: RemoteConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.apiKey.trim());
}

export function normalizeRemoteBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function normalizeImportsAfterAction(
  value: string | undefined | null,
): ImportsAfterAction {
  if (value === "keep" || value === "delete" || value === "move") {
    return value;
  }
  return "move";
}
