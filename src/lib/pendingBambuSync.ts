/**
 * Tracks cloud files opened in Bambu Studio so we can auto-sync
 * when the user returns to 3D Companion.
 */

let pendingLibraryFileId: string | null = null;

/** Remember that this cloud file was opened in Bambu (awaiting a possible sync). */
export function markOpenedInBambu(libraryFileId: string): void {
  pendingLibraryFileId = libraryFileId;
}

export function peekPendingBambuSync(): string | null {
  return pendingLibraryFileId;
}

/** Consume the pending id so a sync runs at most once per Bambu open. */
export function takePendingBambuSync(): string | null {
  const id = pendingLibraryFileId;
  pendingLibraryFileId = null;
  return id;
}
