import type { Collection, LibraryFile } from "@/types/library";
import type { LibraryFileId } from "@/types/libraryData";

/** Build libraryFileId → collectionId[] from a flat relation list. */
export function buildFileCollectionMap(
  relations: Array<{ libraryFileId: string; collectionId: string }>,
): Record<LibraryFileId, string[]> {
  const map: Record<LibraryFileId, string[]> = {};
  for (const relation of relations) {
    const current = map[relation.libraryFileId];
    if (current) {
      current.push(relation.collectionId);
    } else {
      map[relation.libraryFileId] = [relation.collectionId];
    }
  }
  return map;
}

export function collectionsForFile(
  collections: Collection[],
  fileCollectionMap: Record<LibraryFileId, string[]>,
  libraryFileId: LibraryFileId,
): Collection[] {
  const ids = fileCollectionMap[libraryFileId];
  if (!ids || ids.length === 0) {
    return [];
  }
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  return ids
    .map((id) => byId.get(id))
    .filter((collection): collection is Collection => Boolean(collection))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

export function resolveCollectionFiles(
  files: LibraryFile[],
  fileIds: string[],
): LibraryFile[] {
  if (fileIds.length === 0) {
    return [];
  }
  const wanted = new Set(fileIds);
  return files
    .filter((file) => wanted.has(file.libraryFileId))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

export function collectionPreviewThumbnails(
  collection: Collection,
  filesById: Map<string, LibraryFile>,
  limit = 4,
): Array<{ libraryFileId: string; thumbnailPath: string | null }> {
  return collection.previewFileIds.slice(0, limit).map((libraryFileId) => ({
    libraryFileId,
    thumbnailPath: filesById.get(libraryFileId)?.thumbnailPath ?? null,
  }));
}

export function formatCollectionCount(count: number): string {
  if (count === 0) {
    return "No models";
  }
  if (count === 1) {
    return "1 model";
  }
  return `${count} models`;
}
