import { useState } from "react";
import { useLibrary } from "@/hooks/useLibrary";
import { toUserError } from "@/lib/libraryApi";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import type { LibraryFile } from "@/types/library";

type SyncRemoteFileButtonProps = {
  file: LibraryFile;
};

/**
 * Push the local download-cache copy (edited in Bambu, etc.) back to the cloud
 * via PUT replace — same fileId, new content hash.
 */
export function SyncRemoteFileButton({ file }: SyncRemoteFileButtonProps) {
  const { replaceCloudFile } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "synced" | "unchanged">("idle");

  if (!isRemoteLibraryFile(file)) {
    return null;
  }

  async function handleSync() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("idle");
    try {
      const { unchanged } = await replaceCloudFile(file.libraryFileId);
      setStatus(unchanged ? "unchanged" : "synced");
    } catch (err) {
      setError(toUserError(err, "Could not sync that file to the cloud."));
    } finally {
      setBusy(false);
    }
  }

  const label =
    status === "synced"
      ? "Synced"
      : status === "unchanged"
        ? "Up to date"
        : busy
          ? "Syncing…"
          : "Sync to cloud";

  return (
    <div className="sync-remote">
      <button
        type="button"
        className="button button--ghost"
        disabled={busy}
        onClick={() => void handleSync()}
        title="Upload the local cache (after Bambu edits) as a new cloud version"
      >
        {label}
      </button>
      {error ? (
        <div className="sync-remote__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  );
}
