import type { LibraryFile, Tag } from "@/types/library";
import type { LibraryFileId } from "@/types/libraryData";

/** Build libraryFileId → tagId[] from a flat relation list (one SQLite round-trip). */
export function buildFileTagMap(
  relations: Array<{ libraryFileId: string; tagId: string }>,
): Record<LibraryFileId, string[]> {
  const map: Record<LibraryFileId, string[]> = {};
  for (const relation of relations) {
    const current = map[relation.libraryFileId];
    if (current) {
      current.push(relation.tagId);
    } else {
      map[relation.libraryFileId] = [relation.tagId];
    }
  }
  return map;
}

export function tagsForFile(
  tags: Tag[],
  fileTagMap: Record<LibraryFileId, string[]>,
  libraryFileId: LibraryFileId,
): Tag[] {
  const ids = fileTagMap[libraryFileId];
  if (!ids || ids.length === 0) {
    return [];
  }
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return ids
    .map((id) => byId.get(id))
    .filter((tag): tag is Tag => Boolean(tag))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

export function filterFilesByTag(
  files: LibraryFile[],
  fileTagMap: Record<LibraryFileId, string[]>,
  tagId: string | null,
): LibraryFile[] {
  if (!tagId) {
    return files;
  }
  return files.filter((file) => fileTagMap[file.libraryFileId]?.includes(tagId));
}

export function visibleTagsForCard(tags: Tag[], limit = 2): {
  visible: Tag[];
  overflow: number;
} {
  if (tags.length <= limit) {
    return { visible: tags, overflow: 0 };
  }
  return {
    visible: tags.slice(0, limit),
    overflow: tags.length - limit,
  };
}
