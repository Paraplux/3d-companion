import { useCallback, useEffect, useMemo, useState } from "react";
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
    ready,
    scanning,
    scanningLabel,
    error,
    clearError,
    addFolder,
    rescan,
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

  const filtering = hasActiveSearchOrFilters(filters);
  const currentLocation = browse.locationPath
    ? locationByPath(locations, browse.locationPath)
    : undefined;

  // Keep draft input in sync when URL changes (back/forward, clear).
  useEffect(() => {
    setDraftQuery(filters.query);
  }, [filters.query]);

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
    if (!filtering) {
      setSearchResults(null);
      setSearchPending(false);
      return;
    }

    let cancelled = false;
    setSearchPending(true);
    const delayMs = filters.query.trim().length > 0 ? 180 : 0;
    const handle = window.setTimeout(() => {
      void search(toSearchRequest(filters)).then((results) => {
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
  }, [filtering, filters, search]);

  const visibleFolders = useMemo(() => {
    if (filtering) {
      return [];
    }

    if (!browse.locationPath) {
      return locations.map((location) => ({
        name: location.name,
        relativeDir: "",
        locationPath: location.path,
        itemCount: files.filter((file) => file.locationPath === location.path).length,
      }));
    }

    return collectFolders(files, browse.locationPath, browse.relativeDir);
  }, [browse.locationPath, browse.relativeDir, files, filtering, locations]);

  const visibleFiles = useMemo(() => {
    if (filtering) {
      return sortFiles(searchResults ?? [], sortField, sortDirection);
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
    files,
    filtering,
    searchResults,
    sortDirection,
    sortField,
  ]);

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

  const itemCountLabel = filtering
    ? `${visibleFiles.length} result${visibleFiles.length === 1 ? "" : "s"}`
    : browse.locationPath
      ? `${visibleFolders.length + visibleFiles.length} item${
          visibleFolders.length + visibleFiles.length === 1 ? "" : "s"
        }`
      : `${locations.length} location${locations.length === 1 ? "" : "s"}`;

  const subtitle = scanningLabel
    ? scanningLabel
    : locations.length === 0
      ? "Your 3D models and projects"
      : currentLocation
        ? `${currentLocation.name} · ${itemCountLabel}`
        : filtering
          ? itemCountLabel
          : `${itemCountLabel}`;

  if (!ready && scanning) {
    return (
      <section className="page">
        <PageHeader title="Library" subtitle="Scanning…" />
        <EmptyState title="Scanning…" description="Looking for 3D files in your folders." />
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
    !filtering &&
    browse.locationPath !== null &&
    visibleFolders.length === 0 &&
    visibleFiles.length === 0;

  const showNoSearchResults =
    filtering && !searchPending && visibleFiles.length === 0;
  const showSearchPending =
    filtering && searchPending && searchResults === null;
  const showPathOnCards = filtering;

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
              onChange={(event) => {
                const value = event.target.value;
                setDraftQuery(value);
                setFilters({ ...filters, query: value });
              }}
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

      {!filtering ? <LibraryBreadcrumbs items={breadcrumbItems} /> : null}

      {showEmptyFolder ? (
        <EmptyState
          title="This folder doesn’t contain any supported 3D files."
          description="Supported formats: STL, 3MF, OBJ, STEP."
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
        <div className="library-grid">
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
              locationName={
                locationByPath(locations, file.locationPath)?.name
              }
            />
          ))}
        </div>
      ) : null}

      {!filtering && browse.locationPath && browse.relativeDir ? (
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
