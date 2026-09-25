import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getRemoteThumbnail } from "@/lib/remoteApi";

const pathCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function loadRemoteThumbnailPath(fileId: string): Promise<string> {
  const cached = pathCache.get(fileId);
  if (cached) {
    return cached;
  }

  const pending = inflight.get(fileId);
  if (pending) {
    return pending;
  }

  const request = getRemoteThumbnail(fileId)
    .then((path) => {
      pathCache.set(fileId, path);
      inflight.delete(fileId);
      return path;
    })
    .catch((error) => {
      inflight.delete(fileId);
      throw error;
    });

  inflight.set(fileId, request);
  return request;
}

/**
 * Resolves an authenticated cloud thumbnail to a webview-usable src.
 * No-ops when `enabled` is false (no server thumb advertised).
 */
export function useRemoteThumbnailSrc(
  fileId: string,
  enabled: boolean,
): string | null {
  const [src, setSrc] = useState<string | null>(() => {
    if (!enabled) {
      return null;
    }
    const cached = pathCache.get(fileId);
    return cached ? convertFileSrc(cached) : null;
  });

  useEffect(() => {
    if (!enabled) {
      setSrc(null);
      return;
    }

    const cached = pathCache.get(fileId);
    if (cached) {
      setSrc(convertFileSrc(cached));
      return;
    }

    let cancelled = false;
    void loadRemoteThumbnailPath(fileId)
      .then((path) => {
        if (!cancelled) {
          setSrc(convertFileSrc(path));
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
  }, [enabled, fileId]);

  return src;
}
