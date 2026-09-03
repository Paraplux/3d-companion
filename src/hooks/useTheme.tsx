import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyResolvedTheme,
  getSystemTheme,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
} from "@/lib/theme";
import type { ResolvedTheme, ThemePreference } from "@/types/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemTheme(onStoreChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredTheme(),
  );
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    () => "light" as const,
  );

  const resolved: ResolvedTheme =
    preference === "system" ? systemTheme : preference;

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference(next: ThemePreference) {
        setPreferenceState(next);
        writeStoredTheme(next);
        applyResolvedTheme(resolveTheme(next));
      },
    }),
    [preference, resolved],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
