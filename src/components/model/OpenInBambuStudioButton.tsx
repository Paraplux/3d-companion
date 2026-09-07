import bambuLogo from "@/assets/ecosystems/bambu.svg";
import { useState } from "react";
import { Link } from "react-router-dom";
import { openInBambuStudio, toUserError } from "@/lib/libraryApi";
import { canOpenInBambuStudio } from "@/lib/bambuStudio";
import type { LibraryFile } from "@/types/library";

type OpenInBambuStudioButtonProps = {
  file: LibraryFile;
};

export function OpenInBambuStudioButton({ file }: OpenInBambuStudioButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await openInBambuStudio(file.libraryFileId);
    } catch (err) {
      setError(toUserError(err, "Could not open in Bambu Studio."));
    } finally {
      setBusy(false);
    }
  }

  const missing = error === "File not found";

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
        <span>{busy ? "Opening…" : "Open in Bambu Studio"}</span>
      </button>

      {error ? (
        <div className="open-bambu__error" role="alert">
          <p>{error}</p>
          {missing ? (
            <Link className="open-bambu__library-link" to="/library">
              Back to Library
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
