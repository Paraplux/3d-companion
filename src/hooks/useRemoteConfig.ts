import { useCallback, useEffect, useState } from "react";
import { toUserError } from "@/lib/libraryApi";
import {
  getRemoteConfig,
  notifyRemoteConfigChanged,
  saveRemoteConfig,
  testRemoteConnection,
} from "@/lib/remoteApi";
import {
  DEFAULT_REMOTE_CONFIG,
  isRemoteConfigured,
  normalizeImportsAfterAction,
  type RemoteConfig,
  type RemoteConnectionTestResult,
} from "@/types/remoteConfig";

export function useRemoteConfig() {
  const [config, setConfig] = useState<RemoteConfig>(DEFAULT_REMOTE_CONFIG);
  const [draft, setDraft] = useState<RemoteConfig>(DEFAULT_REMOTE_CONFIG);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<RemoteConnectionTestResult | null>(
    null,
  );

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

  const updateDraft = useCallback((patch: Partial<RemoteConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setTestResult(null);
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
      return saved;
    } catch (err) {
      const message = toUserError(err, "Could not save cloud settings.");
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const test = useCallback(async () => {
    setTesting(true);
    setError(null);
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

  const dirty =
    draft.enabled !== config.enabled ||
    draft.baseUrl !== config.baseUrl ||
    draft.apiKey !== config.apiKey ||
    draft.cacheTtlDays !== config.cacheTtlDays ||
    draft.importsFolderPath !== config.importsFolderPath ||
    draft.importsAfterAction !== config.importsAfterAction;

  return {
    ready,
    config,
    draft,
    dirty,
    saving,
    testing,
    error,
    testResult,
    configured: isRemoteConfigured(draft),
    clearError: () => setError(null),
    updateDraft,
    save,
    test,
  };
}
