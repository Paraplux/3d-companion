import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LIBRARY_FORMAT_OPTIONS,
  countActiveFilters,
  toggleInList,
  type LibraryEcosystemFilter,
  type LibrarySearchFilters,
} from "@/lib/librarySearch";
import type { Collection, Project, Tag } from "@/types/library";
import type { FileFormat } from "@/types/filePresentation";

type LibraryFiltersPanelProps = {
  filters: LibrarySearchFilters;
  tags: Tag[];
  collections: Collection[];
  projects: Project[];
  onChange: (next: LibrarySearchFilters) => void;
};

export function LibraryFiltersPanel({
  filters,
  tags,
  collections,
  projects,
  onChange,
}: LibraryFiltersPanelProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeCount = countActiveFilters(filters);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function patch(partial: Partial<LibrarySearchFilters>) {
    onChange({ ...filters, ...partial });
  }

  function toggleFormat(format: FileFormat) {
    patch({ formats: toggleInList(filters.formats, format) });
  }

  function toggleId(
    key: "tagIds" | "collectionIds" | "projectIds",
    id: string,
  ) {
    patch({ [key]: toggleInList(filters[key], id) });
  }

  function setEcosystem(value: LibraryEcosystemFilter | null) {
    patch({ ecosystem: filters.ecosystem === value ? null : value });
  }

  return (
    <div className="library-filters" ref={rootRef}>
      <button
        type="button"
        className={`button button--ghost library-filters__trigger${
          activeCount > 0 ? " library-filters__trigger--active" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Filters
        {activeCount > 0 ? (
          <span className="library-filters__badge">{activeCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="library-filters__popover" role="dialog" aria-label="Library filters">
          <FilterSection title="Format">
            <div className="library-filters__chips">
              {LIBRARY_FORMAT_OPTIONS.map((option) => (
                <ToggleChip
                  key={option.value}
                  label={option.label}
                  active={filters.formats.includes(option.value)}
                  onClick={() => toggleFormat(option.value)}
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Favorite">
            <div className="library-filters__chips">
              <ToggleChip
                label="All"
                active={!filters.favoritesOnly}
                onClick={() => patch({ favoritesOnly: false })}
              />
              <ToggleChip
                label="Favorites only"
                active={filters.favoritesOnly}
                onClick={() => patch({ favoritesOnly: true })}
              />
            </div>
          </FilterSection>

          <FilterSection title="Ecosystem">
            <div className="library-filters__chips">
              <ToggleChip
                label="Bambu"
                active={filters.ecosystem === "bambu"}
                onClick={() => setEcosystem("bambu")}
              />
              <ToggleChip
                label="Unknown / none"
                active={filters.ecosystem === "none"}
                onClick={() => setEcosystem("none")}
              />
            </div>
          </FilterSection>

          {tags.length > 0 ? (
            <FilterSection title="Tags">
              <div className="library-filters__scroll">
                {tags.map((tag) => (
                  <label key={tag.id} className="library-filters__check">
                    <input
                      type="checkbox"
                      checked={filters.tagIds.includes(tag.id)}
                      onChange={() => toggleId("tagIds", tag.id)}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          ) : null}

          {collections.length > 0 ? (
            <FilterSection title="Collections">
              <div className="library-filters__scroll">
                {collections.map((collection) => (
                  <label key={collection.id} className="library-filters__check">
                    <input
                      type="checkbox"
                      checked={filters.collectionIds.includes(collection.id)}
                      onChange={() => toggleId("collectionIds", collection.id)}
                    />
                    <span>{collection.name}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          ) : null}

          {projects.length > 0 ? (
            <FilterSection title="Projects">
              <div className="library-filters__scroll">
                {projects.map((project) => (
                  <label key={project.id} className="library-filters__check">
                    <input
                      type="checkbox"
                      checked={filters.projectIds.includes(project.id)}
                      onChange={() => toggleId("projectIds", project.id)}
                    />
                    <span>{project.name}</span>
                  </label>
                ))}
              </div>
            </FilterSection>
          ) : null}

          {activeCount > 0 ? (
            <button
              type="button"
              className="button button--ghost library-filters__clear"
              onClick={() =>
                onChange({
                  ...filters,
                  formats: [],
                  favoritesOnly: false,
                  tagIds: [],
                  collectionIds: [],
                  projectIds: [],
                  ecosystem: null,
                })
              }
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="library-filters__section">
      <p className="library-filters__section-title">{title}</p>
      {children}
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`library-filters__chip${active ? " library-filters__chip--active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
