import { useCallback, useEffect, useState } from "react";
import { toUserError } from "@/lib/libraryApi";
import {
  backfillRemoteThumbnails,
  clearRemoteCache,
  getRemoteCacheStats,
  getRemoteConfig,
  notifyRemoteCatalogChanged,
  notifyRemoteConfigChanged,
  saveRemoteConfig,
  testRemoteConnection,
} from "@/lib/remoteApi";
import {
  DEFAULT_REMOTE_CONFIG,
  isRemoteConfigured,
  normalizeImportsAfterAction,
  type RemoteCacheStats,
  type RemoteConfig,
  type RemoteConnectionTestResult,
} from "@/types/remoteConfig";

function formatBackfillMessage(result: {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}): string {
  const parts: string[] = [];
  if (result.succeeded > 0) {
    parts.push(
      result.succeeded === 1
        ? "1 thumbnail generated"
        : `${result.succeeded} thumbnails generated`,
    );
  }
  if (result.skipped > 0) {
    parts.push(
      result.skipped === 1
        ? "1 skipped (unsupported / no preview)"
        : `${result.skipped} skipped (unsupported / no preview)`,
    );
  }
  if (result.failed > 0) {
    parts.push(
      result.failed === 1 ? "1 failed" : `${result.failed} failed`,
    );
  }
  if (parts.length === 0) {
    return result.processed === 0
      ? "Nothing to backfill — every catalog file already has a thumbnail or none is possible."
      : `Backfill finished (${result.processed} processed).`;
  }
  return parts.join(" · ");
}

export function useRemoteConfig() {
  const [config, setConfig] = useState<RemoteConfig>(DEFAULT_REMOTE_CONFIG);
  const [draft, setDraft] = useState<RemoteConfig>(DEFAULT_REMOTE_CONFIG);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [backfillingThumbs, setBackfillingThumbs] = useState(false);
  const [cacheStats, setCacheStats] = useState<RemoteCacheStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<RemoteConnectionTestResult | null>(
    null,
  );
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await getRemoteCacheStats();
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getRemoteConfig()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        const normalized = {
          ...DEFAULT_REMOTE_CONFIG,
          ...loaded,
          importsFolderPath: loaded.importsFolderPath ?? "",
          importsAfterAction: normalizeImportsAfterAction(
            loaded.importsAfterAction,
          ),
          autoSyncOnReturn: Boolean(loaded.autoSyncOnReturn),
        };
        setConfig(normalized);
        setDraft(normalized);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(toUserError(err, "Could not load cloud settings."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void refreshCacheStats();
  }, [ready, refreshCacheStats]);

  const updateDraft = useCallback((patch: Partial<RemoteConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setTestResult(null);
    setBackfillMessage(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveRemoteConfig({
        ...draft,
        baseUrl: draft.baseUrl.trim(),
        apiKey: draft.apiKey.trim(),
        importsFolderPath: draft.importsFolderPath.trim(),
        importsAfterAction: normalizeImportsAfterAction(draft.importsAfterAction),
        cacheTtlDays:
          Number.isFinite(draft.cacheTtlDays) && draft.cacheTtlDays > 0
            ? Math.floor(draft.cacheTtlDays)
            : 7,
      });
      setConfig(saved);
      setDraft(saved);
      notifyRemoteConfigChanged();
      await refreshCacheStats();
      return saved;
    } catch (err) {
      const message = toUserError(err, "Could not save cloud settings.");
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [draft, refreshCacheStats]);

  const test = useCallback(async () => {
    setTesting(true);
    setError(null);
    setBackfillMessage(null);
    try {
      const result = await testRemoteConnection({
        ...draft,
        baseUrl: draft.baseUrl.trim(),
        apiKey: draft.apiKey.trim(),
      });
      setTestResult(result);
      return result;
    } catch (err) {
      const message = toUserError(err, "Connection test failed.");
      setError(message);
      setTestResult(null);
      throw err;
    } finally {
      setTesting(false);
    }
  }, [draft]);

  const clearCache = useCallback(async () => {
    setClearingCache(true);
    setError(null);
    try {
      const result = await clearRemoteCache();
      setCacheStats({ bytes: result.bytes, fileCount: result.fileCount });
      return result;
    } catch (err) {
      const message = toUserError(err, "Could not clear download cache.");
      setError(message);
      throw err;
    } finally {
      setClearingCache(false);
    }
  }, []);

  const backfillThumbnails = useCallback(async () => {
    setBackfillingThumbs(true);
    setError(null);
    setBackfillMessage(null);
    setTestResult(null);
    try {
      const result = await backfillRemoteThumbnails();
      setBackfillMessage(formatBackfillMessage(result));
      notifyRemoteCatalogChanged();
      return result;
    } catch (err) {
      const message = toUserError(err, "Could not regenerate thumbnails.");
      setError(message);
      throw err;
    } finally {
      setBackfillingThumbs(false);
    }
  }, []);

  const connectionDirty =
    draft.baseUrl !== config.baseUrl || draft.apiKey !== config.apiKey;

  const dirty =
    draft.enabled !== config.enabled ||
    connectionDirty ||
    draft.cacheTtlDays !== config.cacheTtlDays ||
    draft.importsFolderPath !== config.importsFolderPath ||
    draft.importsAfterAction !== config.importsAfterAction ||
    draft.autoSyncOnReturn !== config.autoSyncOnReturn;

  return {
    ready,
    config,
    draft,
    dirty,
    connectionDirty,
    saving,
    testing,
    clearingCache,
    backfillingThumbs,
    cacheStats,
    error,
    testResult,
    backfillMessage,
    configured: isRemoteConfigured(draft),
    savedConfigured: isRemoteConfigured(config),
    clearError: () => setError(null),
    clearBackfillMessage: () => setBackfillMessage(null),
    updateDraft,
    save,
    test,
    clearCache,
    backfillThumbnails,
    refreshCacheStats,
  };
}
