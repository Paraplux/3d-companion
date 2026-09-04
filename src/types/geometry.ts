export type ModelGeometryObject = {
  id: string;
  name?: string;
  transform?: number[];
  color?: string;
  positionsPath: string;
  triangleCount: number;
};

export type ModelGeometryResponse = {
  format: "stl" | "3mf" | string;
  plateId?: string;
  bedWidthMm?: number;
  bedDepthMm?: number;
  objects: ModelGeometryObject[];
};
