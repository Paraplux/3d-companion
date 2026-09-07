import { invoke } from "@tauri-apps/api/core";
import type { ModelGeometryResponse } from "@/types/geometry";
import type {
  AddLibraryLocationResult,
  BackgroundTasksEvent,
  Collection,
  FileCollection,
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

export function searchLibraryFiles(query: string): Promise<LibraryFile[]> {
  return invoke("search_library_files", { query });
}

export function getProjects(): Promise<Project[]> {
  return invoke("get_projects");
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

const geometryResults = new Map<string, ModelGeometryResponse>();
const geometryRequests = new Map<string, Promise<ModelGeometryResponse>>();

export function getCachedModelGeometry(
  libraryFileId: string,
  plateId?: string | null,
  contentHash?: string,
): ModelGeometryResponse | undefined {
  return geometryResults.get(geometryCacheKey(libraryFileId, plateId, contentHash));
}

export function getModelGeometry(
  libraryFileId: string,
  plateId?: string | null,
  contentHash?: string,
): Promise<ModelGeometryResponse> {
  const key = geometryCacheKey(libraryFileId, plateId, contentHash);
  const cached = geometryResults.get(key);
  if (cached) {
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
    geometryResults.set(key, data);
    geometryRequests.delete(key);
    return data;
  }).catch((error) => {
    geometryRequests.delete(key);
    throw error;
  });

  geometryRequests.set(key, request);
  return request;
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
