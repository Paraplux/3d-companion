import { useEffect, useMemo, useRef, useState } from "react";
import { ProjectPill } from "@/components/library/ProjectPill";
import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type ModelProjectsProps = {
  libraryFileId: LibraryFileId;
};

export function ModelProjects({ libraryFileId }: ModelProjectsProps) {
  const {
    projects,
    projectsForLibraryFile,
    addFileToProject,
    removeFileFromProject,
    addProjectNameToFile,
  } = useLibrary();

  const assigned = projectsForLibraryFile(libraryFileId);
  const assignedIds = useMemo(
    () => new Set(assigned.map((project) => project.id)),
    [assigned],
  );

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = query.trim();
  const suggestions = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    return projects
      .filter((project) => !assignedIds.has(project.id))
      .filter((project) =>
        needle ? project.name.toLowerCase().includes(needle) : true,
      )
      .slice(0, 8);
  }, [assignedIds, normalizedQuery, projects]);

  const exactMatch = projects.find(
    (project) => project.name.toLowerCase() === normalizedQuery.toLowerCase(),
  );
  const canCreate =
    normalizedQuery.length > 0 &&
    !exactMatch &&
    !assigned.some(
      (project) => project.name.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function attachExisting(projectId: string) {
    setBusy(true);
    try {
      await addFileToProject(libraryFileId, projectId);
      setQuery("");
      setOpen(false);
    } catch {
      // Error surfaced via LibraryProvider.
    } finally {
      setBusy(false);
    }
  }

  async function createAndAttach() {
    if (!canCreate || busy) {
      return;
    }
    setBusy(true);
    try {
      await addProjectNameToFile(libraryFileId, normalizedQuery);
      setQuery("");
      setOpen(false);
    } catch {
      // Error surfaced via LibraryProvider.
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="model-meta-section model-projects" ref={rootRef}>
      <div className="model-projects__header">
        <h2 className="model-meta-section__title">Projects</h2>
        <div className="model-projects__action">
          <button
            type="button"
            className="model-projects__add"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => {
              setOpen((current) => !current);
              if (open) {
                setQuery("");
              }
            }}
          >
            Add
          </button>

          {open ? (
            <div
              className="model-projects__popover"
              role="dialog"
              aria-label="Add to project"
            >
              <input
                ref={inputRef}
                type="text"
                className="model-projects__input"
                value={query}
                disabled={busy}
                placeholder="Search or create…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (suggestions[0]) {
                      void attachExisting(suggestions[0].id);
                    } else if (canCreate) {
                      void createAndAttach();
                    } else if (exactMatch && !assignedIds.has(exactMatch.id)) {
                      void attachExisting(exactMatch.id);
                    }
                  }
                }}
              />

              <div className="model-projects__suggestions" role="listbox">
                {suggestions.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="model-projects__suggestion"
                    role="option"
                    disabled={busy}
                    onClick={() => void attachExisting(project.id)}
                  >
                    <span>{project.name}</span>
                    <span className="model-projects__suggestion-count">
                      {project.fileCount}
                    </span>
                  </button>
                ))}

                {canCreate ? (
                  <button
                    type="button"
                    className="model-projects__suggestion model-projects__suggestion--create"
                    disabled={busy}
                    onClick={() => void createAndAttach()}
                  >
                    Create “{normalizedQuery}”
                  </button>
                ) : null}

                {suggestions.length === 0 && !canCreate ? (
                  <p className="model-projects__suggestion-empty">
                    {normalizedQuery
                      ? "No matching projects."
                      : "Type to find a project."}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {assigned.length === 0 ? (
        <p className="model-projects__empty">No projects</p>
      ) : (
        <div className="model-projects__list">
          {assigned.map((project) => (
            <ProjectPill
              key={project.id}
              project={project}
              onRemove={() =>
                void removeFileFromProject(libraryFileId, project.id)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
