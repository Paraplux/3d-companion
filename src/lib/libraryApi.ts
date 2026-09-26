import { invoke } from "@tauri-apps/api/core";
import type { ModelGeometryResponse } from "@/types/geometry";
import type { LibrarySearchRequest } from "@/lib/librarySearch";
import type {
  AddLibraryLocationResult,
  BackgroundTasksEvent,
  Collection,
  FileCollection,
  FileNote,
  FileProject,
  FileTag,
  LibraryFile,
  LibraryLocation,
  LibrarySnapshot,
  Project,
  Tag,
} from "@/types/library";

export function getLibrarySnapshot(): Promise<LibrarySnapshot> {
  return invoke("get_library_snapshot");
}

export function getLibraryLocations(): Promise<LibraryLocation[]> {
  return invoke("get_library_locations");
}

export function getLibraryFiles(): Promise<LibraryFile[]> {
  return invoke("get_library_files");
}

export function addLibraryLocation(path: string): Promise<AddLibraryLocationResult> {
  return invoke("add_library_location", { path });
}

export function removeLibraryLocation(path: string): Promise<void> {
  return invoke("remove_library_location", { path });
}

export function scanLibraryLocation(path: string): Promise<LibraryFile[]> {
  return invoke("scan_library_location", { path });
}

export function scanLibrary(): Promise<LibraryFile[]> {
  return invoke("scan_library");
}

export function searchLibraryFiles(request: LibrarySearchRequest): Promise<LibraryFile[]> {
  return invoke("search_library_files", { request });
}

export function getProjects(): Promise<Project[]> {
  return invoke("get_projects");
}

export function getProject(projectId: string): Promise<Project | null> {
  return invoke("get_project", { projectId });
}

export function createProject(
  name: string,
  description?: string | null,
): Promise<Project> {
  return invoke("create_project", {
    name,
    description: description?.trim() ? description.trim() : null,
  });
}

export function updateProject(
  projectId: string,
  name: string,
  description?: string | null,
): Promise<Project> {
  return invoke("update_project", {
    projectId,
    name,
    description: description?.trim() ? description.trim() : null,
  });
}

export function deleteProject(projectId: string): Promise<void> {
  return invoke("delete_project", { projectId });
}

export function addFileToProject(
  libraryFileId: string,
  projectId: string,
): Promise<void> {
  return invoke("add_file_to_project", { libraryFileId, projectId });
}

export function removeFileFromProject(
  libraryFileId: string,
  projectId: string,
): Promise<void> {
  return invoke("remove_file_from_project", { libraryFileId, projectId });
}

export function getAllFileProjects(): Promise<FileProject[]> {
  return invoke("get_all_file_projects");
}

export function getCollections(): Promise<Collection[]> {
  return invoke("get_collections");
}

export function getCollection(collectionId: string): Promise<Collection | null> {
  return invoke("get_collection", { collectionId });
}

export function createCollection(name: string): Promise<Collection> {
  return invoke("create_collection", { name });
}

export function renameCollection(collectionId: string, name: string): Promise<Collection> {
  return invoke("rename_collection", { collectionId, name });
}

export function deleteCollection(collectionId: string): Promise<void> {
  return invoke("delete_collection", { collectionId });
}

export function addFileToCollection(
  libraryFileId: string,
  collectionId: string,
): Promise<void> {
  return invoke("add_file_to_collection", { libraryFileId, collectionId });
}

export function removeFileFromCollection(
  libraryFileId: string,
  collectionId: string,
): Promise<void> {
  return invoke("remove_file_from_collection", { libraryFileId, collectionId });
}

export function getAllFileCollections(): Promise<FileCollection[]> {
  return invoke("get_all_file_collections");
}

export function getTags(): Promise<Tag[]> {
  return invoke("get_tags");
}

export function createTag(name: string): Promise<Tag> {
  return invoke("create_tag", { name });
}

export function renameTag(tagId: string, name: string): Promise<Tag> {
  return invoke("rename_tag", { tagId, name });
}

export function deleteTag(tagId: string): Promise<void> {
  return invoke("delete_tag", { tagId });
}

export function addFileTag(libraryFileId: string, tagId: string): Promise<void> {
  return invoke("add_file_tag", { libraryFileId, tagId });
}

export function removeFileTag(libraryFileId: string, tagId: string): Promise<void> {
  return invoke("remove_file_tag", { libraryFileId, tagId });
}

export function getAllFileTags(): Promise<FileTag[]> {
  return invoke("get_all_file_tags");
}

export function getFavoriteIds(): Promise<string[]> {
  return invoke("get_favorite_ids");
}

export function addFavorite(libraryFileId: string): Promise<void> {
  return invoke("add_favorite", { libraryFileId });
}

export function removeFavorite(libraryFileId: string): Promise<void> {
  return invoke("remove_favorite", { libraryFileId });
}

export function getFileNote(libraryFileId: string): Promise<FileNote | null> {
  return invoke("get_file_note", { libraryFileId });
}

export function upsertFileNote(
  libraryFileId: string,
  content: string,
): Promise<FileNote | null> {
  return invoke("upsert_file_note", { libraryFileId, content });
}

export function deleteFileNote(libraryFileId: string): Promise<void> {
  return invoke("delete_file_note", { libraryFileId });
}

export function getNotedFileIds(): Promise<string[]> {
  return invoke("get_noted_file_ids");
}

export function getAllFileNotes(): Promise<FileNote[]> {
  return invoke("get_all_file_notes");
}

export function getBackgroundTasks(): Promise<BackgroundTasksEvent> {
  return invoke("get_background_tasks");
}

function geometryCacheKey(
  libraryFileId: string,
  plateId: string | null | undefined,
  contentHash?: string,
): string {
  return `${libraryFileId}::${contentHash ?? ""}::${plateId ?? ""}`;
}

const GEOMETRY_CACHE_LIMIT = 24;
const geometryResults = new Map<string, ModelGeometryResponse>();
const geometryRequests = new Map<string, Promise<ModelGeometryResponse>>();

function rememberGeometry(key: string, data: ModelGeometryResponse) {
  if (geometryResults.has(key)) {
    geometryResults.delete(key);
  }
  geometryResults.set(key, data);
  while (geometryResults.size > GEOMETRY_CACHE_LIMIT) {
    const oldest = geometryResults.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    geometryResults.delete(oldest);
  }
}

export function getCachedModelGeometry(
  libraryFileId: string,
  plateId?: string | null,
  contentHash?: string,
): ModelGeometryResponse | undefined {
  const key = geometryCacheKey(libraryFileId, plateId, contentHash);
  const cached = geometryResults.get(key);
  if (!cached) {
    return undefined;
  }
  // Refresh LRU order.
  rememberGeometry(key, cached);
  return cached;
}

export function getModelGeometry(
  libraryFileId: string,
  plateId?: string | null,
  contentHash?: string,
): Promise<ModelGeometryResponse> {
  const key = geometryCacheKey(libraryFileId, plateId, contentHash);
  const cached = geometryResults.get(key);
  if (cached) {
    rememberGeometry(key, cached);
    return Promise.resolve(cached);
  }

  const pending = geometryRequests.get(key);
  if (pending) {
    return pending;
  }

  const request = invoke<ModelGeometryResponse>("get_model_geometry", {
    libraryFileId,
    plateId: plateId ?? null,
  }).then((data) => {
    rememberGeometry(key, data);
    geometryRequests.delete(key);
    return data;
  }).catch((error) => {
    geometryRequests.delete(key);
    throw error;
  });

  geometryRequests.set(key, request);
  return request;
}

/** Local or remote geometry — routes to the right Tauri command. */
export function getModelGeometryForFile(
  file: LibraryFile,
  plateId?: string | null,
): Promise<ModelGeometryResponse> {
  const key = geometryCacheKey(file.libraryFileId, plateId, file.contentHash);
  const cached = geometryResults.get(key);
  if (cached) {
    rememberGeometry(key, cached);
    return Promise.resolve(cached);
  }

  const pending = geometryRequests.get(key);
  if (pending) {
    return pending;
  }

  const isRemote = file.locationPath === "remote://cloud";
  const request = (
    isRemote
      ? invoke<ModelGeometryResponse>("get_remote_model_geometry", {
          fileId: file.libraryFileId,
          contentHash: file.contentHash,
          filename: file.name,
          extension: file.extension,
          plateId: plateId ?? null,
          threemf: file.threemf ?? null,
          stl: file.stl ?? null,
        })
      : invoke<ModelGeometryResponse>("get_model_geometry", {
          libraryFileId: file.libraryFileId,
          plateId: plateId ?? null,
        })
  )
    .then((data) => {
      rememberGeometry(key, data);
      geometryRequests.delete(key);
      return data;
    })
    .catch((error) => {
      geometryRequests.delete(key);
      throw error;
    });

  geometryRequests.set(key, request);
  return request;
}

export function clearModelGeometryCache(): void {
  geometryResults.clear();
  geometryRequests.clear();
}

export function openInBambuStudio(libraryFileId: string): Promise<void> {
  return invoke("open_in_bambu_studio", { libraryFileId });
}

export function toUserError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
