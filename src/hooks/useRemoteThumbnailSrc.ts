import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getRemoteThumbnail } from "@/lib/remoteApi";

const pathCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(fileId: string, revision: string | undefined): string {
  return revision ? `${fileId}:${revision}` : fileId;
}

/** Drop in-memory thumb paths for a cloud file (all content revisions). */
export function invalidateRemoteThumbnailCache(fileId: string): void {
  for (const key of [...pathCache.keys()]) {
    if (key === fileId || key.startsWith(`${fileId}:`)) {
      pathCache.delete(key);
    }
  }
  for (const key of [...inflight.keys()]) {
    if (key === fileId || key.startsWith(`${fileId}:`)) {
      inflight.delete(key);
    }
  }
}

/** Drop every in-memory remote thumb path (e.g. after Clear cache). */
export function clearRemoteThumbnailPathCache(): void {
  pathCache.clear();
  inflight.clear();
}

async function loadRemoteThumbnailPath(
  fileId: string,
  revision: string | undefined,
): Promise<string> {
  const key = cacheKey(fileId, revision);
  const cached = pathCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const request = getRemoteThumbnail(fileId)
    .then((path) => {
      pathCache.set(key, path);
      inflight.delete(key);
      return path;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, request);
  return request;
}

function toSrc(path: string, revision: string | undefined): string {
  const base = convertFileSrc(path);
  // Bust webview asset cache when the same on-disk name is rewritten after replace.
  return revision ? `${base}?v=${encodeURIComponent(revision)}` : base;
}

/**
 * Resolves an authenticated cloud thumbnail to a webview-usable src.
 * No-ops when `enabled` is false (no server thumb advertised).
 * Pass `revision` (typically `contentHash`) so a replace triggers a refetch.
 */
export function useRemoteThumbnailSrc(
  fileId: string,
  enabled: boolean,
  revision?: string,
): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (!enabled) {
      return null;
    }
    const cached = pathCache.get(cacheKey(fileId, revision));
    return cached ? toSrc(cached, revision) : null;
  });

  useEffect(() => {
    if (!enabled) {
      setSrc(null);
      return;
    }

    const key = cacheKey(fileId, revision);
    const cached = pathCache.get(key);
    if (cached) {
      setSrc(toSrc(cached, revision));
      return;
    }

    let cancelled = false;
    void loadRemoteThumbnailPath(fileId, revision)
      .then((path) => {
        if (!cancelled) {
          setSrc(toSrc(path, revision));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fileId, revision]);

  return src;
}
