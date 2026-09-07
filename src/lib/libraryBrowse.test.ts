import { describe, expect, it } from "vitest";
import {
  browseFromSearchParams,
  browseToSearchParams,
  libraryHrefForFile,
} from "@/lib/libraryBrowse";

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
    const params = browseToSearchParams({ locationPath: null, relativeDir: "" });
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
});
