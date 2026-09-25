/**
 * Portable library.json helpers — source of truth for org when Cloud is ON.
 * UI types (fileCount, timestamps, …) are derived; the document stays lean.
 */

import { buildFileCollectionMap } from "@/lib/collections";
import { buildFileNoteMap } from "@/lib/notes";
import { buildFileProjectMap } from "@/lib/projects";
import { buildFileTagMap } from "@/lib/tags";
import type {
  Collection,
  FileNote,
  Project,
  Tag,
} from "@/types/library";
import {
  createEmptyLibraryData,
  LIBRARY_DATA_VERSION,
  type LibraryDataDocument,
  type LibraryFileId,
} from "@/types/libraryData";

export type OrgState = {
  favoriteIds: LibraryFileId[];
  tags: Tag[];
  fileTagMap: Record<LibraryFileId, string[]>;
  collections: Collection[];
  fileCollectionMap: Record<LibraryFileId, string[]>;
  projects: Project[];
  fileProjectMap: Record<LibraryFileId, string[]>;
  fileNoteMap: Record<LibraryFileId, FileNote>;
};

const MAX_NAME_LENGTH = 80;
const MAX_NOTE_LENGTH = 10_000;
const PREVIEW_LIMIT = 4;

export function newEntityId(): string {
  return crypto.randomUUID();
}

export function cloneLibraryDocument(
  doc: LibraryDataDocument,
): LibraryDataDocument {
  return structuredClone(doc);
}

export function parseLibraryDocument(raw: unknown): LibraryDataDocument {
  if (!raw || typeof raw !== "object") {
    return createEmptyLibraryData();
  }

  const value = raw as Record<string, unknown>;
  const projects = Array.isArray(value.projects)
    ? value.projects
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
          ...(typeof item.description === "string" && item.description.trim()
            ? { description: item.description.trim() }
            : {}),
        }))
        .filter((item) => item.id && item.name)
    : [];

  const collections = Array.isArray(value.collections)
    ? value.collections
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
        }))
        .filter((item) => item.id && item.name)
    : [];

  const tags = Array.isArray(value.tags)
    ? value.tags
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
        }))
        .filter((item) => item.id && item.name)
    : [];

  const favorites = Array.isArray(value.favorites)
    ? value.favorites.map((id) => String(id)).filter(Boolean)
    : [];

  const notes = Array.isArray(value.notes)
    ? value.notes
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          fileId: String(item.fileId ?? item.libraryFileId ?? ""),
          text: String(item.text ?? item.content ?? ""),
        }))
        .filter((item) => item.fileId && item.text.trim())
    : [];

  const relationsRaw =
    value.relations && typeof value.relations === "object"
      ? (value.relations as Record<string, unknown>)
      : {};

  const projectFiles = Array.isArray(relationsRaw.projectFiles)
    ? relationsRaw.projectFiles
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          projectId: String(item.projectId ?? ""),
          fileId: String(item.fileId ?? item.libraryFileId ?? ""),
        }))
        .filter((item) => item.projectId && item.fileId)
    : [];

  const collectionFiles = Array.isArray(relationsRaw.collectionFiles)
    ? relationsRaw.collectionFiles
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          collectionId: String(item.collectionId ?? ""),
          fileId: String(item.fileId ?? item.libraryFileId ?? ""),
        }))
        .filter((item) => item.collectionId && item.fileId)
    : [];

  const fileTags = Array.isArray(relationsRaw.fileTags)
    ? relationsRaw.fileTags
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          fileId: String(item.fileId ?? item.libraryFileId ?? ""),
          tagId: String(item.tagId ?? ""),
        }))
        .filter((item) => item.fileId && item.tagId)
    : [];

  return {
    version: LIBRARY_DATA_VERSION,
    projects,
    collections,
    tags,
    favorites,
    notes,
    relations: { projectFiles, collectionFiles, fileTags },
  };
}

function namesEqual(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

export function normalizeEntityName(
  name: string,
  kind: "tag" | "collection" | "project",
): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error(`A ${kind} name is required.`);
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(
      `${kind[0]!.toUpperCase()}${kind.slice(1)} names must be ${MAX_NAME_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

function normalizeDescription(description?: string | null): string | undefined {
  if (description == null) {
    return undefined;
  }
  const trimmed = description.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNoteContent(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new Error(`Notes must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function fileIdsFor(
  pairs: Array<{ id: string; fileId: string }>,
  id: string,
): string[] {
  return pairs.filter((pair) => pair.id === id).map((pair) => pair.fileId);
}

/** Derive UI org state from a portable document. */
export function hydrateOrgState(doc: LibraryDataDocument): OrgState {
  const stamp = 0;

  const fileTagMap = buildFileTagMap(
    doc.relations.fileTags.map((relation) => ({
      libraryFileId: relation.fileId,
      tagId: relation.tagId,
    })),
  );
  const fileCollectionMap = buildFileCollectionMap(
    doc.relations.collectionFiles.map((relation) => ({
      libraryFileId: relation.fileId,
      collectionId: relation.collectionId,
    })),
  );
  const fileProjectMap = buildFileProjectMap(
    doc.relations.projectFiles.map((relation) => ({
      libraryFileId: relation.fileId,
      projectId: relation.projectId,
    })),
  );

  const projectFilePairs = doc.relations.projectFiles.map((relation) => ({
    id: relation.projectId,
    fileId: relation.fileId,
  }));
  const collectionFilePairs = doc.relations.collectionFiles.map((relation) => ({
    id: relation.collectionId,
    fileId: relation.fileId,
  }));
  const tagFilePairs = doc.relations.fileTags.map((relation) => ({
    id: relation.tagId,
    fileId: relation.fileId,
  }));

  const tags: Tag[] = doc.tags
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      createdAt: stamp,
      fileCount: fileIdsFor(tagFilePairs, tag.id).length,
    }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );

  const collections: Collection[] = doc.collections
    .map((collection) => {
      const ids = fileIdsFor(collectionFilePairs, collection.id);
      return {
        id: collection.id,
        name: collection.name,
        createdAt: stamp,
        updatedAt: stamp,
        fileCount: ids.length,
        previewFileIds: ids.slice(0, PREVIEW_LIMIT),
      };
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );

  const projects: Project[] = doc.projects
    .map((project) => {
      const ids = fileIdsFor(projectFilePairs, project.id);
      return {
        id: project.id,
        name: project.name,
        description: project.description ?? null,
        createdAt: stamp,
        updatedAt: stamp,
        fileCount: ids.length,
        previewFileIds: ids.slice(0, PREVIEW_LIMIT),
      };
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );

  const notes: FileNote[] = doc.notes.map((note) => ({
    libraryFileId: note.fileId,
    content: note.text,
    updatedAt: stamp,
  }));

  return {
    favoriteIds: [...doc.favorites],
    tags,
    fileTagMap,
    collections,
    fileCollectionMap,
    projects,
    fileProjectMap,
    fileNoteMap: buildFileNoteMap(notes),
  };
}

/** Remove a fileId from favorites, notes, and all relations (soft-delete cleanup). */
export function stripFileFromDocument(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.favorites = next.favorites.filter((id) => id !== fileId);
  next.notes = next.notes.filter((note) => note.fileId !== fileId);
  next.relations.projectFiles = next.relations.projectFiles.filter(
    (relation) => relation.fileId !== fileId,
  );
  next.relations.collectionFiles = next.relations.collectionFiles.filter(
    (relation) => relation.fileId !== fileId,
  );
  next.relations.fileTags = next.relations.fileTags.filter(
    (relation) => relation.fileId !== fileId,
  );
  return next;
}

export function docAddFavorite(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  if (!next.favorites.includes(fileId)) {
    next.favorites = [fileId, ...next.favorites];
  }
  return next;
}

export function docRemoveFavorite(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.favorites = next.favorites.filter((id) => id !== fileId);
  return next;
}

export function docCreateTag(
  doc: LibraryDataDocument,
  name: string,
): { doc: LibraryDataDocument; tag: Tag } {
  const normalized = normalizeEntityName(name, "tag");
  const existing = doc.tags.find((tag) => namesEqual(tag.name, normalized));
  if (existing) {
    const hydrated = hydrateOrgState(doc).tags.find((tag) => tag.id === existing.id);
    return {
      doc,
      tag: hydrated ?? {
        id: existing.id,
        name: existing.name,
        createdAt: 0,
        fileCount: 0,
      },
    };
  }

  const next = cloneLibraryDocument(doc);
  const id = newEntityId();
  next.tags = [...next.tags, { id, name: normalized }];
  const tag = hydrateOrgState(next).tags.find((entry) => entry.id === id)!;
  return { doc: next, tag };
}

export function docRenameTag(
  doc: LibraryDataDocument,
  tagId: string,
  name: string,
): { doc: LibraryDataDocument; tag: Tag } {
  const normalized = normalizeEntityName(name, "tag");
  const current = doc.tags.find((tag) => tag.id === tagId);
  if (!current) {
    throw new Error("That tag no longer exists.");
  }
  const clash = doc.tags.find(
    (tag) => tag.id !== tagId && namesEqual(tag.name, normalized),
  );
  if (clash) {
    throw new Error("A tag with that name already exists.");
  }

  const next = cloneLibraryDocument(doc);
  next.tags = next.tags.map((tag) =>
    tag.id === tagId ? { ...tag, name: normalized } : tag,
  );
  const tag = hydrateOrgState(next).tags.find((entry) => entry.id === tagId)!;
  return { doc: next, tag };
}

export function docDeleteTag(
  doc: LibraryDataDocument,
  tagId: string,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.tags = next.tags.filter((tag) => tag.id !== tagId);
  next.relations.fileTags = next.relations.fileTags.filter(
    (relation) => relation.tagId !== tagId,
  );
  return next;
}

export function docAddTagToFile(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  tagId: string,
): LibraryDataDocument {
  if (!doc.tags.some((tag) => tag.id === tagId)) {
    throw new Error("That tag no longer exists.");
  }
  const next = cloneLibraryDocument(doc);
  const exists = next.relations.fileTags.some(
    (relation) => relation.fileId === fileId && relation.tagId === tagId,
  );
  if (!exists) {
    next.relations.fileTags = [
      ...next.relations.fileTags,
      { fileId, tagId },
    ];
  }
  return next;
}

export function docRemoveTagFromFile(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  tagId: string,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.relations.fileTags = next.relations.fileTags.filter(
    (relation) => !(relation.fileId === fileId && relation.tagId === tagId),
  );
  return next;
}

export function docCreateCollection(
  doc: LibraryDataDocument,
  name: string,
): { doc: LibraryDataDocument; collection: Collection } {
  const normalized = normalizeEntityName(name, "collection");
  if (doc.collections.some((item) => namesEqual(item.name, normalized))) {
    throw new Error("A collection with that name already exists.");
  }
  const next = cloneLibraryDocument(doc);
  const id = newEntityId();
  next.collections = [...next.collections, { id, name: normalized }];
  const collection = hydrateOrgState(next).collections.find(
    (entry) => entry.id === id,
  )!;
  return { doc: next, collection };
}

export function docRenameCollection(
  doc: LibraryDataDocument,
  collectionId: string,
  name: string,
): { doc: LibraryDataDocument; collection: Collection } {
  const normalized = normalizeEntityName(name, "collection");
  const current = doc.collections.find((item) => item.id === collectionId);
  if (!current) {
    throw new Error("That collection no longer exists.");
  }
  if (
    doc.collections.some(
      (item) => item.id !== collectionId && namesEqual(item.name, normalized),
    )
  ) {
    throw new Error("A collection with that name already exists.");
  }
  const next = cloneLibraryDocument(doc);
  next.collections = next.collections.map((item) =>
    item.id === collectionId ? { ...item, name: normalized } : item,
  );
  const collection = hydrateOrgState(next).collections.find(
    (entry) => entry.id === collectionId,
  )!;
  return { doc: next, collection };
}

export function docDeleteCollection(
  doc: LibraryDataDocument,
  collectionId: string,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.collections = next.collections.filter((item) => item.id !== collectionId);
  next.relations.collectionFiles = next.relations.collectionFiles.filter(
    (relation) => relation.collectionId !== collectionId,
  );
  return next;
}

export function docAddFileToCollection(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  collectionId: string,
): LibraryDataDocument {
  if (!doc.collections.some((item) => item.id === collectionId)) {
    throw new Error("That collection no longer exists.");
  }
  const next = cloneLibraryDocument(doc);
  const exists = next.relations.collectionFiles.some(
    (relation) =>
      relation.fileId === fileId && relation.collectionId === collectionId,
  );
  if (!exists) {
    next.relations.collectionFiles = [
      ...next.relations.collectionFiles,
      { collectionId, fileId },
    ];
  }
  return next;
}

export function docRemoveFileFromCollection(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  collectionId: string,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.relations.collectionFiles = next.relations.collectionFiles.filter(
    (relation) =>
      !(relation.fileId === fileId && relation.collectionId === collectionId),
  );
  return next;
}

export function docCreateProject(
  doc: LibraryDataDocument,
  name: string,
  description?: string | null,
): { doc: LibraryDataDocument; project: Project } {
  const normalized = normalizeEntityName(name, "project");
  if (doc.projects.some((item) => namesEqual(item.name, normalized))) {
    throw new Error("A project with that name already exists.");
  }
  const next = cloneLibraryDocument(doc);
  const id = newEntityId();
  const desc = normalizeDescription(description);
  next.projects = [
    ...next.projects,
    desc ? { id, name: normalized, description: desc } : { id, name: normalized },
  ];
  const project = hydrateOrgState(next).projects.find((entry) => entry.id === id)!;
  return { doc: next, project };
}

export function docUpdateProject(
  doc: LibraryDataDocument,
  projectId: string,
  name: string,
  description?: string | null,
): { doc: LibraryDataDocument; project: Project } {
  const normalized = normalizeEntityName(name, "project");
  const current = doc.projects.find((item) => item.id === projectId);
  if (!current) {
    throw new Error("That project no longer exists.");
  }
  if (
    doc.projects.some(
      (item) => item.id !== projectId && namesEqual(item.name, normalized),
    )
  ) {
    throw new Error("A project with that name already exists.");
  }
  const next = cloneLibraryDocument(doc);
  const desc = normalizeDescription(description);
  next.projects = next.projects.map((item) => {
    if (item.id !== projectId) {
      return item;
    }
    return desc
      ? { id: item.id, name: normalized, description: desc }
      : { id: item.id, name: normalized };
  });
  const project = hydrateOrgState(next).projects.find(
    (entry) => entry.id === projectId,
  )!;
  return { doc: next, project };
}

export function docDeleteProject(
  doc: LibraryDataDocument,
  projectId: string,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.projects = next.projects.filter((item) => item.id !== projectId);
  next.relations.projectFiles = next.relations.projectFiles.filter(
    (relation) => relation.projectId !== projectId,
  );
  return next;
}

export function docAddFileToProject(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  projectId: string,
): LibraryDataDocument {
  if (!doc.projects.some((item) => item.id === projectId)) {
    throw new Error("That project no longer exists.");
  }
  const next = cloneLibraryDocument(doc);
  const exists = next.relations.projectFiles.some(
    (relation) => relation.fileId === fileId && relation.projectId === projectId,
  );
  if (!exists) {
    next.relations.projectFiles = [
      ...next.relations.projectFiles,
      { projectId, fileId },
    ];
  }
  return next;
}

export function docRemoveFileFromProject(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  projectId: string,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.relations.projectFiles = next.relations.projectFiles.filter(
    (relation) =>
      !(relation.fileId === fileId && relation.projectId === projectId),
  );
  return next;
}

export function docUpsertNote(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
  content: string,
): { doc: LibraryDataDocument; note: FileNote | null } {
  const normalized = normalizeNoteContent(content);
  const next = cloneLibraryDocument(doc);
  next.notes = next.notes.filter((note) => note.fileId !== fileId);
  if (!normalized) {
    return { doc: next, note: null };
  }
  next.notes = [...next.notes, { fileId, text: normalized }];
  return {
    doc: next,
    note: {
      libraryFileId: fileId,
      content: normalized,
      updatedAt: Date.now(),
    },
  };
}

export function docDeleteNote(
  doc: LibraryDataDocument,
  fileId: LibraryFileId,
): LibraryDataDocument {
  const next = cloneLibraryDocument(doc);
  next.notes = next.notes.filter((note) => note.fileId !== fileId);
  return next;
}
