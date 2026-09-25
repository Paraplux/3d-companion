import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { toUserError } from "@/lib/libraryApi";
import { saveRemoteFile } from "@/lib/remoteApi";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import type { LibraryFile } from "@/types/library";

type DownloadRemoteFileButtonProps = {
  file: LibraryFile;
};

export function DownloadRemoteFileButton({ file }: DownloadRemoteFileButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!isRemoteLibraryFile(file)) {
    return null;
  }

  async function handleDownload() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const extension = file.extension.replace(/^\./, "").toLowerCase();
      const dest = await save({
        title: "Save model",
        defaultPath: file.name,
        filters: extension
          ? [{ name: extension.toUpperCase(), extensions: [extension] }]
          : undefined,
      });
      if (dest === null) {
        return;
      }
      await saveRemoteFile(file.libraryFileId, dest);
      setSaved(true);
    } catch (err) {
      setError(toUserError(err, "Could not download that file."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="download-remote">
      <button
        type="button"
        className="button button--ghost"
        disabled={busy}
        onClick={() => void handleDownload()}
        title="Save a copy to your computer"
      >
        {busy ? "Downloading…" : saved ? "Saved" : "Download"}
      </button>
      {error ? (
        <div className="download-remote__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
    </div>
  );
}
