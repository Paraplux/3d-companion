import { useCallback, useState } from "react";
import { AddModelsModal } from "@/components/library/AddModelsModal";
import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type AddModelsButtonProps = {
  memberIds: Set<LibraryFileId>;
  name: string;
} & (
  | { kind: "project"; projectId: string }
  | { kind: "collection"; collectionId: string }
);

/**
 * Opens the shared library multi-select modal to add models to a
 * project or collection.
 */
export function AddModelsButton(props: AddModelsButtonProps) {
  const { addFilesToProject, addFilesToCollection } = useLibrary();
  const [open, setOpen] = useState(false);
  const kind = props.kind;
  const projectId = props.kind === "project" ? props.projectId : null;
  const collectionId = props.kind === "collection" ? props.collectionId : null;

  const onClose = useCallback(() => setOpen(false), []);

  const onAdd = useCallback(
    async (libraryFileIds: LibraryFileId[]) => {
      if (kind === "project" && projectId) {
        await addFilesToProject(libraryFileIds, projectId);
        return;
      }
      if (kind === "collection" && collectionId) {
        await addFilesToCollection(libraryFileIds, collectionId);
      }
    },
    [
      addFilesToCollection,
      addFilesToProject,
      collectionId,
      kind,
      projectId,
    ],
  );

  return (
    <>
      <button
        type="button"
        className="button button--primary"
        onClick={() => setOpen(true)}
      >
        Add models
      </button>
      <AddModelsModal
        open={open}
        onClose={onClose}
        title={`Add models to ${props.name}`}
        destinationLabel={kind === "project" ? "project" : "collection"}
        memberIds={props.memberIds}
        onAdd={onAdd}
      />
    </>
  );
}
