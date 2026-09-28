import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileCard } from "@/components/library/FileCard";
import { FolderCard } from "@/components/library/FolderCard";
import { LibraryBreadcrumbs } from "@/components/library/LibraryBreadcrumbs";
import { LibraryFiltersPanel } from "@/components/library/LibraryFiltersPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import {
  collectFolders,
  filesInDir,
  libraryUrlFromSearchParams,
  libraryUrlToSearchParams,
  locationByPath,
  parentRelativeDir,
  sortFiles,
  type BrowseState,
} from "@/lib/libraryBrowse";
import {
  EMPTY_LIBRARY_SEARCH,
  hasActiveSearchOrFilters,
  toSearchRequest,
  type LibrarySearchFilters,
} from "@/lib/librarySearch";
import { FILE_FORMAT_LABEL } from "@/types/filePresentation";
import type { LibraryFile, SortDirection, SortField } from "@/types/library";

export function LibraryPage() {
  const {
    locations,
    files,
    tags,
    collections,
    projects,
    favoriteIds,
    fileTagMap,
    fileCollectionMap,
    fileProjectMap,
    ready,
    cloudMode,
    scanning,
    scanningLabel,
    uploading,
    error,
    clearError,
    statusMessage,
    clearStatus,
    addFolder,
    rescan,
    uploadFiles,
    search,
  } = useLibrary();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(
    () => libraryUrlFromSearchParams(searchParams),
    [searchParams],
  );
  const browse = urlState.browse;
  const filters = urlState.search;

  const setUrlState = useCallback(
    (
      nextBrowse: BrowseState,
      nextSearch: LibrarySearchFilters,
      options?: { replace?: boolean },
    ) => {
      setSearchParams(
        libraryUrlToSearchParams({ browse: nextBrowse, search: nextSearch }),
        { replace: options?.replace ?? true },
      );
    },
    [setSearchParams],
  );

  const setBrowse = useCallback(
    (next: BrowseState) => {
      setUrlState(next, filters, { replace: false });
    },
    [filters, setUrlState],
  );

  const setFilters = useCallback(
    (next: LibrarySearchFilters) => {
      setUrlState(browse, next, { replace: true });
    },
    [browse, setUrlState],
  );

  const [draftQuery, setDraftQuery] = useState(filters.query);
  const [searchResults, setSearchResults] = useState<LibraryFile[] | null>(null);
  const [searchPending, setSearchPending] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Cloud catalog has a real "date added"; default to newest first.
  useEffect(() => {
    if (!cloudMode) {
      return;
    }
    setSortField("addedAt");
    setSortDirection("desc");
  }, [cloudMode]);

  // URL filters drive SQLite; draftQuery is debounced into the URL.
  const searchFilters = filters;
  const isFiltering = hasActiveSearchOrFilters(searchFilters);

  const currentLocation = browse.locationPath
    ? locationByPath(locations, browse.locationPath)
    : undefined;

  const locationNameByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const location of locations) {
      map.set(location.path, location.name);
    }
    return map;
  }, [locations]);

  const locationFileCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files) {
      counts.set(file.locationPath, (counts.get(file.locationPath) ?? 0) + 1);
    }
    return counts;
  }, [files]);

  const filesById = useMemo(() => {
    const map = new Map<string, LibraryFile>();
    for (const file of files) {
      map.set(file.libraryFileId, file);
    }
    return map;
  }, [files]);

  // Keep draft input in sync when URL changes (back/forward, clear).
  useEffect(() => {
    setDraftQuery(filters.query);
  }, [filters.query]);

  // Debounce query → URL (filter toggles write immediately via setFilters).
  useEffect(() => {
    if (draftQuery === filtersRef.current.query) {
      return;
    }
    const handle = window.setTimeout(() => {
      setFilters({ ...filtersRef.current, query: draftQuery });
    }, 180);
    return () => window.clearTimeout(handle);
  }, [draftQuery, setFilters]);

  // Drop stale folder / organization ids from URL.
  useEffect(() => {
    if (browse.locationPath && locations.length > 0) {
      if (!locationByPath(locations, browse.locationPath)) {
        setBrowse({ locationPath: null, relativeDir: "" });
        return;
      }
    }

    let next = filters;
    let changed = false;

    if (tags.length > 0 && filters.tagIds.some((id) => !tags.some((tag) => tag.id === id))) {
      next = {
        ...next,
        tagIds: filters.tagIds.filter((id) => tags.some((tag) => tag.id === id)),
      };
      changed = true;
    }
    if (
      collections.length > 0 &&
      filters.collectionIds.some((id) => !collections.some((c) => c.id === id))
    ) {
      next = {
        ...next,
        collectionIds: filters.collectionIds.filter((id) =>
          collections.some((c) => c.id === id),
        ),
      };
      changed = true;
    }
    if (
      projects.length > 0 &&
      filters.projectIds.some((id) => !projects.some((p) => p.id === id))
    ) {
      next = {
        ...next,
        projectIds: filters.projectIds.filter((id) =>
          projects.some((p) => p.id === id),
        ),
      };
      changed = true;
    }

    if (changed) {
      setFilters(next);
    }
  }, [
    browse.locationPath,
    collections,
    filters,
    locations,
    projects,
    setBrowse,
    setFilters,
    tags,
  ]);

  // Debounced SQLite search when query or filters are active.
  useEffect(() => {
    if (!isFiltering) {
      setSearchResults(null);
      setSearchPending(false);
      return;
    }

    let cancelled = false;
    setSearchPending(true);
    const delayMs = searchFilters.query.trim().length > 0 ? 180 : 0;
    const handle = window.setTimeout(() => {
      void search(toSearchRequest(searchFilters)).then((results) => {
        if (!cancelled) {
          setSearchResults(results);
          setSearchPending(false);
        }
      });
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isFiltering, search, searchFilters]);

  const visibleFolders = useMemo(() => {
    if (cloudMode || isFiltering) {
      return [];
    }

    if (!browse.locationPath) {
      return locations.map((location) => ({
        name: location.name,
        relativeDir: "",
        locationPath: location.path,
        itemCount: locationFileCounts.get(location.path) ?? 0,
      }));
    }

    return collectFolders(files, browse.locationPath, browse.relativeDir);
  }, [
    browse.locationPath,
    browse.relativeDir,
    cloudMode,
    files,
    isFiltering,
    locationFileCounts,
    locations,
  ]);

  const liveSearchFiles = useMemo(() => {
    if (!searchResults) {
      return [];
    }

    // Prefer live library rows so analysis / thumbnails stay fresh while filtering.
    let rows = searchResults.map(
      (result) => filesById.get(result.libraryFileId) ?? result,
    );

    // Prune stale membership after optimistic favorite/tag/collection/project edits.
    if (searchFilters.favoritesOnly) {
      const favorites = new Set(favoriteIds);
      rows = rows.filter((file) => favorites.has(file.libraryFileId));
    }
    if (searchFilters.tagIds.length > 0) {
      const wanted = new Set(searchFilters.tagIds);
      rows = rows.filter((file) =>
        (fileTagMap[file.libraryFileId] ?? []).some((id) => wanted.has(id)),
      );
    }
    if (searchFilters.collectionIds.length > 0) {
      const wanted = new Set(searchFilters.collectionIds);
      rows = rows.filter((file) =>
        (fileCollectionMap[file.libraryFileId] ?? []).some((id) => wanted.has(id)),
      );
    }
    if (searchFilters.projectIds.length > 0) {
      const wanted = new Set(searchFilters.projectIds);
      rows = rows.filter((file) =>
        (fileProjectMap[file.libraryFileId] ?? []).some((id) => wanted.has(id)),
      );
    }

    return rows;
  }, [
    favoriteIds,
    fileCollectionMap,
    fileProjectMap,
    fileTagMap,
    filesById,
    searchFilters.collectionIds,
    searchFilters.favoritesOnly,
    searchFilters.projectIds,
    searchFilters.tagIds,
    searchResults,
  ]);

  const visibleFiles = useMemo(() => {
    if (isFiltering) {
      return sortFiles(liveSearchFiles, sortField, sortDirection);
    }

    if (cloudMode) {
      return sortFiles(files, sortField, sortDirection);
    }

    if (!browse.locationPath) {
      return [];
    }

    return sortFiles(
      filesInDir(files, browse.locationPath, browse.relativeDir),
      sortField,
      sortDirection,
    );
  }, [
    browse.locationPath,
    browse.relativeDir,
    cloudMode,
    files,
    isFiltering,
    liveSearchFiles,
    sortDirection,
    sortField,
  ]);

  const resultsTruncated = isFiltering && (searchResults?.length ?? 0) >= 1000;

  const breadcrumbItems = useMemo(() => {
    const items: Array<{ label: string; onClick?: () => void }> = [
      {
        label: "Library",
        onClick: () => setBrowse({ locationPath: null, relativeDir: "" }),
      },
    ];

    if (!currentLocation) {
      return items;
    }

    items.push({
      label: currentLocation.name,
      onClick: () =>
        setBrowse({
          locationPath: currentLocation.path,
          relativeDir: "",
        }),
    });

    if (browse.relativeDir) {
      const segments = browse.relativeDir.split("/").filter(Boolean);
      let accumulated = "";

      for (const [index, segment] of segments.entries()) {
        accumulated = accumulated ? `${accumulated}/${segment}` : segment;
        const pathAtSegment = accumulated;
        const isLast = index === segments.length - 1;

        items.push({
          label: segment,
          onClick: isLast
            ? undefined
            : () =>
                setBrowse({
                  locationPath: currentLocation.path,
                  relativeDir: pathAtSegment,
                }),
        });
      }
    }

    return items;
  }, [browse.relativeDir, currentLocation, setBrowse]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    for (const format of filters.formats) {
      chips.push({
        key: `fmt:${format}`,
        label: FILE_FORMAT_LABEL[format],
        onRemove: () =>
          setFilters({
            ...filters,
            formats: filters.formats.filter((value) => value !== format),
          }),
      });
    }

    if (filters.favoritesOnly) {
      chips.push({
        key: "fav",
        label: "Favorites",
        onRemove: () => setFilters({ ...filters, favoritesOnly: false }),
      });
    }

    if (filters.ecosystem === "bambu") {
      chips.push({
        key: "eco:bambu",
        label: "Bambu",
        onRemove: () => setFilters({ ...filters, ecosystem: null }),
      });
    } else if (filters.ecosystem === "none") {
      chips.push({
        key: "eco:none",
        label: "Unknown / none",
        onRemove: () => setFilters({ ...filters, ecosystem: null }),
      });
    }

    for (const tagId of filters.tagIds) {
      const tag = tags.find((entry) => entry.id === tagId);
      chips.push({
        key: `tag:${tagId}`,
        label: tag?.name ?? "Tag",
        onRemove: () =>
          setFilters({
            ...filters,
            tagIds: filters.tagIds.filter((id) => id !== tagId),
          }),
      });
    }

    for (const collectionId of filters.collectionIds) {
      const collection = collections.find((entry) => entry.id === collectionId);
      chips.push({
        key: `col:${collectionId}`,
        label: collection?.name ?? "Collection",
        onRemove: () =>
          setFilters({
            ...filters,
            collectionIds: filters.collectionIds.filter((id) => id !== collectionId),
          }),
      });
    }

    for (const projectId of filters.projectIds) {
      const project = projects.find((entry) => entry.id === projectId);
      chips.push({
        key: `proj:${projectId}`,
        label: project?.name ?? "Project",
        onRemove: () =>
          setFilters({
            ...filters,
            projectIds: filters.projectIds.filter((id) => id !== projectId),
          }),
      });
    }

    return chips;
  }, [collections, filters, projects, setFilters, tags]);

  const clearAllFilters = useCallback(() => {
    setFilters({ ...EMPTY_LIBRARY_SEARCH, query: filters.query });
  }, [filters.query, setFilters]);

  const clearSearchAndFilters = useCallback(() => {
    setDraftQuery("");
    setFilters(EMPTY_LIBRARY_SEARCH);
  }, [setFilters]);

  const itemCountLabel = isFiltering
    ? `${visibleFiles.length} result${visibleFiles.length === 1 ? "" : "s"}${
        searchPending ? "…" : ""
      }`
    : cloudMode
      ? `${visibleFiles.length} model${visibleFiles.length === 1 ? "" : "s"}`
      : browse.locationPath
        ? `${visibleFolders.length + visibleFiles.length} item${
            visibleFolders.length + visibleFiles.length === 1 ? "" : "s"
          }`
        : `${locations.length} location${locations.length === 1 ? "" : "s"}`;

  const subtitle = scanningLabel
    ? scanningLabel
    : cloudMode
      ? files.length === 0
        ? "Cloud library"
        : `Cloud · ${itemCountLabel}`
      : locations.length === 0
        ? "Your 3D models and projects"
        : currentLocation
          ? `${currentLocation.name} · ${itemCountLabel}`
          : isFiltering
            ? itemCountLabel
            : `${itemCountLabel}`;

  if (!ready && scanning) {
    return (
      <section className="page">
        <PageHeader title="Library" subtitle="Loading…" />
        <EmptyState
          title={cloudMode ? "Loading cloud library…" : "Scanning…"}
          description={
            cloudMode
              ? "Fetching your catalog from the cloud."
              : "Looking for 3D files in your folders."
          }
        />
      </section>
    );
  }

  if (cloudMode) {
    const showCloudEmpty =
      !isFiltering && !searchPending && visibleFiles.length === 0;
    const showNoSearchResults =
      isFiltering && !searchPending && visibleFiles.length === 0;
    const showSearchPending =
      isFiltering && searchPending && searchResults === null;

    return (
      <section className="page page--library">
        <div className="library-top">
          <PageHeader title="Library" subtitle={subtitle} />
          <div className="library-toolbar">
            <label className="library-search">
              <span className="sr-only">Search models</span>
              <input
                type="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search models…"
              />
            </label>

            <LibraryFiltersPanel
              filters={filters}
              tags={tags}
              collections={collections}
              projects={projects}
              onChange={setFilters}
            />

            <label className="library-sort">
              <span className="library-sort__label">Sort</span>
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
              >
                <option value="name">Name</option>
                <option value="addedAt">Date added</option>
                <option value="modifiedAt">Date modified</option>
                <option value="size">Size</option>
                <option value="type">Type</option>
              </select>
            </label>

            <button
              type="button"
              className="button button--ghost"
              onClick={() =>
                setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
              }
              aria-label={
                sortDirection === "asc" ? "Sort descending" : "Sort ascending"
              }
              title={sortDirection === "asc" ? "Ascending" : "Descending"}
            >
              {sortDirection === "asc" ? "Asc" : "Desc"}
            </button>

            <button
              type="button"
              className="button button--ghost"
              onClick={() => void rescan()}
              disabled={scanning || uploading}
            >
              {scanning ? "Refreshing…" : "Refresh"}
            </button>

            <button
              type="button"
              className="button button--primary"
              onClick={() => void uploadFiles()}
              disabled={uploading || scanning}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>

        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        {statusMessage && !error ? (
          <StatusBanner message={statusMessage} onDismiss={clearStatus} />
        ) : null}

        {activeFilterChips.length > 0 ? (
          <div className="library-active-filters" aria-label="Active filters">
            <span className="library-active-filters__label">Active:</span>
            <div className="library-active-filters__chips">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="library-active-filters__chip"
                  onClick={chip.onRemove}
                  title={`Remove ${chip.label}`}
                >
                  {chip.label}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              <button
                type="button"
                className="button button--ghost library-active-filters__clear"
                onClick={clearAllFilters}
              >
                Clear all
              </button>
            </div>
          </div>
        ) : null}

        {showCloudEmpty ? (
          <EmptyState
            title="Your cloud library is empty"
            description="Upload STL, 3MF, OBJ, or STEP files to get started."
            action={
              <button
                type="button"
                className="button button--primary"
                disabled={uploading}
                onClick={() => void uploadFiles()}
              >
                {uploading ? "Uploading…" : "Upload models"}
              </button>
            }
          />
        ) : null}

        {showSearchPending ? (
          <EmptyState
            title="Searching…"
            description="Looking for models that match your search and filters."
          />
        ) : null}

        {showNoSearchResults ? (
          <EmptyState
            title="No models found"
            description="Try adjusting your search or filters."
            action={
              <button
                type="button"
                className="button button--primary"
                onClick={clearSearchAndFilters}
              >
                Clear filters
              </button>
            }
          />
        ) : null}

        {!showCloudEmpty && !showNoSearchResults && !showSearchPending ? (
          <div
            className={`library-grid${
              isFiltering && searchPending ? " library-grid--pending" : ""
            }`}
          >
            {visibleFiles.map((file) => (
              <FileCard key={file.libraryFileId} file={file} />
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  if (locations.length === 0) {
    return (
      <section className="page">
        <PageHeader title="Library" subtitle="Your 3D models and projects" />
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <EmptyState
          title="Your library is empty"
          description="Add a folder to get started."
          action={
            <button type="button" className="button button--primary" onClick={() => void addFolder()}>
              Add folder
            </button>
          }
        />
      </section>
    );
  }

  const showEmptyFolder =
    !isFiltering &&
    browse.locationPath !== null &&
    visibleFolders.length === 0 &&
    visibleFiles.length === 0;

  const showNoSearchResults =
    isFiltering && !searchPending && visibleFiles.length === 0;
  const showSearchPending =
    isFiltering && searchPending && searchResults === null;
  const showPathOnCards = isFiltering;

  return (
    <section className="page page--library">
      <div className="library-top">
        <PageHeader title="Library" subtitle={subtitle} />
        <div className="library-toolbar">
          <label className="library-search">
            <span className="sr-only">Search models</span>
            <input
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search models…"
            />
          </label>

          <LibraryFiltersPanel
            filters={filters}
            tags={tags}
            collections={collections}
            projects={projects}
            onChange={setFilters}
          />

          <label className="library-sort">
            <span className="library-sort__label">Sort</span>
            <select
              value={sortField}
              onChange={(event) => setSortField(event.target.value as SortField)}
            >
              <option value="name">Name</option>
              <option value="addedAt">Date added</option>
              <option value="modifiedAt">Date modified</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
          </label>

          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
            }
            aria-label={
              sortDirection === "asc" ? "Sort descending" : "Sort ascending"
            }
            title={sortDirection === "asc" ? "Ascending" : "Descending"}
          >
            {sortDirection === "asc" ? "Asc" : "Desc"}
          </button>

          <button
            type="button"
            className="button button--ghost"
            onClick={() => void rescan()}
            disabled={scanning}
          >
            {scanning ? "Scanning…" : "Rescan"}
          </button>

          <button
            type="button"
            className="button button--primary"
            onClick={() => void addFolder()}
          >
            Add folder
          </button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      {activeFilterChips.length > 0 ? (
        <div className="library-active-filters" aria-label="Active filters">
          <span className="library-active-filters__label">Active:</span>
          <div className="library-active-filters__chips">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="library-active-filters__chip"
                onClick={chip.onRemove}
                title={`Remove ${chip.label}`}
              >
                {chip.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button
              type="button"
              className="button button--ghost library-active-filters__clear"
              onClick={clearAllFilters}
            >
              Clear all
            </button>
          </div>
        </div>
      ) : null}

      {resultsTruncated ? (
        <p className="library-results-hint" role="status">
          Showing the first 1 000 matches. Narrow your search or filters to see more.
        </p>
      ) : null}

      {!isFiltering ? <LibraryBreadcrumbs items={breadcrumbItems} /> : null}

      {showEmptyFolder ? (
        <EmptyState
          title="This folder doesn’t contain any supported 3D files."
          description="Supported formats: STL, 3MF, OBJ, STEP."
        />
      ) : null}

      {showSearchPending ? (
        <EmptyState
          title="Searching…"
          description="Looking for models that match your search and filters."
        />
      ) : null}

      {showNoSearchResults ? (
        <EmptyState
          title="No models found"
          description="Try adjusting your search or filters."
          action={
            <button
              type="button"
              className="button button--primary"
              onClick={clearSearchAndFilters}
            >
              Clear filters
            </button>
          }
        />
      ) : null}

      {!showEmptyFolder && !showNoSearchResults && !showSearchPending ? (
        <div
          className={`library-grid${
            isFiltering && searchPending ? " library-grid--pending" : ""
          }`}
        >
          {visibleFolders.map((folder) => (
            <FolderCard
              key={`${folder.locationPath}:${folder.relativeDir}:${folder.name}`}
              name={folder.name}
              detail={
                folder.itemCount === 1 ? "1 item" : `${folder.itemCount} items`
              }
              onOpen={() =>
                setBrowse({
                  locationPath: folder.locationPath,
                  relativeDir: folder.relativeDir,
                })
              }
            />
          ))}

          {visibleFiles.map((file) => (
            <FileCard
              key={file.libraryFileId}
              file={file}
              showPath={showPathOnCards}
              showLocation={showPathOnCards && locations.length > 1}
              locationName={locationNameByPath.get(file.locationPath)}
            />
          ))}
        </div>
      ) : null}

      {!isFiltering && browse.locationPath && browse.relativeDir ? (
        <div className="library-nav-hint">
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setBrowse({
                locationPath: browse.locationPath,
                relativeDir: parentRelativeDir(browse.relativeDir),
              })
            }
          >
            Back
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="banner banner--error" role="alert">
      <p>{message}</p>
      <button type="button" className="banner__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function StatusBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="banner banner--success" role="status">
      <p>{message}</p>
      <button type="button" className="banner__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
