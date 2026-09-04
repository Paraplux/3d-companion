import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getBackgroundTasks } from "@/lib/libraryApi";
import type { BackgroundTasksEvent } from "@/types/library";

const EMPTY: BackgroundTasksEvent = {
  tasks: [],
  activeCount: 0,
};

export function useBackgroundTasks(): BackgroundTasksEvent {
  const [state, setState] = useState<BackgroundTasksEvent>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    void getBackgroundTasks()
      .then((snapshot) => {
        if (!cancelled) {
          setState(snapshot);
        }
      })
      .catch(() => {
        /* indicator is best-effort */
      });

    let unlisten: (() => void) | undefined;
    void listen<BackgroundTasksEvent>("background://tasks", (event) => {
      setState(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return state;
}
