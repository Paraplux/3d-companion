/**
 * Library text search + combinable filters (Phase 5.4).
 *
 * Semantics (mirrored in Rust `query_library_files`):
 * - Within one multi-select category (formats, tags, …): OR
 * - Across different categories / text query: AND
 */

import type { FileFormat } from "@/types/filePresentation";

export type LibraryEcosystemFilter = "bambu" | "none";

export type LibrarySearchFilters = {
  query: string;
  formats: FileFormat[];
  favoritesOnly: boolean;
  tagIds: string[];
  collectionIds: string[];
  projectIds: string[];
  ecosystem: LibraryEcosystemFilter | null;
};

/** Payload for Tauri `search_library_files`. */
export type LibrarySearchRequest = {
  query: string;
  formats: string[];
  favoritesOnly: boolean;
  tagIds: string[];
  collectionIds: string[];
  projectIds: string[];
  ecosystem?: LibraryEcosystemFilter | null;
};

export const EMPTY_LIBRARY_SEARCH: LibrarySearchFilters = {
  query: "",
  formats: [],
  favoritesOnly: false,
  tagIds: [],
  collectionIds: [],
  projectIds: [],
  ecosystem: null,
};

export const LIBRARY_FORMAT_OPTIONS: Array<{ value: FileFormat; label: string }> = [
  { value: "3mf", label: "3MF" },
  { value: "stl", label: "STL" },
  { value: "step", label: "STEP" },
  { value: "stp", label: "STP" },
  { value: "obj", label: "OBJ" },
];

export function countActiveFilters(filters: LibrarySearchFilters): number {
  let count = 0;
  if (filters.formats.length > 0) {
    count += 1;
  }
  if (filters.favoritesOnly) {
    count += 1;
  }
  if (filters.tagIds.length > 0) {
    count += 1;
  }
  if (filters.collectionIds.length > 0) {
    count += 1;
  }
  if (filters.projectIds.length > 0) {
    count += 1;
  }
  if (filters.ecosystem) {
    count += 1;
  }
  return count;
}

export function hasActiveSearchOrFilters(filters: LibrarySearchFilters): boolean {
  return filters.query.trim().length > 0 || countActiveFilters(filters) > 0;
}

export function toSearchRequest(filters: LibrarySearchFilters): LibrarySearchRequest {
  return {
    query: filters.query.trim(),
    formats: [...filters.formats],
    favoritesOnly: filters.favoritesOnly,
    tagIds: [...filters.tagIds],
    collectionIds: [...filters.collectionIds],
    projectIds: [...filters.projectIds],
    ecosystem: filters.ecosystem,
  };
}

function parseCsv(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

const FORMAT_SET = new Set<string>(LIBRARY_FORMAT_OPTIONS.map((option) => option.value));

function parseFormats(raw: string[]): FileFormat[] {
  return uniquePreserveOrder(raw.map((value) => value.toLowerCase())).filter(
    (value): value is FileFormat => FORMAT_SET.has(value),
  );
}

/** Restore search / filter state from `/library?q=&fmt=&fav=&tags=&cols=&projs=&eco=`. */
export function searchFromSearchParams(params: URLSearchParams): LibrarySearchFilters {
  const legacyTag = params.get("tag");
  const tags = parseCsv(params.get("tags"));
  if (legacyTag && legacyTag.length > 0 && !tags.includes(legacyTag)) {
    tags.unshift(legacyTag);
  }

  const eco = params.get("eco");
  const ecosystem: LibraryEcosystemFilter | null =
    eco === "bambu" || eco === "none" ? eco : null;

  return {
    query: params.get("q") ?? "",
    formats: parseFormats(parseCsv(params.get("fmt"))),
    favoritesOnly: params.get("fav") === "1",
    tagIds: uniquePreserveOrder(tags),
    collectionIds: uniquePreserveOrder(parseCsv(params.get("cols"))),
    projectIds: uniquePreserveOrder(parseCsv(params.get("projs"))),
    ecosystem,
  };
}

/** Write search / filter params onto an existing URLSearchParams (mutates). */
export function applySearchToParams(
  params: URLSearchParams,
  filters: LibrarySearchFilters,
): void {
  params.delete("q");
  params.delete("fmt");
  params.delete("fav");
  params.delete("tags");
  params.delete("tag");
  params.delete("cols");
  params.delete("projs");
  params.delete("eco");

  const query = filters.query.trim();
  if (query) {
    params.set("q", query);
  }
  if (filters.formats.length > 0) {
    params.set("fmt", filters.formats.join(","));
  }
  if (filters.favoritesOnly) {
    params.set("fav", "1");
  }
  if (filters.tagIds.length > 0) {
    params.set("tags", filters.tagIds.join(","));
  }
  if (filters.collectionIds.length > 0) {
    params.set("cols", filters.collectionIds.join(","));
  }
  if (filters.projectIds.length > 0) {
    params.set("projs", filters.projectIds.join(","));
  }
  if (filters.ecosystem) {
    params.set("eco", filters.ecosystem);
  }
}

export function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
