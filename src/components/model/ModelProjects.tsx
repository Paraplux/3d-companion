import { useMemo, useState } from "react";
import { ProjectPill } from "@/components/library/ProjectPill";
import { ModelOrgSection } from "@/components/model/ModelOrgSection";
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

  const normalizedQuery = query.trim();
  const suggestions = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    return projects
      .filter((project) => !assignedIds.has(project.id))
      .filter((project) =>
        needle ? project.name.toLowerCase().includes(needle) : true,
      )
      .slice(0, 12)
      .map((project) => ({
        id: project.id,
        name: project.name,
        fileCount: project.fileCount,
      }));
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
    <ModelOrgSection
      title="Projects"
      addAriaLabel="Add to project"
      dialogLabel="Add to project"
      assigned={assigned.map((project) => ({
        id: project.id,
        name: project.name,
        fileCount: project.fileCount,
      }))}
      suggestions={suggestions}
      query={query}
      onQueryChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      canCreate={canCreate}
      busy={busy}
      emptyHint="A shop, client, or series…"
      noMatchHint="No matching projects."
      onAttach={(id) => void attachExisting(id)}
      onCreate={() => void createAndAttach()}
      onEnterFallback={() => {
        if (exactMatch && !assignedIds.has(exactMatch.id)) {
          void attachExisting(exactMatch.id);
        }
      }}
      renderItem={(item) => {
        const project = assigned.find((entry) => entry.id === item.id);
        if (!project) {
          return null;
        }
        return (
          <ProjectPill
            key={project.id}
            project={project}
            onRemove={() =>
              void removeFileFromProject(libraryFileId, project.id)
            }
          />
        );
      }}
    />
  );
}
