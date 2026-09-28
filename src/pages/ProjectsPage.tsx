import { useEffect, useMemo, useRef, useState } from "react";
import { ProjectCard } from "@/components/library/ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { toUserError } from "@/lib/libraryApi";

export function ProjectsPage() {
  const { files, projects, ready, createProject, error, clearError } =
    useLibrary();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const filesById = useMemo(() => {
    const map = new Map(files.map((file) => [file.libraryFileId, file]));
    return map;
  }, [files]);

  useEffect(() => {
    if (!createOpen) {
      return;
    }
    inputRef.current?.focus();

    function onPointerDown(event: MouseEvent) {
      if (!formRef.current?.contains(event.target as Node)) {
        setCreateOpen(false);
        setName("");
        setDescription("");
        setLocalError(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateOpen(false);
        setName("");
        setDescription("");
        setLocalError(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createOpen]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setLocalError(null);
    clearError();
    try {
      await createProject(trimmed, description);
      setName("");
      setDescription("");
      setCreateOpen(false);
    } catch (err) {
      setLocalError(toUserError(err, "Could not create that project."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <section className="page">
        <p className="page-loading">Loading…</p>
      </section>
    );
  }

  const subtitle =
    projects.length === 0
      ? "A body of work — a shop, a client, a series"
      : projects.length === 1
        ? "1 project"
        : `${projects.length} projects`;

  return (
    <section className="page page--library">
      <PageHeader
        title="Projects"
        subtitle={subtitle}
        trailing={
          <div className="projects-create" ref={formRef}>
            <button
              type="button"
              className="button button--primary"
              aria-expanded={createOpen}
              onClick={() => {
                setCreateOpen((current) => !current);
                setLocalError(null);
                if (createOpen) {
                  setName("");
                  setDescription("");
                }
              }}
            >
              New project
            </button>

            {createOpen ? (
              <form
                className="projects-create__popover"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleCreate();
                }}
              >
                <label className="projects-create__label" htmlFor="project-name">
                  Name
                </label>
                <input
                  id="project-name"
                  ref={inputRef}
                  type="text"
                  className="projects-create__input"
                  value={name}
                  disabled={busy}
                  placeholder="e.g. Elodyssée"
                  onChange={(event) => {
                    setName(event.target.value);
                    setLocalError(null);
                  }}
                />
                <label
                  className="projects-create__label"
                  htmlFor="project-description"
                >
                  Description
                </label>
                <textarea
                  id="project-description"
                  className="projects-create__textarea"
                  value={description}
                  disabled={busy}
                  rows={2}
                  placeholder="Optional"
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setLocalError(null);
                  }}
                />
                {localError || error ? (
                  <p className="projects-create__error" role="alert">
                    {localError ?? error}
                  </p>
                ) : null}
                <div className="projects-create__actions">
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() => {
                      setCreateOpen(false);
                      setName("");
                      setDescription("");
                      setLocalError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={busy || !name.trim()}
                  >
                    Create
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project for a shop, a client, or a print series — then add the models that belong to it."
          action={
            <button
              type="button"
              className="button button--primary"
              onClick={() => setCreateOpen(true)}
            >
              New project
            </button>
          }
        />
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              filesById={filesById}
            />
          ))}
        </div>
      )}
    </section>
  );
}
