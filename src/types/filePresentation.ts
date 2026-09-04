/**
 * Presentation-level format vs ecosystem.
 * Format comes from the physical extension.
 * Ecosystem comes only from analysis detection — never inferred from extension alone.
 */

export type FileFormat = "3mf" | "stl" | "step" | "stp" | "obj";

export type Ecosystem = "bambu";

export type EcosystemId = Ecosystem | null;

export const FILE_FORMAT_LABEL: Record<FileFormat, string> = {
  "3mf": "3MF",
  stl: "STL",
  step: "STEP",
  stp: "STP",
  obj: "OBJ",
};

export const ECOSYSTEM_LABEL: Record<Ecosystem, string> = {
  bambu: "Bambu Lab / Bambu Studio",
};

export function fileFormatFromExtension(extension: string): FileFormat | null {
  switch (extension.trim().toLowerCase()) {
    case "3mf":
      return "3mf";
    case "stl":
      return "stl";
    case "step":
      return "step";
    case "stp":
      return "stp";
    case "obj":
      return "obj";
    default:
      return null;
  }
}
