import type { LibraryFile, Project } from "@/types/library";
import type { LibraryFileId } from "@/types/libraryData";

/** Build libraryFileId → projectId[] from a flat relation list. */
export function buildFileProjectMap(
  relations: Array<{ libraryFileId: string; projectId: string }>,
): Record<LibraryFileId, string[]> {
  const map: Record<LibraryFileId, string[]> = {};
  for (const relation of relations) {
    const current = map[relation.libraryFileId];
    if (current) {
      current.push(relation.projectId);
    } else {
      map[relation.libraryFileId] = [relation.projectId];
    }
  }
  return map;
}

export function projectsForFile(
  projects: Project[],
  fileProjectMap: Record<LibraryFileId, string[]>,
  libraryFileId: LibraryFileId,
): Project[] {
  const ids = fileProjectMap[libraryFileId];
  if (!ids || ids.length === 0) {
    return [];
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  return ids
    .map((id) => byId.get(id))
    .filter((project): project is Project => Boolean(project))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

export function resolveProjectFiles(
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

export function projectPreviewThumbnails(
  project: Project,
  filesById: Map<string, LibraryFile>,
  limit = 4,
): Array<{ libraryFileId: string; thumbnailPath: string | null }> {
  return project.previewFileIds.slice(0, limit).map((libraryFileId) => ({
    libraryFileId,
    thumbnailPath: filesById.get(libraryFileId)?.thumbnailPath ?? null,
  }));
}

export function formatProjectCount(count: number): string {
  if (count === 0) {
    return "No models";
  }
  if (count === 1) {
    return "1 model";
  }
  return `${count} models`;
}
