import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { ask, open } from "@tauri-apps/plugin-dialog";
import {
  addLibraryLocation,
  getLibrarySnapshot,
  removeLibraryLocation,
  scanLibrary,
  toUserError,
} from "@/lib/libraryApi";
import type { LibraryEvent, LibraryFile, LibraryLocation } from "@/types/library";

type LibraryContextValue = {
  locations: LibraryLocation[];
  files: LibraryFile[];
  ready: boolean;
  scanning: boolean;
  scanningLabel: string | null;
  error: string | null;
  clearError: () => void;
  addFolder: () => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  rescan: () => Promise<void>;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<LibraryLocation[]>([]);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningLabel, setScanningLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setScanning(true);
      setScanningLabel("Scanning…");
      try {
        const snapshot = await getLibrarySnapshot();
        if (cancelled) {
          return;
        }
        setLocations(snapshot.locations);
        setFiles(snapshot.files);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(toUserError(err, "Could not load your library."));
        }
      } finally {
        if (!cancelled) {
          setScanning(false);
          setScanningLabel(null);
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<LibraryEvent>("library://changed", (event) => {
      const payload = event.payload;

      if (payload.type === "locationUpdated") {
        setFiles((current) => [
          ...current.filter((file) => file.locationPath !== payload.locationPath),
          ...payload.files,
        ]);
        return;
      }

      if (payload.type === "locationRemoved") {
        setLocations((current) =>
          current.filter((location) => location.path !== payload.locationPath),
        );
        setFiles((current) =>
          current.filter((file) => file.locationPath !== payload.locationPath),
        );
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const addFolder = useCallback(async () => {
    clearError();

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Add library folder",
      });

      if (selected === null || Array.isArray(selected)) {
        return;
      }

      setScanning(true);
      setScanningLabel("Scanning…");

      const result = await addLibraryLocation(selected);
      setScanningLabel(`Scanning ${result.location.name}…`);
      setLocations((current) => {
        if (current.some((location) => location.path === result.location.path)) {
          return current;
        }
        return [...current, result.location];
      });
      setFiles((current) => [
        ...current.filter((file) => file.locationPath !== result.location.path),
        ...result.files,
      ]);
    } catch (err) {
      setError(toUserError(err, "Could not add that folder."));
    } finally {
      setScanning(false);
      setScanningLabel(null);
    }
  }, [clearError]);

  const removeFolder = useCallback(
    async (path: string) => {
      clearError();

      const location = locations.find((item) => item.path === path);
      const confirmed = await ask(
        "Remove this folder from your library?\n\nYour files will not be deleted.",
        {
          title: location ? `Remove “${location.name}”` : "Remove folder",
          kind: "warning",
        },
      );

      if (!confirmed) {
        return;
      }

      try {
        await removeLibraryLocation(path);
        setLocations((current) => current.filter((item) => item.path !== path));
        setFiles((current) => current.filter((file) => file.locationPath !== path));
      } catch (err) {
        setError(toUserError(err, "Could not remove that folder."));
      }
    },
    [clearError, locations],
  );

  const rescan = useCallback(async () => {
    clearError();
    setScanning(true);
    setScanningLabel("Scanning…");

    try {
      const nextFiles = await scanLibrary();
      setFiles(nextFiles);
    } catch (err) {
      setError(toUserError(err, "Could not scan your library."));
    } finally {
      setScanning(false);
      setScanningLabel(null);
    }
  }, [clearError]);

  const value = useMemo(
    () => ({
      locations,
      files,
      ready,
      scanning,
      scanningLabel,
      error,
      clearError,
      addFolder,
      removeFolder,
      rescan,
    }),
    [
      locations,
      files,
      ready,
      scanning,
      scanningLabel,
      error,
      clearError,
      addFolder,
      removeFolder,
      rescan,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);

  if (!context) {
    throw new Error("useLibrary must be used within LibraryProvider");
  }

  return context;
}
