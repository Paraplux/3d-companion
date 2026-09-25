/**
 * Machine-local application configuration.
 *
 * Never sync between computers. Paths and UI chrome differ per Mac.
 * See docs/architecture.md.
 */
import type { RemoteConfig } from "@/types/remoteConfig";
import type { ThemePreference } from "@/types/theme";

export type AppConfig = {
  /** Appearance preference for this machine. */
  theme: ThemePreference;
  /**
   * Absolute paths of library root folders on this machine.
   * Persisted today via the Rust backend (SQLite library_locations).
   */
  libraryLocations: string[];
  /**
   * Cloud gateway connection. Persisted as remote-config.json in app data.
   */
  remote?: RemoteConfig;
  /**
   * Reserved for future local UI state (window geometry, sidebar width, etc.).
   * Not implemented yet.
   */
  ui?: {
    sidebarWidth?: number;
    window?: {
      width?: number;
      height?: number;
      x?: number;
      y?: number;
    };
  };
};
