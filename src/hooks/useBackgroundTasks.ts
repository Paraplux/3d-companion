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
    let unlisten: (() => void) | undefined;

    void getBackgroundTasks()
      .then((snapshot) => {
        if (!cancelled) {
          setState(snapshot);
        }
      })
      .catch(() => {
        /* indicator is best-effort */
      });

    void listen<BackgroundTasksEvent>("background://tasks", (event) => {
      if (!cancelled) {
        setState(event.payload);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return state;
}
