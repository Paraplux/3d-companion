import { describe, expect, it } from "vitest";
import {
  docAddFavorite,
  docCreateProject,
  docCreateTag,
  hydrateOrgState,
  parseLibraryDocument,
  stripFileFromDocument,
} from "@/lib/libraryDocument";
import { createEmptyLibraryData } from "@/types/libraryData";

describe("libraryDocument", () => {
  it("parses empty / invalid payloads as empty document", () => {
    expect(parseLibraryDocument(null)).toEqual(createEmptyLibraryData());
    expect(parseLibraryDocument({})).toMatchObject({
      version: 1,
      projects: [],
      favorites: [],
    });
  });

  it("hydrates derived counts and maps from relations", () => {
    const doc = parseLibraryDocument({
      version: 1,
      projects: [{ id: "p1", name: "Robot" }],
      collections: [{ id: "c1", name: "Print" }],
      tags: [{ id: "t1", name: "PLA" }],
      favorites: ["f1"],
      notes: [{ fileId: "f1", text: "hello" }],
      relations: {
        projectFiles: [{ projectId: "p1", fileId: "f1" }],
        collectionFiles: [{ collectionId: "c1", fileId: "f1" }],
        fileTags: [{ fileId: "f1", tagId: "t1" }],
      },
    });

    const state = hydrateOrgState(doc);
    expect(state.favoriteIds).toEqual(["f1"]);
    expect(state.projects[0]?.fileCount).toBe(1);
    expect(state.projects[0]?.previewFileIds).toEqual(["f1"]);
    expect(state.fileTagMap.f1).toEqual(["t1"]);
    expect(state.fileNoteMap.f1?.content).toBe("hello");
  });

  it("strips a file from favorites, notes, and relations", () => {
    let doc = createEmptyLibraryData();
    doc = docAddFavorite(doc, "f1");
    doc = docAddFavorite(doc, "f2");
    const created = docCreateTag(doc, "PLA");
    doc = created.doc;
    doc.relations.fileTags.push({ fileId: "f1", tagId: created.tag.id });
    doc.notes.push({ fileId: "f1", text: "x" });

    const next = stripFileFromDocument(doc, "f1");
    expect(next.favorites).toEqual(["f2"]);
    expect(next.notes).toEqual([]);
    expect(next.relations.fileTags).toEqual([]);
  });

  it("creates projects with optional description and rejects duplicates", () => {
    let doc = createEmptyLibraryData();
    const first = docCreateProject(doc, "Robot", "v1");
    doc = first.doc;
    expect(first.project.description).toBe("v1");
    expect(() => docCreateProject(doc, "robot")).toThrow(/already exists/i);
  });
});
