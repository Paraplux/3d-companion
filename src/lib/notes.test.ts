import { describe, expect, it } from "vitest";
import { buildFileNoteMap, hasFileNote } from "@/lib/notes";
import type { FileNote } from "@/types/library";

function makeNote(
  libraryFileId: string,
  content: string,
): FileNote {
  return {
    libraryFileId,
    content,
    updatedAt: 1,
  };
}

describe("notes helpers", () => {
  it("builds a file→note map", () => {
    const map = buildFileNoteMap([
      makeNote("a", "PLA Silk"),
      makeNote("b", "0.6 nozzle"),
    ]);
    expect(map.a?.content).toBe("PLA Silk");
    expect(map.b?.content).toBe("0.6 nozzle");
  });

  it("detects notes with content", () => {
    const map = buildFileNoteMap([makeNote("a", "Keep")]);
    expect(hasFileNote(map, "a")).toBe(true);
    expect(hasFileNote(map, "missing")).toBe(false);
  });
});
