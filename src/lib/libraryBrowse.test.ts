import { describe, expect, it } from "vitest";
import {
  browseFromSearchParams,
  browseToSearchParams,
  libraryHrefForFile,
  libraryHrefForTag,
  libraryUrlFromSearchParams,
  libraryUrlToSearchParams,
} from "@/lib/libraryBrowse";
import { EMPTY_LIBRARY_SEARCH } from "@/lib/librarySearch";

describe("library browse URL state", () => {
  it("round-trips location and relative dir", () => {
    const params = browseToSearchParams({
      locationPath: "/Users/me/Models",
      relativeDir: "robots/arms",
    });
    expect(params.get("loc")).toBe("/Users/me/Models");
    expect(params.get("dir")).toBe("robots/arms");
    expect(browseFromSearchParams(params)).toEqual({
      locationPath: "/Users/me/Models",
      relativeDir: "robots/arms",
    });
  });

  it("serializes root as empty params", () => {
    const params = browseToSearchParams({
      locationPath: null,
      relativeDir: "",
    });
    expect(params.toString()).toBe("");
    expect(browseFromSearchParams(params)).toEqual({
      locationPath: null,
      relativeDir: "",
    });
  });

  it("builds a library href for the file's parent folder", () => {
    expect(
      libraryHrefForFile({
        locationPath: "/Users/me/Models",
        relativePath: "robots/arms/part.stl",
      }),
    ).toBe("/library?loc=%2FUsers%2Fme%2FModels&dir=robots%2Farms");

    expect(
      libraryHrefForFile({
        locationPath: "/Users/me/Models",
        relativePath: "part.stl",
      }),
    ).toBe("/library?loc=%2FUsers%2Fme%2FModels");
  });

  it("builds a library href for a tag filter", () => {
    expect(libraryHrefForTag("tag-pla")).toBe("/library?tags=tag-pla");
  });
});

describe("library search URL state", () => {
  it("round-trips query and combinable filters", () => {
    const params = libraryUrlToSearchParams({
      browse: { locationPath: null, relativeDir: "" },
      search: {
        query: "Ghostface",
        formats: ["3mf", "stl"],
        favoritesOnly: true,
        tagIds: ["tag-halloween"],
        collectionIds: ["col-1"],
        projectIds: ["proj-1"],
        ecosystem: "bambu",
      },
    });

    expect(params.get("q")).toBe("Ghostface");
    expect(params.get("fmt")).toBe("3mf,stl");
    expect(params.get("fav")).toBe("1");
    expect(params.get("tags")).toBe("tag-halloween");
    expect(params.get("cols")).toBe("col-1");
    expect(params.get("projs")).toBe("proj-1");
    expect(params.get("eco")).toBe("bambu");

    expect(libraryUrlFromSearchParams(params)).toEqual({
      browse: { locationPath: null, relativeDir: "" },
      search: {
        query: "Ghostface",
        formats: ["3mf", "stl"],
        favoritesOnly: true,
        tagIds: ["tag-halloween"],
        collectionIds: ["col-1"],
        projectIds: ["proj-1"],
        ecosystem: "bambu",
      },
    });
  });

  it("migrates legacy tag= into tags filter", () => {
    const params = new URLSearchParams("tag=legacy-tag");
    expect(libraryUrlFromSearchParams(params).search.tagIds).toEqual([
      "legacy-tag",
    ]);
  });

  it("preserves browse when serializing empty search", () => {
    const params = libraryUrlToSearchParams({
      browse: {
        locationPath: "/Users/me/Models",
        relativeDir: "props",
      },
      search: EMPTY_LIBRARY_SEARCH,
    });
    expect(params.get("loc")).toBe("/Users/me/Models");
    expect(params.get("dir")).toBe("props");
    expect(params.get("q")).toBeNull();
  });
});
