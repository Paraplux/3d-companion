import { describe, expect, it } from "vitest";
import {
  createEmptyLibraryData,
  type LibraryDataDocument,
  type LibraryFileIdentity,
} from "@/types/libraryData";

describe("LibraryFileIdentity", () => {
  it("keeps fileId stable when contentHash changes after an edit", () => {
    const before: LibraryFileIdentity = {
      id: "file-123",
      contentHash: "hash-A",
    };

    // File edited in Bambu Studio → new bytes, new hash.
    const after: LibraryFileIdentity = {
      id: before.id,
      contentHash: "hash-B",
    };

    expect(after.id).toBe("file-123");
    expect(after.id).toBe(before.id);
    expect(after.contentHash).not.toBe(before.contentHash);
    expect(after.contentHash).toBe("hash-B");
  });

  it("keeps project relations valid after contentHash changes", () => {
    const fileId = "file-123";

    const document: LibraryDataDocument = {
      ...createEmptyLibraryData(),
      projects: [{ id: "proj-robot", name: "Robot" }],
      relations: {
        projectFiles: [{ projectId: "proj-robot", fileId }],
        collectionFiles: [],
        fileTags: [],
      },
      favorites: [fileId],
      notes: [{ fileId, text: "Print with 0.2mm" }],
    };

    const identityAfterEdit: LibraryFileIdentity = {
      id: fileId,
      contentHash: "hash-B",
    };

    const stillInProject = document.relations.projectFiles.some(
      (relation) =>
        relation.projectId === "proj-robot" &&
        relation.fileId === identityAfterEdit.id,
    );
    const stillFavorite = document.favorites.includes(identityAfterEdit.id);
    const noteStillAttached = document.notes.some(
      (note) => note.fileId === identityAfterEdit.id,
    );

    expect(stillInProject).toBe(true);
    expect(stillFavorite).toBe(true);
    expect(noteStillAttached).toBe(true);
  });
});

describe("createEmptyLibraryData", () => {
  it("returns a valid versioned empty document keyed by fileId-ready relations", () => {
    expect(createEmptyLibraryData()).toEqual({
      version: 1,
      projects: [],
      collections: [],
      tags: [],
      favorites: [],
      notes: [],
      relations: {
        projectFiles: [],
        collectionFiles: [],
        fileTags: [],
      },
    });
  });
});
