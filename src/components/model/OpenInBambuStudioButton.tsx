import bambuLogo from "@/assets/ecosystems/bambu.svg";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { openInBambuStudio, toUserError } from "@/lib/libraryApi";
import { canOpenInBambuStudio } from "@/lib/bambuStudio";
import { returnActionLabel } from "@/lib/navigationReturn";
import { openRemoteInBambuStudio } from "@/lib/remoteApi";
import { isRemoteLibraryFile } from "@/lib/remoteFiles";
import type { LibraryFile } from "@/types/library";

type OpenInBambuStudioButtonProps = {
  file: LibraryFile;
};

type DetailLocationState = {
  libraryReturnTo?: string;
};

export function OpenInBambuStudioButton({ file }: OpenInBambuStudioButtonProps) {
  const location = useLocation();
  const returnTo =
    (location.state as DetailLocationState | null)?.libraryReturnTo ?? "/library";
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "downloading" | "opening">("idle");
  const [error, setError] = useState<string | null>(null);
  const isRemote = isRemoteLibraryFile(file);

  if (!canOpenInBambuStudio(file)) {
    return null;
  }

  async function handleOpen() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isRemote) {
        setPhase("downloading");
        await openRemoteInBambuStudio(
          file.libraryFileId,
          file.contentHash,
          file.name,
          file.extension,
        );
      } else {
        setPhase("opening");
        await openInBambuStudio(file.libraryFileId);
      }
    } catch (err) {
      setError(toUserError(err, "Could not open in Bambu Studio."));
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  }

  const missing = error === "File not found";
  const label =
    phase === "downloading"
      ? "Downloading…"
      : busy
        ? "Opening…"
        : "Open in Bambu Studio";

  return (
    <div className="open-bambu">
      <button
        type="button"
        className="button button--ghost open-bambu__button"
        disabled={busy}
        onClick={() => void handleOpen()}
      >
        <img
          className="open-bambu__icon"
          src={bambuLogo}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span>{label}</span>
      </button>

      {error ? (
        <div className="open-bambu__error" role="alert">
          <p>{error}</p>
          {missing ? (
            <Link className="open-bambu__library-link" to={returnTo}>
              {returnActionLabel(returnTo)}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
