import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ask } from "@tauri-apps/plugin-dialog";
import { AddModelsButton } from "@/components/library/AddModelsButton";
import { FileCard } from "@/components/library/FileCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { toUserError } from "@/lib/libraryApi";
import { formatProjectCount, resolveProjectFiles } from "@/lib/projects";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    files,
    locations,
    projects,
    fileProjectMap,
    ready,
    updateProject,
    deleteProject,
    removeFileFromProject,
    error,
    clearError,
  } = useLibrary();

  const project = projectId
    ? projects.find((entry) => entry.id === projectId)
    : undefined;

  const fileIds = useMemo(() => {
    if (!projectId) {
      return [];
    }
    const ids: string[] = [];
    for (const [libraryFileId, projectIds] of Object.entries(fileProjectMap)) {
      if (projectIds.includes(projectId)) {
        ids.push(libraryFileId);
      }
    }
    return ids;
  }, [fileProjectMap, projectId]);

  const memberIds = useMemo(() => new Set(fileIds), [fileIds]);

  const models = useMemo(
    () => resolveProjectFiles(files, fileIds),
    [fileIds, files],
  );

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSave() {
    if (!project) {
      return;
    }
    const trimmed = draftName.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setLocalError(null);
    clearError();
    try {
      await updateProject(project.id, trimmed, draftDescription);
      setEditing(false);
    } catch (err) {
      setLocalError(toUserError(err, "Could not update that project."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!project) {
      return;
    }
    const confirmed = await ask(
      project.fileCount > 0
        ? `Delete “${project.name}”?\n\nIt contains ${project.fileCount} model${
            project.fileCount === 1 ? "" : "s"
          }. The models themselves will not be deleted.`
        : `Delete “${project.name}”?`,
      {
        title: "Delete project",
        kind: "warning",
      },
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    try {
      await deleteProject(project.id);
      navigate("/projects");
    } catch (err) {
      setLocalError(toUserError(err, "Could not delete that project."));
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

  if (!projectId || !project) {
    return (
      <section className="page">
        <EmptyState
          title="Project not found"
          description="This project may have been deleted."
          action={
            <Link className="button button--primary" to="/projects">
              Back to Projects
            </Link>
          }
        />
      </section>
    );
  }

  const subtitle = formatProjectCount(project.fileCount);
  const addButton = (
    <AddModelsButton
      kind="project"
      projectId={project.id}
      name={project.name}
      memberIds={memberIds}
    />
  );

  return (
    <section className="page page--library">
      <PageHeader
        title={project.name}
        subtitle={subtitle}
        trailing={
          <div className="project-detail__actions">
            {editing ? (
              <>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setLocalError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={busy || !draftName.trim()}
                  onClick={() => void handleSave()}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                {addButton}
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => {
                    setDraftName(project.name);
                    setDraftDescription(project.description ?? "");
                    setEditing(true);
                    setLocalError(null);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        }
      />

      <p className="project-detail__back">
        <Link to="/projects">← Projects</Link>
      </p>

      {editing ? (
        <form
          className="project-detail__edit"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <label className="project-detail__edit-label" htmlFor="edit-project-name">
            Name
          </label>
          <input
            id="edit-project-name"
            type="text"
            className="project-detail__edit-input"
            value={draftName}
            disabled={busy}
            autoFocus
            onChange={(event) => {
              setDraftName(event.target.value);
              setLocalError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditing(false);
                setLocalError(null);
              }
            }}
          />
          <label
            className="project-detail__edit-label"
            htmlFor="edit-project-description"
          >
            Description
          </label>
          <textarea
            id="edit-project-description"
            className="project-detail__edit-textarea"
            value={draftDescription}
            disabled={busy}
            rows={3}
            placeholder="Optional"
            onChange={(event) => {
              setDraftDescription(event.target.value);
              setLocalError(null);
            }}
          />
        </form>
      ) : project.description ? (
        <p className="project-detail__description">{project.description}</p>
      ) : null}

      {localError || error ? (
        <div className="banner banner--error" role="alert">
          <p>{localError ?? error}</p>
          <button
            type="button"
            className="banner__dismiss"
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {models.length === 0 ? (
        <EmptyState
          title="No models in this project"
          description="Add models from your library, or keep this project as a placeholder for later."
          action={addButton}
        />
      ) : (
        <div className="library-grid">
          {models.map((file) => (
            <FileCard
              key={file.libraryFileId}
              file={file}
              showPath
              showLocation={locations.length > 1}
              locationName={
                locations.find((location) => location.path === file.locationPath)
                  ?.name
              }
              onRemoveFromProject={() =>
                void removeFileFromProject(file.libraryFileId, project.id)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
