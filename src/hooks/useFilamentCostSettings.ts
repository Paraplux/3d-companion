import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  readFilamentCostSettings,
  subscribeFilamentCost,
  writeFilamentCostSettings,
} from "@/lib/filamentCost";
import type { FilamentCostSettings } from "@/types/filamentCost";

export function useFilamentCostSettings(): {
  settings: FilamentCostSettings;
  setSettings: (next: FilamentCostSettings) => void;
  updateSettings: (patch: Partial<FilamentCostSettings>) => void;
} {
  const settings = useSyncExternalStore(
    subscribeFilamentCost,
    readFilamentCostSettings,
    readFilamentCostSettings,
  );

  const setSettings = useCallback((next: FilamentCostSettings) => {
    writeFilamentCostSettings(next);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<FilamentCostSettings>) => {
      writeFilamentCostSettings({ ...settings, ...patch });
    },
    [settings],
  );

  return useMemo(
    () => ({ settings, setSettings, updateSettings }),
    [settings, setSettings, updateSettings],
  );
}
