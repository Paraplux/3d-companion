/**
 * Machine-local cloud gateway connection.
 * Persisted in app data via Rust — never synced between machines.
 */

export type RemoteConfig = {
  /** Prefer cloud catalog when true (local folders remain available for migrate). */
  enabled: boolean;
  /** Gateway origin, e.g. https://3d-library.example.com (with or without /v1). */
  baseUrl: string;
  /** Bearer API key. */
  apiKey: string;
  /** Local download cache TTL in days (default 7). */
  cacheTtlDays: number;
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

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  enabled: false,
  baseUrl: "",
  apiKey: "",
  cacheTtlDays: 7,
};

export function isRemoteConfigured(config: RemoteConfig): boolean {
  return Boolean(config.baseUrl.trim() && config.apiKey.trim());
}

export function normalizeRemoteBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}
