import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileCard } from "@/components/library/FileCard";
import { FolderCard } from "@/components/library/FolderCard";
import { LibraryBreadcrumbs } from "@/components/library/LibraryBreadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import {
  browseFromSearchParams,
  browseToSearchParams,
  collectFolders,
  filesInDir,
  locationByPath,
  parentRelativeDir,
  sortFiles,
  type BrowseState,
} from "@/lib/libraryBrowse";
import { filterFilesByTag } from "@/lib/tags";
import type { LibraryFile, SortDirection, SortField } from "@/types/library";

export function LibraryPage() {
  const {
    locations,
    files,
    tags,
    fileTagMap,
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
  const browse = useMemo(
    () => browseFromSearchParams(searchParams),
    [searchParams],
  );

  const setBrowse = useCallback(
    (next: BrowseState) => {
      setSearchParams(browseToSearchParams(next), { replace: false });
    },
    [setSearchParams],
  );

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LibraryFile[] | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const isSearching = query.trim().length > 0;
  const activeTag = browse.tagId
    ? tags.find((tag) => tag.id === browse.tagId)
    : undefined;
  const currentLocation = browse.locationPath
    ? locationByPath(locations, browse.locationPath)
    : undefined;

  // Drop stale folder / tag params.
  useEffect(() => {
    if (browse.locationPath && locations.length > 0) {
      if (!locationByPath(locations, browse.locationPath)) {
        setBrowse({
          locationPath: null,
          relativeDir: "",
          tagId: browse.tagId,
        });
        return;
      }
    }
    if (browse.tagId && tags.length > 0 && !tags.some((tag) => tag.id === browse.tagId)) {
      setBrowse({
        locationPath: browse.locationPath,
        relativeDir: browse.relativeDir,
        tagId: null,
      });
    }
  }, [browse, locations, setBrowse, tags]);

  useEffect(() => {
    if (!isSearching) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      void search(query).then((results) => {
        if (!cancelled) {
          setSearchResults(results);
        }
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isSearching, query, search]);

  const scopedFiles = useMemo(
    () => filterFilesByTag(files, fileTagMap, browse.tagId),
    [browse.tagId, fileTagMap, files],
  );

  const visibleFolders = useMemo(() => {
    if (isSearching) {
      return [];
    }

    // Flat tagged results at library root.
    if (browse.tagId && !browse.locationPath) {
      return [];
    }

    if (!browse.locationPath) {
      return locations.map((location) => ({
        name: location.name,
        relativeDir: "",
        locationPath: location.path,
        itemCount: scopedFiles.filter((file) => file.locationPath === location.path)
          .length,
      }));
    }

    return collectFolders(scopedFiles, browse.locationPath, browse.relativeDir);
  }, [
    browse.locationPath,
    browse.relativeDir,
    browse.tagId,
    isSearching,
    locations,
    scopedFiles,
  ]);

  const visibleFiles = useMemo(() => {
    if (isSearching) {
      return sortFiles(
        filterFilesByTag(searchResults ?? [], fileTagMap, browse.tagId),
        sortField,
        sortDirection,
      );
    }

    if (!browse.locationPath) {
      if (browse.tagId) {
        return sortFiles(scopedFiles, sortField, sortDirection);
      }
      return [];
    }

    return sortFiles(
      filesInDir(scopedFiles, browse.locationPath, browse.relativeDir),
      sortField,
      sortDirection,
    );
  }, [
    browse.locationPath,
    browse.relativeDir,
    browse.tagId,
    fileTagMap,
    isSearching,
    scopedFiles,
    searchResults,
    sortDirection,
    sortField,
  ]);

  const breadcrumbItems = useMemo(() => {
    const items: Array<{ label: string; onClick?: () => void }> = [
      {
        label: "Library",
        onClick: () =>
          setBrowse({
            locationPath: null,
            relativeDir: "",
            tagId: browse.tagId,
          }),
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
          tagId: browse.tagId,
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
                  tagId: browse.tagId,
                }),
        });
      }
    }

    return items;
  }, [browse.relativeDir, browse.tagId, currentLocation, setBrowse]);

  const itemCountLabel = isSearching
    ? `${visibleFiles.length} result${visibleFiles.length === 1 ? "" : "s"}`
    : browse.locationPath || browse.tagId
      ? `${visibleFolders.length + visibleFiles.length} item${
          visibleFolders.length + visibleFiles.length === 1 ? "" : "s"
        }`
      : `${locations.length} location${locations.length === 1 ? "" : "s"}`;

  const subtitle = scanningLabel
    ? scanningLabel
    : locations.length === 0
      ? "Your 3D models and projects"
      : activeTag && !currentLocation
        ? `Tag · ${activeTag.name} · ${itemCountLabel}`
        : currentLocation
          ? `${currentLocation.name} · ${itemCountLabel}`
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
    !isSearching &&
    (browse.locationPath !== null || browse.tagId !== null) &&
    visibleFolders.length === 0 &&
    visibleFiles.length === 0;

  const showNoSearchResults = isSearching && visibleFiles.length === 0;
  const showPathOnCards = isSearching || Boolean(browse.tagId && !browse.locationPath);

  return (
    <section className="page page--library">
      <div className="library-top">
        <PageHeader title="Library" subtitle={subtitle} />
        <div className="library-toolbar">
          <label className="library-search">
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
            />
          </label>

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

      {activeTag ? (
        <div className="library-filter-chip">
          <span>
            Tag: <strong>{activeTag.name}</strong>
          </span>
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setBrowse({
                locationPath: browse.locationPath,
                relativeDir: browse.relativeDir,
                tagId: null,
              })
            }
          >
            Clear
          </button>
        </div>
      ) : null}

      {!isSearching ? <LibraryBreadcrumbs items={breadcrumbItems} /> : null}

      {showEmptyFolder ? (
        <EmptyState
          title={
            activeTag
              ? `No models tagged “${activeTag.name}” here.`
              : "This folder doesn’t contain any supported 3D files."
          }
          description={
            activeTag
              ? "Try another folder, or clear the tag filter."
              : "Supported formats: STL, 3MF, OBJ, STEP."
          }
        />
      ) : null}

      {showNoSearchResults ? (
        <EmptyState
          title="No matching files"
          description="Try another name, extension, or path."
        />
      ) : null}

      {!showEmptyFolder && !showNoSearchResults ? (
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
                  tagId: browse.tagId,
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

      {!isSearching && browse.locationPath && browse.relativeDir ? (
        <div className="library-nav-hint">
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setBrowse({
                locationPath: browse.locationPath,
                relativeDir: parentRelativeDir(browse.relativeDir),
                tagId: browse.tagId,
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
