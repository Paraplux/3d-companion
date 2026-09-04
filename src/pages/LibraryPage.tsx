import { useEffect, useMemo, useState } from "react";
import { FileCard } from "@/components/library/FileCard";
import { FolderCard } from "@/components/library/FolderCard";
import { LibraryBreadcrumbs } from "@/components/library/LibraryBreadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import {
  collectFolders,
  filesInDir,
  locationByPath,
  parentRelativeDir,
  sortFiles,
} from "@/lib/libraryBrowse";
import type { LibraryFile, SortDirection, SortField } from "@/types/library";

type BrowseState = {
  locationPath: string | null;
  relativeDir: string;
};

export function LibraryPage() {
  const {
    locations,
    files,
    ready,
    scanning,
    scanningLabel,
    error,
    clearError,
    addFolder,
    rescan,
    search,
  } = useLibrary();

  const [browse, setBrowse] = useState<BrowseState>({
    locationPath: null,
    relativeDir: "",
  });
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LibraryFile[] | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const isSearching = query.trim().length > 0;
  const currentLocation = browse.locationPath
    ? locationByPath(locations, browse.locationPath)
    : undefined;

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

  const visibleFolders = useMemo(() => {
    if (isSearching) {
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
  }, [browse.locationPath, browse.relativeDir, files, isSearching, locations]);

  const visibleFiles = useMemo(() => {
    if (isSearching) {
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
    isSearching,
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
        setBrowse({ locationPath: currentLocation.path, relativeDir: "" }),
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
  }, [browse.relativeDir, currentLocation]);

  const itemCountLabel = isSearching
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
    browse.locationPath !== null &&
    visibleFolders.length === 0 &&
    visibleFiles.length === 0;

  const showNoSearchResults = isSearching && visibleFiles.length === 0;

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

      {!isSearching ? <LibraryBreadcrumbs items={breadcrumbItems} /> : null}

      {showEmptyFolder ? (
        <EmptyState
          title="This folder doesn’t contain any supported 3D files."
          description="Supported formats: STL, 3MF, OBJ, STEP."
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
                })
              }
            />
          ))}

          {visibleFiles.map((file) => (
            <FileCard
              key={file.libraryFileId}
              file={file}
              showPath={isSearching}
              showLocation={isSearching && locations.length > 1}
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
