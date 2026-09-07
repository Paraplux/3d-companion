import type { LibraryFile } from "@/types/library";
import type { LibraryFileId } from "@/types/libraryData";

/**
 * Keep favorites ordered by the favorite-id list (most recent first),
 * and only include files still present in the local index.
 */
export function resolveFavoriteFiles(
  files: LibraryFile[],
  favoriteIds: LibraryFileId[],
): LibraryFile[] {
  if (favoriteIds.length === 0 || files.length === 0) {
    return [];
  }

  const byId = new Map(files.map((file) => [file.libraryFileId, file]));
  const resolved: LibraryFile[] = [];

  for (const id of favoriteIds) {
    const file = byId.get(id);
    if (file) {
      resolved.push(file);
    }
  }

  return resolved;
}
