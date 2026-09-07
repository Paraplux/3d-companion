import { describe, expect, it } from "vitest";
import {
  browseFromSearchParams,
  browseToSearchParams,
  libraryHrefForFile,
} from "@/lib/libraryBrowse";

describe("library browse URL state", () => {
  it("round-trips location, relative dir, and tag", () => {
    const params = browseToSearchParams({
      locationPath: "/Users/me/Models",
      relativeDir: "robots/arms",
      tagId: "tag-pla",
    });
    expect(params.get("loc")).toBe("/Users/me/Models");
    expect(params.get("dir")).toBe("robots/arms");
    expect(params.get("tag")).toBe("tag-pla");
    expect(browseFromSearchParams(params)).toEqual({
      locationPath: "/Users/me/Models",
      relativeDir: "robots/arms",
      tagId: "tag-pla",
    });
  });

  it("serializes root as empty params", () => {
    const params = browseToSearchParams({
      locationPath: null,
      relativeDir: "",
      tagId: null,
    });
    expect(params.toString()).toBe("");
    expect(browseFromSearchParams(params)).toEqual({
      locationPath: null,
      relativeDir: "",
      tagId: null,
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
});
