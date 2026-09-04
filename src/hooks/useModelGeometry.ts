import { useEffect, useMemo, useState } from "react";
import { getModelGeometry, toUserError } from "@/lib/libraryApi";
import type { ModelGeometryResponse } from "@/types/geometry";
import type { LibraryFile } from "@/types/library";

type GeometryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ModelGeometryResponse }
  | { status: "error"; message: string };

export function useModelGeometry(file: LibraryFile | null, plateId: string | null) {
  const [state, setState] = useState<GeometryState>({ status: "idle" });

  const canLoad = useMemo(() => {
    if (!file) {
      return false;
    }
    const extension = file.extension.toLowerCase();
    return extension === "stl" || extension === "3mf";
  }, [file]);

  useEffect(() => {
    if (!file || !canLoad) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void getModelGeometry(file.libraryFileId, plateId)
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: toUserError(error, "3D preview unavailable"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file, plateId, canLoad]);

  return { state, canLoad };
}
