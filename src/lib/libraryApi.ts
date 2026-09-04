import { invoke } from "@tauri-apps/api/core";
import type {
  AddLibraryLocationResult,
  LibraryFile,
  LibraryLocation,
  LibrarySnapshot,
} from "@/types/library";

export function getLibrarySnapshot(): Promise<LibrarySnapshot> {
  return invoke("get_library_snapshot");
}

export function getLibraryLocations(): Promise<LibraryLocation[]> {
  return invoke("get_library_locations");
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

export function toUserError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
