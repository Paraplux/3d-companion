import { useEffect, useMemo, useState } from "react";
import { getCachedModelGeometry, getModelGeometry, toUserError } from "@/lib/libraryApi";
import type { ModelGeometryResponse } from "@/types/geometry";
import type { LibraryFile } from "@/types/library";

type GeometryState =
  | { status: "idle" }
  | { status: "loading"; data?: ModelGeometryResponse }
  | { status: "ready"; data: ModelGeometryResponse }
  | { status: "error"; message: string; data?: ModelGeometryResponse };

export function useModelGeometry(file: LibraryFile | null, plateId: string | null) {
  const canLoad = useMemo(() => {
    if (!file) {
      return false;
    }
    const extension = file.extension.toLowerCase();
    return extension === "stl" || extension === "3mf";
  }, [file?.extension]);

  const cached = file && canLoad
    ? getCachedModelGeometry(file.libraryFileId, plateId, file.contentHash)
    : undefined;

  const [state, setState] = useState<GeometryState>(() =>
    cached
      ? { status: "ready", data: cached }
      : file && canLoad
        ? { status: "loading" }
        : { status: "idle" },
  );

  useEffect(() => {
    if (!file || !canLoad) {
      setState({ status: "idle" });
      return;
    }

    const ready = getCachedModelGeometry(file.libraryFileId, plateId, file.contentHash);
    if (ready) {
      setState({ status: "ready", data: ready });
      return;
    }

    let cancelled = false;
    // Keep previous plate/mesh visible while the next one loads (avoids Canvas remount).
    setState((previous) => {
      const previousData =
        previous.status === "ready" || previous.status === "loading"
          ? previous.data
          : previous.status === "error"
            ? previous.data
            : undefined;
      return previousData
        ? { status: "loading", data: previousData }
        : { status: "loading" };
    });

    void getModelGeometry(file.libraryFileId, plateId, file.contentHash)
      .then((data) => {
        if (!cancelled) {
          setState({ status: "ready", data });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState((previous) => ({
            status: "error",
            message: toUserError(error, "3D preview unavailable"),
            data:
              previous.status === "ready" || previous.status === "loading"
                ? previous.data
                : previous.status === "error"
                  ? previous.data
                  : undefined,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canLoad, file?.contentHash, file?.libraryFileId, plateId]);

  return { state, canLoad };
}
