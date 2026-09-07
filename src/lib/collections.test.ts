import { describe, expect, it } from "vitest";
import {
  buildFileCollectionMap,
  collectionPreviewThumbnails,
  collectionsForFile,
  formatCollectionCount,
  resolveCollectionFiles,
} from "@/lib/collections";
import type { Collection, LibraryFile } from "@/types/library";

function makeCollection(partial: Partial<Collection> & Pick<Collection, "id" | "name">): Collection {
  return {
    createdAt: 1,
    updatedAt: 1,
    fileCount: 0,
    previewFileIds: [],
    ...partial,
  };
}

function makeFile(id: string, name: string, thumbnailPath?: string): LibraryFile {
  return {
    libraryFileId: id,
    contentHash: `hash-${id}`,
    path: `/lib/${name}`,
    name,
    extension: "stl",
    size: 10,
    modifiedAt: 1,
    relativePath: name,
    locationPath: "/lib",
    analysisStatus: "ready",
    thumbnailPath,
  };
}

describe("collections helpers", () => {
  it("builds a file→collection map", () => {
    const map = buildFileCollectionMap([
      { libraryFileId: "a", collectionId: "c1" },
      { libraryFileId: "a", collectionId: "c2" },
      { libraryFileId: "b", collectionId: "c1" },
    ]);
    expect(map.a).toEqual(["c1", "c2"]);
    expect(map.b).toEqual(["c1"]);
  });

  it("resolves collections for a file sorted by name", () => {
    const collections = [
      makeCollection({ id: "c2", name: "Zebra" }),
      makeCollection({ id: "c1", name: "Apple" }),
    ];
    const assigned = collectionsForFile(
      collections,
      { a: ["c2", "c1"] },
      "a",
    );
    expect(assigned.map((c) => c.name)).toEqual(["Apple", "Zebra"]);
  });

  it("resolves collection files present in the library", () => {
    const files = [makeFile("b", "bravo.stl"), makeFile("a", "alpha.stl")];
    const resolved = resolveCollectionFiles(files, ["a", "missing", "b"]);
    expect(resolved.map((f) => f.libraryFileId)).toEqual(["a", "b"]);
  });

  it("maps preview thumbnails from in-memory files", () => {
    const collection = makeCollection({
      id: "c1",
      name: "Ghostface",
      previewFileIds: ["a", "b"],
    });
    const filesById = new Map([
      ["a", makeFile("a", "a.stl", "/thumbs/a.webp")],
      ["b", makeFile("b", "b.stl")],
    ]);
    expect(collectionPreviewThumbnails(collection, filesById)).toEqual([
      { libraryFileId: "a", thumbnailPath: "/thumbs/a.webp" },
      { libraryFileId: "b", thumbnailPath: null },
    ]);
  });

  it("formats model counts", () => {
    expect(formatCollectionCount(0)).toBe("No models");
    expect(formatCollectionCount(1)).toBe("1 model");
    expect(formatCollectionCount(12)).toBe("12 models");
  });
});
