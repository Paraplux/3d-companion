import { describe, expect, it } from "vitest";
import {
  buildFileTagMap,
  filterFilesByTag,
  tagsForFile,
  visibleTagsForCard,
} from "@/lib/tags";
import type { LibraryFile, Tag } from "@/types/library";

function file(id: string): LibraryFile {
  return {
    libraryFileId: id,
    contentHash: `hash-${id}`,
    path: `/tmp/${id}.stl`,
    name: `${id}.stl`,
    extension: "stl",
    size: 1,
    modifiedAt: 1,
    relativePath: `${id}.stl`,
    locationPath: "/tmp",
    analysisStatus: "ready",
  };
}

function tag(id: string, name: string): Tag {
  return { id, name, createdAt: 1, fileCount: 0 };
}

describe("tags helpers", () => {
  it("builds a file→tag map without N+1", () => {
    const map = buildFileTagMap([
      { libraryFileId: "a", tagId: "pla" },
      { libraryFileId: "a", tagId: "dragon" },
      { libraryFileId: "b", tagId: "pla" },
    ]);
    expect(map.a).toEqual(["pla", "dragon"]);
    expect(map.b).toEqual(["pla"]);
  });

  it("resolves tags for a file by id, not path or hash", () => {
    const tags = [tag("pla", "PLA"), tag("dragon", "Dragon")];
    const map = buildFileTagMap([{ libraryFileId: "stable", tagId: "pla" }]);
    expect(tagsForFile(tags, map, "stable").map((entry) => entry.name)).toEqual([
      "PLA",
    ]);
    expect(tagsForFile(tags, map, "missing")).toEqual([]);
  });

  it("filters library files by tag", () => {
    const files = [file("a"), file("b"), file("c")];
    const map = buildFileTagMap([
      { libraryFileId: "a", tagId: "pla" },
      { libraryFileId: "c", tagId: "pla" },
    ]);
    expect(filterFilesByTag(files, map, null)).toHaveLength(3);
    expect(filterFilesByTag(files, map, "pla").map((entry) => entry.libraryFileId)).toEqual([
      "a",
      "c",
    ]);
  });

  it("limits tags shown on cards", () => {
    const tags = [
      tag("1", "A"),
      tag("2", "B"),
      tag("3", "C"),
      tag("4", "D"),
    ];
    expect(visibleTagsForCard(tags, 2)).toEqual({
      visible: [tags[0], tags[1]],
      overflow: 2,
    });
  });
});
