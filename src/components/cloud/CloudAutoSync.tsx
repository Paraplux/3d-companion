import { useEffect, useRef } from "react";
import { useLibrary } from "@/hooks/useLibrary";
import {
  markOpenedInBambu,
  peekPendingBambuSync,
  takePendingBambuSync,
} from "@/lib/pendingBambuSync";
import { getRemoteConfig } from "@/lib/remoteApi";

/** Give Bambu a moment to flush the file to disk after the user switches back. */
const SYNC_SETTLE_MS = 1200;

/**
 * When Cloud → Auto sync after Bambu is enabled, push the local cache back
 * to the gateway once the user returns to 3D Companion (window focus).
 */
export function CloudAutoSync() {
  const { cloudMode, replaceCloudFile } = useLibrary();
  const syncingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

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

      syncingRef.current = true;
      try {
        await replaceCloudFile(libraryFileId);
      } catch {
        markOpenedInBambu(libraryFileId);
      } finally {
        syncingRef.current = false;
      }
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
    };
  }, [cloudMode, replaceCloudFile]);

  return null;
}
