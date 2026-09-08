import { describe, expect, it } from "vitest";
import {
  buildFileProjectMap,
  formatProjectCount,
  projectPreviewThumbnails,
  projectsForFile,
  resolveProjectFiles,
} from "@/lib/projects";
import type { LibraryFile, Project } from "@/types/library";

function makeProject(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    description: null,
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

describe("projects helpers", () => {
  it("builds a file→project map", () => {
    const map = buildFileProjectMap([
      { libraryFileId: "a", projectId: "p1" },
      { libraryFileId: "a", projectId: "p2" },
      { libraryFileId: "b", projectId: "p1" },
    ]);
    expect(map.a).toEqual(["p1", "p2"]);
    expect(map.b).toEqual(["p1"]);
  });

  it("resolves projects for a file sorted by name", () => {
    const projects = [
      makeProject({ id: "p2", name: "Zebra" }),
      makeProject({ id: "p1", name: "Apple" }),
    ];
    const assigned = projectsForFile(projects, { a: ["p2", "p1"] }, "a");
    expect(assigned.map((p) => p.name)).toEqual(["Apple", "Zebra"]);
  });

  it("resolves project files present in the library", () => {
    const files = [makeFile("b", "bravo.stl"), makeFile("a", "alpha.stl")];
    const resolved = resolveProjectFiles(files, ["a", "missing", "b"]);
    expect(resolved.map((f) => f.libraryFileId)).toEqual(["a", "b"]);
  });

  it("maps preview thumbnails from in-memory files", () => {
    const project = makeProject({
      id: "p1",
      name: "Robot",
      previewFileIds: ["a", "b"],
    });
    const filesById = new Map([
      ["a", makeFile("a", "a.stl", "/thumbs/a.webp")],
      ["b", makeFile("b", "b.stl")],
    ]);
    expect(projectPreviewThumbnails(project, filesById)).toEqual([
      { libraryFileId: "a", thumbnailPath: "/thumbs/a.webp" },
      { libraryFileId: "b", thumbnailPath: null },
    ]);
  });

  it("formats model counts", () => {
    expect(formatProjectCount(0)).toBe("No models");
    expect(formatProjectCount(1)).toBe("1 model");
    expect(formatProjectCount(12)).toBe("12 models");
  });
});
