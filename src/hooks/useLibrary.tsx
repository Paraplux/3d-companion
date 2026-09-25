import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  docAddFavorite,
  docAddFileToCollection,
  docAddFileToProject,
  docAddTagToFile,
  docCreateCollection,
  docCreateProject,
  docCreateTag,
  docDeleteCollection,
  docDeleteNote,
  docDeleteProject,
  docDeleteTag,
  docRemoveFavorite,
  docRemoveFileFromCollection,
  docRemoveFileFromProject,
  docRemoveTagFromFile,
  docRenameCollection,
  docRenameTag,
  docUpdateProject,
  docUpsertNote,
  hydrateOrgState,
  parseLibraryDocument,
  stripFileFromDocument,
  type OrgState,
} from "@/lib/libraryDocument";
import type { LibrarySearchRequest } from "@/lib/librarySearch";
import { buildFileNoteMap, hasFileNote } from "@/lib/notes";
import { buildFileProjectMap, projectsForFile } from "@/lib/projects";
import {
  deleteRemoteFile,
  getRemoteConfig,
  getRemoteFiles,
  getRemoteLibrary,
  putRemoteLibrary,
  REMOTE_CONFIG_CHANGED_EVENT,
  renameRemoteFile,
  uploadRemoteFile,
} from "@/lib/remoteApi";
import { remoteFileToLibraryFile, remoteFilesToLibraryFiles } from "@/lib/remoteFiles";
import { filterLibraryFilesLocally } from "@/lib/remoteSearch";
import { buildFileTagMap } from "@/lib/tags";
import { isRemoteConfigured } from "@/types/remoteConfig";
import type {
  Collection,
  FileNote,
  LibraryEvent,
  LibraryFile,
  LibraryLocation,
  Project,
  Tag,
} from "@/types/library";
import type { LibraryDataDocument, LibraryFileId } from "@/types/libraryData";

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
  /** True when Cloud library is enabled — local folders are not the catalog. */
  cloudMode: boolean;
  ready: boolean;
  scanning: boolean;
  scanningLabel: string | null;
  uploading: boolean;
  error: string | null;
  clearError: () => void;
  addFolder: () => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  rescan: () => Promise<void>;
  uploadFiles: () => Promise<void>;
  /** Soft-delete a cloud catalog file (moves to `.trash/` on the server).
   * Returns false if the user cancelled the confirmation dialog. */
  deleteCloudFile: (libraryFileId: LibraryFileId) => Promise<boolean>;
  /** Rename a cloud catalog file display name (PATCH; extension unchanged). */
  renameCloudFile: (
    libraryFileId: LibraryFileId,
    name: string,
  ) => Promise<LibraryFile>;
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
  const [cloudMode, setCloudMode] = useState(false);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningLabel, setScanningLabel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /** In-memory library.json + ETag when cloudMode (source of truth for org). */
  const cloudDocRef = useRef<LibraryDataDocument | null>(null);
  const cloudEtagRef = useRef<string | null>(null);
  const cloudWriteChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const clearError = useCallback(() => setError(null), []);

  const applyOrgState = useCallback((state: OrgState) => {
    setFavoriteIds(state.favoriteIds);
    setTags(state.tags);
    setFileTagMap(state.fileTagMap);
    setCollections(state.collections);
    setFileCollectionMap(state.fileCollectionMap);
    setProjects(state.projects);
    setFileProjectMap(state.fileProjectMap);
    setFileNoteMap(state.fileNoteMap);
  }, []);

  const enqueueCloudWrite = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = cloudWriteChainRef.current.then(fn, fn);
    cloudWriteChainRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const commitCloudDoc = useCallback(
    <T,>(
      mutator: (doc: LibraryDataDocument) => {
        doc: LibraryDataDocument;
        result: T;
      },
    ): Promise<T> =>
      enqueueCloudWrite(async () => {
        const current = cloudDocRef.current;
        const etag = cloudEtagRef.current;
        if (!current || !etag) {
          throw new Error("Cloud library organization is not loaded.");
        }
        const { doc, result } = mutator(current);
        const newEtag = await putRemoteLibrary(doc, etag);
        if (!newEtag) {
          throw new Error("Cloud library save did not return an ETag.");
        }
        cloudDocRef.current = doc;
        cloudEtagRef.current = newEtag;
        applyOrgState(hydrateOrgState(doc));
        return result;
      }),
    [applyOrgState, enqueueCloudWrite],
  );

  const refreshTags = useCallback(async () => {
    if (cloudDocRef.current) {
      applyOrgState(hydrateOrgState(cloudDocRef.current));
      return;
    }
    const next = await loadTagState();
    setTags(next.tags);
    setFileTagMap(next.fileTagMap);
  }, [applyOrgState]);

  const refreshCollections = useCallback(async () => {
    if (cloudDocRef.current) {
      applyOrgState(hydrateOrgState(cloudDocRef.current));
      return;
    }
    const next = await loadCollectionState();
    setCollections(next.collections);
    setFileCollectionMap(next.fileCollectionMap);
  }, [applyOrgState]);

  const refreshProjects = useCallback(async () => {
    if (cloudDocRef.current) {
      applyOrgState(hydrateOrgState(cloudDocRef.current));
      return;
    }
    const next = await loadProjectState();
    setProjects(next.projects);
    setFileProjectMap(next.fileProjectMap);
  }, [applyOrgState]);

  const refreshNotes = useCallback(async () => {
    if (cloudDocRef.current) {
      applyOrgState(hydrateOrgState(cloudDocRef.current));
      return;
    }
    setFileNoteMap(await loadNoteState());
  }, [applyOrgState]);

  useEffect(() => {
    const onRemoteConfigChanged = () => {
      setReloadToken((value) => value + 1);
    };
    window.addEventListener(REMOTE_CONFIG_CHANGED_EVENT, onRemoteConfigChanged);
    return () => {
      window.removeEventListener(
        REMOTE_CONFIG_CHANGED_EVENT,
        onRemoteConfigChanged,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setReady(false);
      try {
        const remoteConfig = await getRemoteConfig();
        const useCloud =
          remoteConfig.enabled && isRemoteConfigured(remoteConfig);

        setCloudMode(useCloud);

        if (useCloud) {
          setScanning(true);
          setScanningLabel("Loading cloud library…");
          const [remoteFiles, remoteLibrary] = await Promise.all([
            getRemoteFiles(),
            getRemoteLibrary(),
          ]);
          if (cancelled) {
            return;
          }
          if (!remoteLibrary.etag) {
            throw new Error("Cloud library did not return an ETag.");
          }
          const doc = parseLibraryDocument(remoteLibrary.document);
          cloudDocRef.current = doc;
          cloudEtagRef.current = remoteLibrary.etag;
          applyOrgState(hydrateOrgState(doc));
          setLocations([]);
          setFiles(remoteFilesToLibraryFiles(remoteFiles));
          setError(null);
          setScanning(false);
          setScanningLabel(null);
        } else {
          cloudDocRef.current = null;
          cloudEtagRef.current = null;

          const [favorites, tagState, collectionState, projectState, notes, snapshot] =
            await Promise.all([
              getFavoriteIds(),
              loadTagState(),
              loadCollectionState(),
              loadProjectState(),
              loadNoteState(),
              getLibrarySnapshot(),
            ]);

          if (cancelled) {
            return;
          }

          setFavoriteIds(favorites);
          setTags(tagState.tags);
          setFileTagMap(tagState.fileTagMap);
          setCollections(collectionState.collections);
          setFileCollectionMap(collectionState.fileCollectionMap);
          setProjects(projectState.projects);
          setFileProjectMap(projectState.fileProjectMap);
          setFileNoteMap(notes);
          setLocations(snapshot.locations);
          setFiles(snapshot.files);
          setError(null);
          if (snapshot.reconciling) {
            setScanning(true);
            setScanningLabel("Updating library…");
          } else {
            setScanning(false);
            setScanningLabel(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(toUserError(err, "Could not load your library."));
          setScanning(false);
          setScanningLabel(null);
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
  }, [applyOrgState, reloadToken]);

  useEffect(() => {
    if (cloudMode) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listen<LibraryEvent>("library://changed", (event) => {
      if (cancelled) {
        return;
      }
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
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [cloudMode, refreshNotes]);

  const addFolder = useCallback(async () => {
    if (cloudMode) {
      setError("Local folders are disabled while Cloud library is enabled.");
      return;
    }

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
  }, [clearError, cloudMode]);

  const removeFolder = useCallback(
    async (path: string) => {
      if (cloudMode) {
        setError("Local folders are disabled while Cloud library is enabled.");
        return;
      }

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
    [clearError, cloudMode, locations],
  );

  const rescan = useCallback(async () => {
    clearError();
    setScanning(true);
    setScanningLabel(cloudMode ? "Refreshing cloud library…" : "Scanning…");

    try {
      if (cloudMode) {
        const [remoteFiles, remoteLibrary] = await Promise.all([
          getRemoteFiles(),
          getRemoteLibrary(),
        ]);
        if (!remoteLibrary.etag) {
          throw new Error("Cloud library did not return an ETag.");
        }
        const doc = parseLibraryDocument(remoteLibrary.document);
        cloudDocRef.current = doc;
        cloudEtagRef.current = remoteLibrary.etag;
        applyOrgState(hydrateOrgState(doc));
        setFiles(remoteFilesToLibraryFiles(remoteFiles));
        setLocations([]);
      } else {
        const nextFiles = await scanLibrary();
        setFiles(nextFiles);
      }
    } catch (err) {
      setError(
        toUserError(
          err,
          cloudMode
            ? "Could not refresh the cloud library."
            : "Could not scan your library.",
        ),
      );
    } finally {
      setScanning(false);
      setScanningLabel(null);
    }
  }, [applyOrgState, clearError, cloudMode]);

  const uploadFiles = useCallback(async () => {
    if (!cloudMode) {
      setError("Upload is only available while Cloud library is enabled.");
      return;
    }

    clearError();

    try {
      const selected = await open({
        multiple: true,
        title: "Upload to cloud library",
        filters: [
          {
            name: "3D models",
            extensions: ["stl", "3mf", "obj", "step", "stp"],
          },
        ],
      });

      if (selected === null) {
        return;
      }

      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) {
        return;
      }

      setUploading(true);
      setScanningLabel(
        paths.length === 1
          ? "Uploading…"
          : `Uploading 1 of ${paths.length}…`,
      );

      const errors: string[] = [];

      for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        if (!path) {
          continue;
        }
        setScanningLabel(`Uploading ${index + 1} of ${paths.length}…`);
        try {
          await uploadRemoteFile(path);
        } catch (err) {
          errors.push(toUserError(err, `Could not upload ${path}`));
        }
      }

      const remoteFiles = await getRemoteFiles();
      setFiles(remoteFilesToLibraryFiles(remoteFiles));

      if (errors.length > 0) {
        setError(
          errors.length === 1
            ? (errors[0] ?? "Upload failed.")
            : `${errors.length} uploads failed. ${errors[0] ?? ""}`,
        );
      }
    } catch (err) {
      setError(toUserError(err, "Could not upload files."));
    } finally {
      setUploading(false);
      setScanningLabel(null);
    }
  }, [clearError, cloudMode]);

  const deleteCloudFile = useCallback(
    async (libraryFileId: LibraryFileId): Promise<boolean> => {
      if (!cloudMode) {
        setError("Delete from cloud is only available while Cloud library is enabled.");
        return false;
      }

      clearError();

      const file = files.find((entry) => entry.libraryFileId === libraryFileId);
      const label = file?.name ?? "this model";
      const confirmed = await ask(
        `Delete “${label}” from the cloud?\n\nThe file will be moved to trash on the server (soft delete). It will disappear from your library.`,
        {
          title: "Delete from cloud",
          kind: "warning",
        },
      );

      if (!confirmed) {
        return false;
      }

      try {
        await deleteRemoteFile(libraryFileId);
        await commitCloudDoc((doc) => ({
          doc: stripFileFromDocument(doc, libraryFileId),
          result: undefined,
        }));
        setFiles((current) =>
          current.filter((entry) => entry.libraryFileId !== libraryFileId),
        );
        return true;
      } catch (err) {
        setError(toUserError(err, "Could not delete that file from the cloud."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, files],
  );

  const renameCloudFile = useCallback(
    async (libraryFileId: LibraryFileId, name: string): Promise<LibraryFile> => {
      if (!cloudMode) {
        const message =
          "Rename is only available while Cloud library is enabled.";
        setError(message);
        throw new Error(message);
      }

      clearError();
      const trimmed = name.trim();
      if (!trimmed) {
        const message = "A name is required.";
        setError(message);
        throw new Error(message);
      }

      try {
        const updated = await renameRemoteFile(libraryFileId, trimmed);
        // Preserve createdAt from the in-memory row when the PATCH payload omits it.
        const previous = files.find(
          (entry) => entry.libraryFileId === libraryFileId,
        );
        const mapped = remoteFileToLibraryFile({
          ...updated,
          createdAt:
            updated.createdAt ||
            (previous
              ? new Date(previous.modifiedAt).toISOString()
              : updated.updatedAt),
          hasThumbnail:
            updated.hasThumbnail ?? previous?.hasRemoteThumbnail ?? false,
        });
        setFiles((current) =>
          current.map((entry) =>
            entry.libraryFileId === libraryFileId ? mapped : entry,
          ),
        );
        return mapped;
      } catch (err) {
        setError(toUserError(err, "Could not rename that file."));
        throw err;
      }
    },
    [clearError, cloudMode, files],
  );

  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const search = useCallback(
    async (request: LibrarySearchRequest) => {
      if (cloudMode) {
        return filterLibraryFilesLocally(files, request, favoriteIdSet);
      }
      return searchLibraryFiles(request);
    },
    [cloudMode, favoriteIdSet, files],
  );

  const isFavorite = useCallback(
    (libraryFileId: LibraryFileId) => favoriteIdSet.has(libraryFileId),
    [favoriteIdSet],
  );

  const addFavorite = useCallback(
    async (libraryFileId: LibraryFileId) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docAddFavorite(doc, libraryFileId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not add that favorite."));
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc],
  );

  const removeFavorite = useCallback(
    async (libraryFileId: LibraryFileId) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docRemoveFavorite(doc, libraryFileId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not remove that favorite."));
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc],
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

  const tagsByFileId = useMemo(() => {
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    const result: Record<LibraryFileId, Tag[]> = {};
    for (const [libraryFileId, tagIds] of Object.entries(fileTagMap)) {
      result[libraryFileId] = tagIds
        .map((id) => byId.get(id))
        .filter((tag): tag is Tag => Boolean(tag))
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
        );
    }
    return result;
  }, [fileTagMap, tags]);

  const tagsForLibraryFile = useCallback(
    (libraryFileId: LibraryFileId) => tagsByFileId[libraryFileId] ?? [],
    [tagsByFileId],
  );

  const createTag = useCallback(
    async (name: string) => {
      clearError();
      try {
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docCreateTag(doc, name);
            return { doc: outcome.doc, result: outcome.tag };
          });
        }
        const tag = await createTagApi(name);
        await refreshTags();
        return tag;
      } catch (err) {
        setError(toUserError(err, "Could not create that tag."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshTags],
  );

  const renameTag = useCallback(
    async (tagId: string, name: string) => {
      clearError();
      try {
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docRenameTag(doc, tagId, name);
            return { doc: outcome.doc, result: outcome.tag };
          });
        }
        const tag = await renameTagApi(tagId, name);
        await refreshTags();
        return tag;
      } catch (err) {
        setError(toUserError(err, "Could not rename that tag."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshTags],
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      clearError();
      try {
        if (cloudMode) {
          await commitCloudDoc((doc) => ({
            doc: docDeleteTag(doc, tagId),
            result: undefined,
          }));
          return;
        }
        await deleteTagApi(tagId);
        await refreshTags();
      } catch (err) {
        setError(toUserError(err, "Could not delete that tag."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshTags],
  );

  const addTagToFile = useCallback(
    async (libraryFileId: LibraryFileId, tagId: string) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docAddTagToFile(doc, libraryFileId, tagId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not add that tag."));
          throw err;
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc, refreshTags],
  );

  const removeTagFromFile = useCallback(
    async (libraryFileId: LibraryFileId, tagId: string) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docRemoveTagFromFile(doc, libraryFileId, tagId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not remove that tag."));
          throw err;
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc, refreshTags],
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
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docCreateCollection(doc, name);
            return { doc: outcome.doc, result: outcome.collection };
          });
        }
        const collection = await createCollectionApi(name);
        await refreshCollections();
        return collection;
      } catch (err) {
        setError(toUserError(err, "Could not create that collection."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshCollections],
  );

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      clearError();
      try {
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docRenameCollection(doc, collectionId, name);
            return { doc: outcome.doc, result: outcome.collection };
          });
        }
        const collection = await renameCollectionApi(collectionId, name);
        await refreshCollections();
        return collection;
      } catch (err) {
        setError(toUserError(err, "Could not rename that collection."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshCollections],
  );

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      clearError();
      try {
        if (cloudMode) {
          await commitCloudDoc((doc) => ({
            doc: docDeleteCollection(doc, collectionId),
            result: undefined,
          }));
          return;
        }
        await deleteCollectionApi(collectionId);
        await refreshCollections();
      } catch (err) {
        setError(toUserError(err, "Could not delete that collection."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshCollections],
  );

  const addFileToCollection = useCallback(
    async (libraryFileId: LibraryFileId, collectionId: string) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docAddFileToCollection(doc, libraryFileId, collectionId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not add that model to the collection."));
          throw err;
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc, refreshCollections],
  );

  const removeFileFromCollection = useCallback(
    async (libraryFileId: LibraryFileId, collectionId: string) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docRemoveFileFromCollection(doc, libraryFileId, collectionId),
            result: undefined,
          }));
        } catch (err) {
          setError(
            toUserError(err, "Could not remove that model from the collection."),
          );
          throw err;
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc, refreshCollections],
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
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docCreateProject(doc, name, description);
            return { doc: outcome.doc, result: outcome.project };
          });
        }
        const project = await createProjectApi(name, description);
        await refreshProjects();
        return project;
      } catch (err) {
        setError(toUserError(err, "Could not create that project."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshProjects],
  );

  const updateProject = useCallback(
    async (projectId: string, name: string, description?: string | null) => {
      clearError();
      try {
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docUpdateProject(doc, projectId, name, description);
            return { doc: outcome.doc, result: outcome.project };
          });
        }
        const project = await updateProjectApi(projectId, name, description);
        await refreshProjects();
        return project;
      } catch (err) {
        setError(toUserError(err, "Could not update that project."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshProjects],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      clearError();
      try {
        if (cloudMode) {
          await commitCloudDoc((doc) => ({
            doc: docDeleteProject(doc, projectId),
            result: undefined,
          }));
          return;
        }
        await deleteProjectApi(projectId);
        await refreshProjects();
      } catch (err) {
        setError(toUserError(err, "Could not delete that project."));
        throw err;
      }
    },
    [clearError, cloudMode, commitCloudDoc, refreshProjects],
  );

  const addFileToProject = useCallback(
    async (libraryFileId: LibraryFileId, projectId: string) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docAddFileToProject(doc, libraryFileId, projectId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not add that model to the project."));
          throw err;
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc, refreshProjects],
  );

  const removeFileFromProject = useCallback(
    async (libraryFileId: LibraryFileId, projectId: string) => {
      clearError();
      if (cloudMode) {
        try {
          await commitCloudDoc((doc) => ({
            doc: docRemoveFileFromProject(doc, libraryFileId, projectId),
            result: undefined,
          }));
        } catch (err) {
          setError(toUserError(err, "Could not remove that model from the project."));
          throw err;
        }
        return;
      }

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
    [clearError, cloudMode, commitCloudDoc, refreshProjects],
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
        if (cloudMode) {
          return await commitCloudDoc((doc) => {
            const outcome = docUpsertNote(doc, libraryFileId, content);
            return { doc: outcome.doc, result: outcome.note };
          });
        }
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
    [clearError, cloudMode, commitCloudDoc],
  );

  const deleteFileNote = useCallback(
    async (libraryFileId: LibraryFileId) => {
      clearError();
      try {
        if (cloudMode) {
          await commitCloudDoc((doc) => ({
            doc: docDeleteNote(doc, libraryFileId),
            result: undefined,
          }));
          return;
        }
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
    [clearError, cloudMode, commitCloudDoc],
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
      cloudMode,
      ready,
      scanning,
      scanningLabel,
      uploading,
      error,
      clearError,
      addFolder,
      removeFolder,
      rescan,
      uploadFiles,
      deleteCloudFile,
      renameCloudFile,
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
      cloudMode,
      ready,
      scanning,
      scanningLabel,
      uploading,
      error,
      clearError,
      addFolder,
      removeFolder,
      rescan,
      uploadFiles,
      deleteCloudFile,
      renameCloudFile,
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
