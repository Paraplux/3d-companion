/**
 * Syncable Library Data — portable organization created by the user.
 *
 * These types describe the contract for a future versioned document
 * (e.g. library.json). They intentionally exclude absolute paths and
 * other machine-local / derived fields.
 *
 * See docs/architecture.md.
 */

export const LIBRARY_DATA_VERSION = 1 as const;

export const LIBRARY_DATA_FILENAME = "library.json";

/**
 * Opaque logical file identity.
 * Stable across rename, move, folder change, and content edits.
 * Never derived from name, path, or content hash.
 */
export type LibraryFileId = string;

/** SHA-256 hex digest of the file's current contents (content fingerprint). */
export type ContentHash = string;

/**
 * A logical file in the library.
 *
 * - `id` is the stable business identity used by favorites, projects, etc.
 * - `contentHash` is only the current content fingerprint; it may change
 *   when the file is edited (e.g. in Bambu Studio).
 */
export type LibraryFileIdentity = {
  id: LibraryFileId;
  contentHash: ContentHash;
};

export type ProjectId = string;
export type CollectionId = string;
export type TagId = string;

export type Project = {
  id: ProjectId;
  name: string;
  description?: string;
};

export type Collection = {
  id: CollectionId;
  name: string;
};

export type Tag = {
  id: TagId;
  name: string;
};

/** Optional free-form note attached to a logical file. */
export type FileNote = {
  fileId: LibraryFileId;
  text: string;
};

/**
 * Relations link logical entities to files by LibraryFileId.
 * Renaming, moving, or editing a file must not break these links.
 */
export type LibraryRelations = {
  projectFiles: Array<{
    projectId: ProjectId;
    fileId: LibraryFileId;
  }>;
  collectionFiles: Array<{
    collectionId: CollectionId;
    fileId: LibraryFileId;
  }>;
  fileTags: Array<{
    fileId: LibraryFileId;
    tagId: TagId;
  }>;
};

/**
 * Versioned portable document. This is the syncable source of truth for
 * user organization. Each machine will later materialize its own SQLite
 * index from filesystem scans + this document — SQLite itself is never synced.
 */
export type LibraryDataDocument = {
  version: typeof LIBRARY_DATA_VERSION;
  projects: Project[];
  collections: Collection[];
  tags: Tag[];
  /** Favorited logical files, identified by stable file id. */
  favorites: LibraryFileId[];
  notes: FileNote[];
  relations: LibraryRelations;
};

export function createEmptyLibraryData(): LibraryDataDocument {
  return {
    version: LIBRARY_DATA_VERSION,
    projects: [],
    collections: [],
    tags: [],
    favorites: [],
    notes: [],
    relations: {
      projectFiles: [],
      collectionFiles: [],
      fileTags: [],
    },
  };
}
