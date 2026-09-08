import type { FileNote } from "@/types/library";
import type { LibraryFileId } from "@/types/libraryData";

/** Build libraryFileId → note from a flat list. */
export function buildFileNoteMap(
  notes: FileNote[],
): Record<LibraryFileId, FileNote> {
  const map: Record<LibraryFileId, FileNote> = {};
  for (const note of notes) {
    map[note.libraryFileId] = note;
  }
  return map;
}

export function hasFileNote(
  fileNoteMap: Record<LibraryFileId, FileNote>,
  libraryFileId: LibraryFileId,
): boolean {
  return Boolean(fileNoteMap[libraryFileId]?.content.trim());
}
