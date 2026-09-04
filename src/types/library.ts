/**
 * Local index / filesystem DTOs returned by Tauri commands.
 *
 * Physical scan fields are machine-local. Logical identity is `libraryFileId`.
 * See docs/architecture.md.
 */

import type { ContentHash, LibraryFileId } from "@/types/libraryData";

export type LibraryLocation = {
  id: string;
  path: string;
  name: string;
};

/**
 * Indexed library file from the local SQLite index.
 * Syncable relations always use `libraryFileId`, never `path` or `contentHash`.
 */
export type LibraryFile = {
  libraryFileId: LibraryFileId;
  contentHash: ContentHash;
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  relativePath: string;
  locationPath: string;
};

/** @deprecated Prefer LibraryFile — kept as an alias during Phase 3. */
export type IndexedLibraryFile = LibraryFile;

export type LibrarySnapshot = {
  locations: LibraryLocation[];
  files: LibraryFile[];
  reconciling: boolean;
};

export type AddLibraryLocationResult = {
  location: LibraryLocation;
  files: LibraryFile[];
};

export type LibraryEvent =
  | {
      type: "locationUpdated";
      locationPath: string;
      files: LibraryFile[];
    }
  | {
      type: "locationRemoved";
      locationPath: string;
    }
  | {
      type: "reconciliationFinished";
      files: LibraryFile[];
    };

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Collection = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Tag = {
  id: string;
  name: string;
  createdAt: number;
};

export type SortField = "name" | "modifiedAt" | "size" | "type";
export type SortDirection = "asc" | "desc";
