import type { LibraryFile } from "@/types/library";
import {
  type EcosystemId,
  type FileFormat,
  fileFormatFromExtension,
} from "@/types/filePresentation";

/** Derive display format from the physical file extension only. */
export function getFileFormat(file: Pick<LibraryFile, "extension">): FileFormat | null {
  return fileFormatFromExtension(file.extension);
}

/**
 * Derive ecosystem from Phase 4 analysis only.
 * Never infer from extension (e.g. .3mf ≠ Bambu).
 */
export function getFileEcosystem(file: Pick<LibraryFile, "threemf">): EcosystemId {
  if (file.threemf?.isBambu) {
    return "bambu";
  }
  return null;
}
