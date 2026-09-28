import { useMemo, useState } from "react";
import { CollectionPill } from "@/components/library/CollectionPill";
import { ModelOrgSection } from "@/components/model/ModelOrgSection";
import { useLibrary } from "@/hooks/useLibrary";
import type { LibraryFileId } from "@/types/libraryData";

type ModelCollectionsProps = {
  libraryFileId: LibraryFileId;
};

export function ModelCollections({ libraryFileId }: ModelCollectionsProps) {
  const {
    collections,
    collectionsForLibraryFile,
    addFileToCollection,
    removeFileFromCollection,
    addCollectionNameToFile,
  } = useLibrary();

  const assigned = collectionsForLibraryFile(libraryFileId);
  const assignedIds = useMemo(
    () => new Set(assigned.map((collection) => collection.id)),
    [assigned],
  );

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const normalizedQuery = query.trim();
  const suggestions = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    return collections
      .filter((collection) => !assignedIds.has(collection.id))
      .filter((collection) =>
        needle ? collection.name.toLowerCase().includes(needle) : true,
      )
      .slice(0, 12)
      .map((collection) => ({
        id: collection.id,
        name: collection.name,
        fileCount: collection.fileCount,
      }));
  }, [assignedIds, collections, normalizedQuery]);

  const exactMatch = collections.find(
    (collection) =>
      collection.name.toLowerCase() === normalizedQuery.toLowerCase(),
  );
  const canCreate =
    normalizedQuery.length > 0 &&
    !exactMatch &&
    !assigned.some(
      (collection) =>
        collection.name.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  async function attachExisting(collectionId: string) {
    setBusy(true);
    try {
      await addFileToCollection(libraryFileId, collectionId);
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
      await addCollectionNameToFile(libraryFileId, normalizedQuery);
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
      title="Collections"
      addAriaLabel="Add to collection"
      dialogLabel="Add to collection"
      assigned={assigned.map((collection) => ({
        id: collection.id,
        name: collection.name,
        fileCount: collection.fileCount,
      }))}
      suggestions={suggestions}
      query={query}
      onQueryChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      canCreate={canCreate}
      busy={busy}
      emptyHint="A theme or mood — Halloween, gifts…"
      noMatchHint="No matching collections."
      onAttach={(id) => void attachExisting(id)}
      onCreate={() => void createAndAttach()}
      onEnterFallback={() => {
        if (exactMatch && !assignedIds.has(exactMatch.id)) {
          void attachExisting(exactMatch.id);
        }
      }}
      renderItem={(item) => {
        const collection = assigned.find((entry) => entry.id === item.id);
        if (!collection) {
          return null;
        }
        return (
          <CollectionPill
            key={collection.id}
            collection={collection}
            onRemove={() =>
              void removeFileFromCollection(libraryFileId, collection.id)
            }
          />
        );
      }}
    />
  );
}
