import type { LibrarySearchRequest } from "@/lib/librarySearch";
import type { LibraryFile } from "@/types/library";

/**
 * In-memory search for cloud catalog rows (no local SQLite index).
 * Mirrors the high-level AND/OR semantics of the local SQL search for
 * query + formats + favorites; tag/collection/project filters are applied
 * by the Library page against live membership maps after results return.
 */
export function filterLibraryFilesLocally(
  files: LibraryFile[],
  request: LibrarySearchRequest,
  favoriteIds: ReadonlySet<string>,
): LibraryFile[] {
  const query = request.query.trim().toLowerCase();
  const formats = new Set(
    request.formats.map((value) => value.toLowerCase()).filter(Boolean),
  );

  return files.filter((file) => {
    if (request.favoritesOnly && !favoriteIds.has(file.libraryFileId)) {
      return false;
    }

    if (formats.size > 0 && !formats.has(file.extension.toLowerCase())) {
      return false;
    }

    if (query) {
      const haystack = `${file.name} ${file.relativePath}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}
