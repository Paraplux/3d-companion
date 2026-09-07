import type { LibraryFile } from "@/types/library";

/** Formats that Bambu Studio can open from 3D Library in this phase. */
export function canOpenInBambuStudio(
  file: Pick<LibraryFile, "extension">,
): boolean {
  const extension = file.extension.trim().toLowerCase();
  return extension === "stl" || extension === "3mf";
}
