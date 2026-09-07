import { describe, expect, it } from "vitest";
import { resolveFavoriteFiles } from "@/lib/favorites";
import type { LibraryFile } from "@/types/library";

function file(id: string, name = `${id}.stl`): LibraryFile {
  return {
    libraryFileId: id,
    contentHash: `hash-${id}`,
    path: `/tmp/${name}`,
    name,
    extension: "stl",
    size: 10,
    modifiedAt: 1,
    relativePath: name,
    locationPath: "/tmp",
    analysisStatus: "ready",
  };
}

describe("resolveFavoriteFiles", () => {
  it("returns favorites in favorite-id order and skips missing files", () => {
    const files = [file("a"), file("b"), file("c")];
    const resolved = resolveFavoriteFiles(files, ["c", "missing", "a"]);
    expect(resolved.map((entry) => entry.libraryFileId)).toEqual(["c", "a"]);
  });

  it("returns an empty list when there are no favorites", () => {
    expect(resolveFavoriteFiles([file("a")], [])).toEqual([]);
  });

  it("never matches on path or content hash", () => {
    const files = [file("stable-id", "renamed.stl")];
    files[0]!.contentHash = "changed-hash";
    files[0]!.path = "/other/path.stl";

    const resolved = resolveFavoriteFiles(files, ["stable-id"]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.libraryFileId).toBe("stable-id");
    expect(resolveFavoriteFiles(files, ["changed-hash"])).toEqual([]);
    expect(resolveFavoriteFiles(files, ["/other/path.stl"])).toEqual([]);
  });
});
