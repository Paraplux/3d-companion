import { useEffect, useRef, useState } from "react";
import { useLibrary } from "@/hooks/useLibrary";
import {
  markOpenedInBambu,
  peekPendingBambuSync,
  takePendingBambuSync,
} from "@/lib/pendingBambuSync";
import { getRemoteConfig } from "@/lib/remoteApi";
import { displayNameFromFilename } from "@/lib/format";

/** Give Bambu a moment to flush the file to disk after the user switches back. */
const SYNC_SETTLE_MS = 1200;
const TOAST_MS = 4200;

/**
 * When Cloud → Auto sync after Bambu is enabled, push the local cache back
 * to the gateway once the user returns to 3D Companion (window focus).
 */
export function CloudAutoSync() {
  const { cloudMode, files, replaceCloudFile } = useLibrary();
  const syncingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudMode) {
      return;
    }

    async function runSync() {
      if (syncingRef.current) {
        return;
      }
      if (document.visibilityState === "hidden") {
        return;
      }
      if (!peekPendingBambuSync()) {
        return;
      }

      try {
        const config = await getRemoteConfig();
        if (!config.enabled || !config.autoSyncOnReturn) {
          return;
        }
      } catch {
        return;
      }

      const libraryFileId = takePendingBambuSync();
      if (!libraryFileId) {
        return;
      }

      const file = files.find((entry) => entry.libraryFileId === libraryFileId);
      const label = file
        ? displayNameFromFilename(file.name)
        : "model";

      syncingRef.current = true;
      try {
        const { unchanged } = await replaceCloudFile(libraryFileId);
        showToast(
          unchanged
            ? `Up to date — ${label}`
            : `Synced to cloud — ${label}`,
        );
      } catch {
        markOpenedInBambu(libraryFileId);
        showToast(`Could not auto-sync ${label}`);
      } finally {
        syncingRef.current = false;
      }
    }

    function showToast(message: string) {
      setToast(message);
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        toastTimerRef.current = null;
        setToast(null);
      }, TOAST_MS);
    }

    function scheduleSync() {
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        void runSync();
      }, SYNC_SETTLE_MS);
    }

    const onFocus = () => {
      scheduleSync();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleSync();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [cloudMode, files, replaceCloudFile]);

  if (!toast) {
    return null;
  }

  return (
    <div className="app-toast" role="status" aria-live="polite">
      <span className="app-toast__label">{toast}</span>
      <button
        type="button"
        className="app-toast__dismiss"
        onClick={() => setToast(null)}
      >
        Dismiss
      </button>
    </div>
  );
}
