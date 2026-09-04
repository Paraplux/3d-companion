/**
 * Local index / filesystem DTOs returned by Tauri commands.
 *
 * Physical scan fields are machine-local. Logical identity is `libraryFileId`.
 * Derived metadata / thumbnails are local regenerable cache.
 */

import type { ContentHash, LibraryFileId } from "@/types/libraryData";

export type LibraryLocation = {
  id: string;
  path: string;
  name: string;
};

export type AnalysisStatus = "pending" | "analyzing" | "ready" | "error";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type BoundingBox = {
  min: Vec3;
  max: Vec3;
};

export type StlMetadata = {
  encoding: string;
  triangleCount: number;
  boundingBox: BoundingBox;
  dimensionsMm: Vec3;
  volumeMm3?: number;
};

export type FilamentInfo = {
  material?: string;
  color?: string;
};

export type ThreeMfObject = {
  id: string;
  name?: string;
  meshPath?: string;
  transform?: number[];
};

export type ThreeMfPlate = {
  /** Stable plate id within this 3MF project (not LibraryFileId / ContentHash). */
  id: string;
  /** 1-based display order. */
  index: number;
  name?: string;
  /** Absolute thumbnail path after backend resolution. */
  thumbnailPath?: string;
  objects?: ThreeMfObject[];
  estimatedTimeSeconds?: number;
  weightGrams?: number;
};

export type ThreeMfProject = {
  /** Absolute thumbnail path after backend resolution. */
  thumbnailPath?: string;
  plates?: ThreeMfPlate[];
};

export type BambuMetadata = {
  printer?: string;
  nozzle?: string;
  layerHeight?: string;
  filament?: string;
  color?: string;
  colors?: string[];
  filaments?: FilamentInfo[];
  infill?: string;
  plateCount?: number;
  estimatedTimeSeconds?: number;
  weightGrams?: number;
};

export type ThreeMfMetadata = {
  isBambu: boolean;
  bambu?: BambuMetadata;
  project?: ThreeMfProject;
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
  analysisStatus: AnalysisStatus;
  analysisError?: string;
  thumbnailPath?: string;
  stl?: StlMetadata;
  threemf?: ThreeMfMetadata;
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
    }
  | {
      type: "fileAnalyzed";
      file: LibraryFile;
    };

export type BackgroundTaskType = "hashing" | "analyzing" | "thumbnail";
export type BackgroundTaskStatus = "queued" | "running" | "completed" | "error";

export type BackgroundTask = {
  id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  progress?: number;
  label: string;
  error?: string;
};

export type BackgroundTasksEvent = {
  tasks: BackgroundTask[];
  activeCount: number;
  label?: string;
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
