import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { ask, open } from "@tauri-apps/plugin-dialog";
import {
  addFavorite as addFavoriteApi,
  addFileTag as addFileTagApi,
  addFileToCollection as addFileToCollectionApi,
  addFileToProject as addFileToProjectApi,
  addLibraryLocation,
  createCollection as createCollectionApi,
  createProject as createProjectApi,
  createTag as createTagApi,
  deleteCollection as deleteCollectionApi,
  deleteFileNote as deleteFileNoteApi,
  deleteProject as deleteProjectApi,
  deleteTag as deleteTagApi,
  getAllFileCollections,
  getAllFileNotes,
  getAllFileProjects,
  getAllFileTags,
  getCollections,
  getFavoriteIds,
  getLibrarySnapshot,
  getProjects,
  getTags,
  removeFavorite as removeFavoriteApi,
  removeFileFromCollection as removeFileFromCollectionApi,
  removeFileFromProject as removeFileFromProjectApi,
  removeFileTag as removeFileTagApi,
  removeLibraryLocation,
  renameCollection as renameCollectionApi,
  renameTag as renameTagApi,
  scanLibrary,
  searchLibraryFiles,
  toUserError,
  updateProject as updateProjectApi,
  upsertFileNote as upsertFileNoteApi,
} from "@/lib/libraryApi";
import { buildFileCollectionMap, collectionsForFile } from "@/lib/collections";
import type { LibrarySearchRequest } from "@/lib/librarySearch";
import { buildFileNoteMap, hasFileNote } from "@/lib/notes";
import { buildFileProjectMap, projectsForFile } from "@/lib/projects";
import { buildFileTagMap, tagsForFile } from "@/lib/tags";
import type {
  Collection,
  FileNote,
  LibraryEvent,
  LibraryFile,
  LibraryLocation,
  Project,
  Tag,
} from "@/types/library";
import type { LibraryFileId } from "@/types/libraryData";

type LibraryContextValue = {
  locations: LibraryLocation[];
  files: LibraryFile[];
  favoriteIds: LibraryFileId[];
  tags: Tag[];
  fileTagMap: Record<LibraryFileId, string[]>;
  collections: Collection[];
  fileCollectionMap: Record<LibraryFileId, string[]>;
  projects: Project[];
  fileProjectMap: Record<LibraryFileId, string[]>;
  fileNoteMap: Record<LibraryFileId, FileNote>;
  ready: boolean;
  scanning: boolean;
  scanningLabel: string | null;
  error: string | null;
  clearError: () => void;
  addFolder: () => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  rescan: () => Promise<void>;
  search: (request: LibrarySearchRequest) => Promise<LibraryFile[]>;
  isFavorite: (libraryFileId: LibraryFileId) => boolean;
  addFavorite: (libraryFileId: LibraryFileId) => Promise<void>;
  removeFavorite: (libraryFileId: LibraryFileId) => Promise<void>;
  toggleFavorite: (libraryFileId: LibraryFileId) => Promise<void>;
  tagsForLibraryFile: (libraryFileId: LibraryFileId) => Tag[];
  createTag: (name: string) => Promise<Tag>;
  renameTag: (tagId: string, name: string) => Promise<Tag>;
  deleteTag: (tagId: string) => Promise<void>;
  addTagToFile: (libraryFileId: LibraryFileId, tagId: string) => Promise<void>;
  removeTagFromFile: (libraryFileId: LibraryFileId, tagId: string) => Promise<void>;
  addTagNameToFile: (libraryFileId: LibraryFileId, name: string) => Promise<Tag>;
  collectionsForLibraryFile: (libraryFileId: LibraryFileId) => Collection[];
  createCollection: (name: string) => Promise<Collection>;
  renameCollection: (collectionId: string, name: string) => Promise<Collection>;
  deleteCollection: (collectionId: string) => Promise<void>;
  addFileToCollection: (
    libraryFileId: LibraryFileId,
    collectionId: string,
  ) => Promise<void>;
  removeFileFromCollection: (
    libraryFileId: LibraryFileId,
    collectionId: string,
  ) => Promise<void>;
  addCollectionNameToFile: (
    libraryFileId: LibraryFileId,
    name: string,
  ) => Promise<Collection>;
  projectsForLibraryFile: (libraryFileId: LibraryFileId) => Project[];
  createProject: (name: string, description?: string | null) => Promise<Project>;
  updateProject: (
    projectId: string,
    name: string,
    description?: string | null,
  ) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  addFileToProject: (
    libraryFileId: LibraryFileId,
    projectId: string,
  ) => Promise<void>;
  removeFileFromProject: (
    libraryFileId: LibraryFileId,
    projectId: string,
  ) => Promise<void>;
  addProjectNameToFile: (
    libraryFileId: LibraryFileId,
    name: string,
  ) => Promise<Project>;
  hasNote: (libraryFileId: LibraryFileId) => boolean;
  noteForLibraryFile: (libraryFileId: LibraryFileId) => FileNote | null;
  upsertFileNote: (
    libraryFileId: LibraryFileId,
    content: string,
  ) => Promise<FileNote | null>;
  deleteFileNote: (libraryFileId: LibraryFileId) => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

async function loadTagState(): Promise<{
  tags: Tag[];
  fileTagMap: Record<LibraryFileId, string[]>;
}> {
  const [tags, relations] = await Promise.all([getTags(), getAllFileTags()]);
  return {
    tags,
    fileTagMap: buildFileTagMap(relations),
  };
}

async function loadCollectionState(): Promise<{
  collections: Collection[];
  fileCollectionMap: Record<LibraryFileId, string[]>;
}> {
  const [collections, relations] = await Promise.all([
    getCollections(),
    getAllFileCollections(),
  ]);
  return {
    collections,
    fileCollectionMap: buildFileCollectionMap(relations),
  };
}

async function loadProjectState(): Promise<{
  projects: Project[];
  fileProjectMap: Record<LibraryFileId, string[]>;
}> {
  const [projects, relations] = await Promise.all([
    getProjects(),
    getAllFileProjects(),
  ]);
  return {
    projects,
    fileProjectMap: buildFileProjectMap(relations),
  };
}

async function loadNoteState(): Promise<Record<LibraryFileId, FileNote>> {
  const notes = await getAllFileNotes();
  return buildFileNoteMap(notes);
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<LibraryLocation[]>([]);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<LibraryFileId[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [fileTagMap, setFileTagMap] = useState<Record<LibraryFileId, string[]>>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [fileCollectionMap, setFileCollectionMap] = useState<
    Record<LibraryFileId, string[]>
  >({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [fileProjectMap, setFileProjectMap] = useState<
    Record<LibraryFileId, string[]>
  >({});
  const [fileNoteMap, setFileNoteMap] = useState<Record<LibraryFileId, FileNote>>(
    {},
  );
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningLabel, setScanningLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshTags = useCallback(async () => {
    const next = await loadTagState();
    setTags(next.tags);
    setFileTagMap(next.fileTagMap);
  }, []);

  const refreshCollections = useCallback(async () => {
    const next = await loadCollectionState();
    setCollections(next.collections);
    setFileCollectionMap(next.fileCollectionMap);
  }, []);

  const refreshProjects = useCallback(async () => {
    const next = await loadProjectState();
    setProjects(next.projects);
    setFileProjectMap(next.fileProjectMap);
  }, []);

  const refreshNotes = useCallback(async () => {
    setFileNoteMap(await loadNoteState());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [snapshot, favorites, tagState, collectionState, projectState, notes] =
          await Promise.all([
            getLibrarySnapshot(),
            getFavoriteIds(),
            loadTagState(),
            loadCollectionState(),
            loadProjectState(),
            loadNoteState(),
          ]);
        if (cancelled) {
          return;
        }
        setLocations(snapshot.locations);
        setFiles(snapshot.files);
        setFavoriteIds(favorites);
        setTags(tagState.tags);
        setFileTagMap(tagState.fileTagMap);
        setCollections(collectionState.collections);
        setFileCollectionMap(collectionState.fileCollectionMap);
        setProjects(projectState.projects);
        setFileProjectMap(projectState.fileProjectMap);
        setFileNoteMap(notes);
        setError(null);
        if (snapshot.reconciling) {
          setScanning(true);
          setScanningLabel("Updating library…");
        }
      } catch (err) {
        if (!cancelled) {
          setError(toUserError(err, "Could not load your library."));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<LibraryEvent>("library://changed", (event) => {
      const payload = event.payload;

      if (payload.type === "locationUpdated") {
        setFiles((current) => [
          ...current.filter((file) => file.locationPath !== payload.locationPath),
          ...payload.files,
        ]);
        return;
      }

      if (payload.type === "locationRemoved") {
        setLocations((current) =>
          current.filter((location) => location.path !== payload.locationPath),
        );
        setFiles((current) =>
          current.filter((file) => file.locationPath !== payload.locationPath),
        );
        void refreshNotes();
        return;
      }

      if (payload.type === "reconciliationFinished") {
        setFiles(payload.files);
        setScanning(false);
        setScanningLabel(null);
        void refreshNotes();
        return;
      }

      if (payload.type === "fileAnalyzed") {
        setFiles((current) => {
          const index = current.findIndex(
            (file) => file.libraryFileId === payload.file.libraryFileId,
          );
          if (index === -1) {
            return [...current, payload.file];
          }
          const next = current.slice();
          next[index] = payload.file;
          return next;
        });
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [refreshNotes]);

  const addFolder = useCallback(async () => {
    clearError();

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Add library folder",
      });

      if (selected === null || Array.isArray(selected)) {
        return;
      }

      setScanning(true);
      setScanningLabel("Scanning…");

      const result = await addLibraryLocation(selected);
      setScanningLabel(`Indexing ${result.location.name}…`);
      setLocations((current) => {
        if (current.some((location) => location.path === result.location.path)) {
          return current;
        }
        return [...current, result.location];
      });
      setFiles((current) => [
        ...current.filter((file) => file.locationPath !== result.location.path),
        ...result.files,
      ]);
    } catch (err) {
      setError(toUserError(err, "Could not add that folder."));
    } finally {
      setScanning(false);
      setScanningLabel(null);
    }
  }, [clearError]);

  const removeFolder = useCallback(
    async (path: string) => {
      clearError();

      const location = locations.find((item) => item.path === path);
      const confirmed = await ask(
        "Remove this folder from your library?\n\nYour files will not be deleted.",
        {
          title: location ? `Remove “${location.name}”` : "Remove folder",
          kind: "warning",
        },
      );

      if (!confirmed) {
        return;
      }

      try {
        await removeLibraryLocation(path);
        setLocations((current) => current.filter((item) => item.path !== path));
        setFiles((current) => current.filter((file) => file.locationPath !== path));
      } catch (err) {
        setError(toUserError(err, "Could not remove that folder."));
      }
    },
    [clearError, locations],
  );

  const rescan = useCallback(async () => {
    clearError();
    setScanning(true);
    setScanningLabel("Scanning…");

    try {
      const nextFiles = await scanLibrary();
      setFiles(nextFiles);
    } catch (err) {
      setError(toUserError(err, "Could not scan your library."));
    } finally {
      setScanning(false);
      setScanningLabel(null);
    }
  }, [clearError]);

  const search = useCallback(async (request: LibrarySearchRequest) => {
    return searchLibraryFiles(request);
  }, []);

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const isFavorite = useCallback(
    (libraryFileId: LibraryFileId) => favoriteIdSet.has(libraryFileId),
    [favoriteIdSet],
  );

  const addFavorite = useCallback(
    async (libraryFileId: LibraryFileId) => {
      clearError();
      let previous: LibraryFileId[] | null = null;
      setFavoriteIds((current) => {
        previous = current;
        return current.includes(libraryFileId) ? current : [libraryFileId, ...current];
      });

      try {
        await addFavoriteApi(libraryFileId);
      } catch (err) {
        if (previous) {
          setFavoriteIds(previous);
        }
        setError(toUserError(err, "Could not add that favorite."));
      }
    },
    [clearError],
  );

  const removeFavorite = useCallback(
    async (libraryFileId: LibraryFileId) => {
      clearError();
      let previous: LibraryFileId[] | null = null;
      setFavoriteIds((current) => {
        previous = current;
        return current.filter((id) => id !== libraryFileId);
      });

      try {
        await removeFavoriteApi(libraryFileId);
      } catch (err) {
        if (previous) {
          setFavoriteIds(previous);
        }
        setError(toUserError(err, "Could not remove that favorite."));
      }
    },
    [clearError],
  );

  const toggleFavorite = useCallback(
    async (libraryFileId: LibraryFileId) => {
      if (favoriteIdSet.has(libraryFileId)) {
        await removeFavorite(libraryFileId);
        return;
      }
      await addFavorite(libraryFileId);
    },
    [addFavorite, favoriteIdSet, removeFavorite],
  );

  const tagsForLibraryFile = useCallback(
    (libraryFileId: LibraryFileId) => tagsForFile(tags, fileTagMap, libraryFileId),
    [fileTagMap, tags],
  );

  const createTag = useCallback(
    async (name: string) => {
      clearError();
      try {
        const tag = await createTagApi(name);
        await refreshTags();
        return tag;
      } catch (err) {
        setError(toUserError(err, "Could not create that tag."));
        throw err;
      }
    },
    [clearError, refreshTags],
  );

  const renameTag = useCallback(
    async (tagId: string, name: string) => {
      clearError();
      try {
        const tag = await renameTagApi(tagId, name);
        await refreshTags();
        return tag;
      } catch (err) {
        setError(toUserError(err, "Could not rename that tag."));
        throw err;
      }
    },
    [clearError, refreshTags],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      clearError();
      try {
        await deleteTagApi(tagId);
        await refreshTags();
      } catch (err) {
        setError(toUserError(err, "Could not delete that tag."));
        throw err;
      }
    },
    [clearError, refreshTags],
  );

  const addTagToFile = useCallback(
    async (libraryFileId: LibraryFileId, tagId: string) => {
      clearError();
      setFileTagMap((current) => {
        const existing = current[libraryFileId] ?? [];
        if (existing.includes(tagId)) {
          return current;
        }
        return { ...current, [libraryFileId]: [...existing, tagId] };
      });

      try {
        await addFileTagApi(libraryFileId, tagId);
        await refreshTags();
      } catch (err) {
        await refreshTags();
        setError(toUserError(err, "Could not add that tag."));
        throw err;
      }
    },
    [clearError, refreshTags],
  );

  const removeTagFromFile = useCallback(
    async (libraryFileId: LibraryFileId, tagId: string) => {
      clearError();
      setFileTagMap((current) => {
        const existing = current[libraryFileId];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [libraryFileId]: existing.filter((id) => id !== tagId),
        };
      });

      try {
        await removeFileTagApi(libraryFileId, tagId);
        await refreshTags();
      } catch (err) {
        await refreshTags();
        setError(toUserError(err, "Could not remove that tag."));
        throw err;
      }
    },
    [clearError, refreshTags],
  );

  const addTagNameToFile = useCallback(
    async (libraryFileId: LibraryFileId, name: string) => {
      const tag = await createTag(name);
      await addTagToFile(libraryFileId, tag.id);
      return tag;
    },
    [addTagToFile, createTag],
  );

  const collectionsForLibraryFile = useCallback(
    (libraryFileId: LibraryFileId) =>
      collectionsForFile(collections, fileCollectionMap, libraryFileId),
    [collections, fileCollectionMap],
  );

  const createCollection = useCallback(
    async (name: string) => {
      clearError();
      try {
        const collection = await createCollectionApi(name);
        await refreshCollections();
        return collection;
      } catch (err) {
        setError(toUserError(err, "Could not create that collection."));
        throw err;
      }
    },
    [clearError, refreshCollections],
  );

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      clearError();
      try {
        const collection = await renameCollectionApi(collectionId, name);
        await refreshCollections();
        return collection;
      } catch (err) {
        setError(toUserError(err, "Could not rename that collection."));
        throw err;
      }
    },
    [clearError, refreshCollections],
  );

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      clearError();
      try {
        await deleteCollectionApi(collectionId);
        await refreshCollections();
      } catch (err) {
        setError(toUserError(err, "Could not delete that collection."));
        throw err;
      }
    },
    [clearError, refreshCollections],
  );

  const addFileToCollection = useCallback(
    async (libraryFileId: LibraryFileId, collectionId: string) => {
      clearError();
      setFileCollectionMap((current) => {
        const existing = current[libraryFileId] ?? [];
        if (existing.includes(collectionId)) {
          return current;
        }
        return { ...current, [libraryFileId]: [...existing, collectionId] };
      });

      try {
        await addFileToCollectionApi(libraryFileId, collectionId);
        await refreshCollections();
      } catch (err) {
        await refreshCollections();
        setError(toUserError(err, "Could not add that model to the collection."));
        throw err;
      }
    },
    [clearError, refreshCollections],
  );

  const removeFileFromCollection = useCallback(
    async (libraryFileId: LibraryFileId, collectionId: string) => {
      clearError();
      setFileCollectionMap((current) => {
        const existing = current[libraryFileId];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [libraryFileId]: existing.filter((id) => id !== collectionId),
        };
      });

      try {
        await removeFileFromCollectionApi(libraryFileId, collectionId);
        await refreshCollections();
      } catch (err) {
        await refreshCollections();
        setError(toUserError(err, "Could not remove that model from the collection."));
        throw err;
      }
    },
    [clearError, refreshCollections],
  );

  const addCollectionNameToFile = useCallback(
    async (libraryFileId: LibraryFileId, name: string) => {
      const collection = await createCollection(name);
      await addFileToCollection(libraryFileId, collection.id);
      return collection;
    },
    [addFileToCollection, createCollection],
  );

  const projectsForLibraryFile = useCallback(
    (libraryFileId: LibraryFileId) =>
      projectsForFile(projects, fileProjectMap, libraryFileId),
    [fileProjectMap, projects],
  );

  const createProject = useCallback(
    async (name: string, description?: string | null) => {
      clearError();
      try {
        const project = await createProjectApi(name, description);
        await refreshProjects();
        return project;
      } catch (err) {
        setError(toUserError(err, "Could not create that project."));
        throw err;
      }
    },
    [clearError, refreshProjects],
  );

  const updateProject = useCallback(
    async (projectId: string, name: string, description?: string | null) => {
      clearError();
      try {
        const project = await updateProjectApi(projectId, name, description);
        await refreshProjects();
        return project;
      } catch (err) {
        setError(toUserError(err, "Could not update that project."));
        throw err;
      }
    },
    [clearError, refreshProjects],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      clearError();
      try {
        await deleteProjectApi(projectId);
        await refreshProjects();
      } catch (err) {
        setError(toUserError(err, "Could not delete that project."));
        throw err;
      }
    },
    [clearError, refreshProjects],
  );

  const addFileToProject = useCallback(
    async (libraryFileId: LibraryFileId, projectId: string) => {
      clearError();
      setFileProjectMap((current) => {
        const existing = current[libraryFileId] ?? [];
        if (existing.includes(projectId)) {
          return current;
        }
        return { ...current, [libraryFileId]: [...existing, projectId] };
      });

      try {
        await addFileToProjectApi(libraryFileId, projectId);
        await refreshProjects();
      } catch (err) {
        await refreshProjects();
        setError(toUserError(err, "Could not add that model to the project."));
        throw err;
      }
    },
    [clearError, refreshProjects],
  );

  const removeFileFromProject = useCallback(
    async (libraryFileId: LibraryFileId, projectId: string) => {
      clearError();
      setFileProjectMap((current) => {
        const existing = current[libraryFileId];
        if (!existing) {
          return current;
        }
        return {
          ...current,
          [libraryFileId]: existing.filter((id) => id !== projectId),
        };
      });

      try {
        await removeFileFromProjectApi(libraryFileId, projectId);
        await refreshProjects();
      } catch (err) {
        await refreshProjects();
        setError(toUserError(err, "Could not remove that model from the project."));
        throw err;
      }
    },
    [clearError, refreshProjects],
  );

  const addProjectNameToFile = useCallback(
    async (libraryFileId: LibraryFileId, name: string) => {
      const project = await createProject(name);
      await addFileToProject(libraryFileId, project.id);
      return project;
    },
    [addFileToProject, createProject],
  );

  const hasNote = useCallback(
    (libraryFileId: LibraryFileId) => hasFileNote(fileNoteMap, libraryFileId),
    [fileNoteMap],
  );

  const noteForLibraryFile = useCallback(
    (libraryFileId: LibraryFileId) => fileNoteMap[libraryFileId] ?? null,
    [fileNoteMap],
  );

  const upsertFileNote = useCallback(
    async (libraryFileId: LibraryFileId, content: string) => {
      clearError();
      try {
        const note = await upsertFileNoteApi(libraryFileId, content);
        setFileNoteMap((current) => {
          const next = { ...current };
          if (note) {
            next[libraryFileId] = note;
          } else {
            delete next[libraryFileId];
          }
          return next;
        });
        return note;
      } catch (err) {
        setError(toUserError(err, "Could not save that note."));
        throw err;
      }
    },
    [clearError],
  );

  const deleteFileNote = useCallback(
    async (libraryFileId: LibraryFileId) => {
      clearError();
      try {
        await deleteFileNoteApi(libraryFileId);
        setFileNoteMap((current) => {
          if (!current[libraryFileId]) {
            return current;
          }
          const next = { ...current };
          delete next[libraryFileId];
          return next;
        });
      } catch (err) {
        setError(toUserError(err, "Could not delete that note."));
        throw err;
      }
    },
    [clearError],
  );

  const value = useMemo(
    () => ({
      locations,
      files,
      favoriteIds,
      tags,
      fileTagMap,
      collections,
      fileCollectionMap,
      projects,
      fileProjectMap,
      fileNoteMap,
      ready,
      scanning,
      scanningLabel,
      error,
      clearError,
      addFolder,
      removeFolder,
      rescan,
      search,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      tagsForLibraryFile,
      createTag,
      renameTag,
      deleteTag,
      addTagToFile,
      removeTagFromFile,
      addTagNameToFile,
      collectionsForLibraryFile,
      createCollection,
      renameCollection,
      deleteCollection,
      addFileToCollection,
      removeFileFromCollection,
      addCollectionNameToFile,
      projectsForLibraryFile,
      createProject,
      updateProject,
      deleteProject,
      addFileToProject,
      removeFileFromProject,
      addProjectNameToFile,
      hasNote,
      noteForLibraryFile,
      upsertFileNote,
      deleteFileNote,
    }),
    [
      locations,
      files,
      favoriteIds,
      tags,
      fileTagMap,
      collections,
      fileCollectionMap,
      projects,
      fileProjectMap,
      fileNoteMap,
      ready,
      scanning,
      scanningLabel,
      error,
      clearError,
      addFolder,
      removeFolder,
      rescan,
      search,
      isFavorite,
      addFavorite,
      removeFavorite,
      toggleFavorite,
      tagsForLibraryFile,
      createTag,
      renameTag,
      deleteTag,
      addTagToFile,
      removeTagFromFile,
      addTagNameToFile,
      collectionsForLibraryFile,
      createCollection,
      renameCollection,
      deleteCollection,
      addFileToCollection,
      removeFileFromCollection,
      addCollectionNameToFile,
      projectsForLibraryFile,
      createProject,
      updateProject,
      deleteProject,
      addFileToProject,
      removeFileFromProject,
      addProjectNameToFile,
      hasNote,
      noteForLibraryFile,
      upsertFileNote,
      deleteFileNote,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);

  if (!context) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }

  return context;
}
