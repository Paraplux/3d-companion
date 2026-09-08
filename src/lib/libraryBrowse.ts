/**
 * Library folder navigation URL state (`loc`, `dir`).
 * Search / filters live in `librarySearch.ts` and share the same query string.
 */

import type { LibraryFile, LibraryLocation, SortDirection, SortField } from "@/types/library";
import {
  applySearchToParams,
  EMPTY_LIBRARY_SEARCH,
  searchFromSearchParams,
  type LibrarySearchFilters,
} from "@/lib/librarySearch";

export type FolderEntry = {
  name: string;
  relativeDir: string;
  locationPath: string;
  itemCount: number;
};

export type BrowseState = {
  locationPath: string | null;
  relativeDir: string;
};

export type LibraryUrlState = {
  browse: BrowseState;
  search: LibrarySearchFilters;
};

export function parentRelativeDir(relativeDir: string): string {
  const index = relativeDir.lastIndexOf("/");
  return index === -1 ? "" : relativeDir.slice(0, index);
}

export function fileParentDir(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
}

/** Restore library folder + search state from `/library?…`. */
export function libraryUrlFromSearchParams(params: URLSearchParams): LibraryUrlState {
  const locationPath = params.get("loc");
  return {
    browse: {
      locationPath: locationPath && locationPath.length > 0 ? locationPath : null,
      relativeDir: params.get("dir") ?? "",
    },
    search: searchFromSearchParams(params),
  };
}

/** @deprecated Prefer `libraryUrlFromSearchParams`. */
export function browseFromSearchParams(params: URLSearchParams): BrowseState {
  return libraryUrlFromSearchParams(params).browse;
}

/** Serialize browse + search for the Library route. */
export function libraryUrlToSearchParams(state: LibraryUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.browse.locationPath) {
    params.set("loc", state.browse.locationPath);
    if (state.browse.relativeDir) {
      params.set("dir", state.browse.relativeDir);
    }
  }
  applySearchToParams(params, state.search);
  return params;
}

/** Serialize browse only (clears search params). Prefer `libraryUrlToSearchParams`. */
export function browseToSearchParams(browse: BrowseState): URLSearchParams {
  return libraryUrlToSearchParams({
    browse,
    search: EMPTY_LIBRARY_SEARCH,
  });
}

/** Build a Library href for browse + optional search. */
export function libraryBrowseHref(
  browse: BrowseState,
  search: LibrarySearchFilters = EMPTY_LIBRARY_SEARCH,
): string {
  const params = libraryUrlToSearchParams({ browse, search });
  const query = params.toString();
  return query ? `/library?${query}` : "/library";
}

/** Build a Library href that opens the folder containing this file. */
export function libraryHrefForFile(
  file: Pick<LibraryFile, "locationPath" | "relativePath">,
): string {
  return libraryBrowseHref({
    locationPath: file.locationPath,
    relativeDir: fileParentDir(file.relativePath),
  });
}

/** Build a Library href filtered to one tag (Settings → Tags). */
export function libraryHrefForTag(tagId: string): string {
  return libraryBrowseHref(
    { locationPath: null, relativeDir: "" },
    { ...EMPTY_LIBRARY_SEARCH, tagIds: [tagId] },
  );
}

export function collectFolders(
  files: LibraryFile[],
  locationPath: string,
  relativeDir: string,
): FolderEntry[] {
  const prefix = relativeDir ? `${relativeDir}/` : "";
  const folders = new Map<string, FolderEntry>();

  for (const file of files) {
    if (file.locationPath !== locationPath) {
      continue;
    }

    if (relativeDir && !file.relativePath.startsWith(prefix)) {
      continue;
    }

    const rest = relativeDir
      ? file.relativePath.slice(prefix.length)
      : file.relativePath;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      continue;
    }

    const name = rest.slice(0, slash);
    const nextRelativeDir = relativeDir ? `${relativeDir}/${name}` : name;
    const existing = folders.get(name);

    if (existing) {
      existing.itemCount += 1;
    } else {
      folders.set(name, {
        name,
        relativeDir: nextRelativeDir,
        locationPath,
        itemCount: 1,
      });
    }
  }

  return [...folders.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function filesInDir(
  files: LibraryFile[],
  locationPath: string,
  relativeDir: string,
): LibraryFile[] {
  return files.filter(
    (file) =>
      file.locationPath === locationPath &&
      fileParentDir(file.relativePath) === relativeDir,
  );
}

export function filterFiles(files: LibraryFile[], query: string): LibraryFile[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return files;
  }

  return files.filter((file) => {
    const haystack = `${file.name} ${file.extension} ${file.relativePath}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function sortFiles(
  files: LibraryFile[],
  field: SortField,
  direction: SortDirection,
): LibraryFile[] {
  const sorted = [...files].sort((left, right) => {
    let comparison = 0;

    switch (field) {
      case "name":
        comparison = left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
        });
        break;
      case "modifiedAt":
        comparison = left.modifiedAt - right.modifiedAt;
        break;
      case "size":
        comparison = left.size - right.size;
        break;
      case "type":
        comparison = left.extension.localeCompare(right.extension, undefined, {
          sensitivity: "base",
        });
        if (comparison === 0) {
          comparison = left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          });
        }
        break;
    }

    return direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

export function locationByPath(
  locations: LibraryLocation[],
  path: string,
): LibraryLocation | undefined {
  return locations.find((location) => location.path === path);
}
