/**
 * Local / derived filesystem types (Phase 2).
 *
 * These describe what is currently on disk for this machine.
 * They are not part of syncable Library Data.
 *
 * Logical identity uses `LibraryFileId` (stable).
 * `ContentHash` is only a fingerprint of current bytes.
 * See `LibraryFileIdentity` in `@/types/libraryData` and docs/architecture.md.
 */

import type { ContentHash, LibraryFileId } from "@/types/libraryData";

export type LibraryLocation = {
  path: string;
  name: string;
};

/**
 * A 3D file discovered by a local filesystem scan.
 *
 * Derived fields (path, size, mtime, name) can be recomputed from disk.
 * Do not treat them as portable user data.
 */
export type LibraryFile = {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  relativePath: string;
  locationPath: string;
};

/**
 * Target shape of a local index row (Phase 3+).
 * Syncable relations always use `fileId`, never `path` or `contentHash`.
 */
export type IndexedLibraryFile = LibraryFile & {
  fileId: LibraryFileId;
  contentHash: ContentHash;
};

export type LibrarySnapshot = {
  locations: LibraryLocation[];
  files: LibraryFile[];
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
    };

export type SortField = "name" | "modifiedAt" | "size" | "type";
export type SortDirection = "asc" | "desc";
