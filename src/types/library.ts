export type LibraryLocation = {
  path: string;
  name: string;
};

export type LibraryFile = {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  relativePath: string;
  locationPath: string;
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
