import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CloudConnectionSection } from "@/components/settings/CloudConnectionSection";
import { FilamentCostSettingsSection } from "@/components/settings/FilamentCostSettingsSection";
import { TagsSettingsSection } from "@/components/library/TagsSettingsSection";
import { useLibrary } from "@/hooks/useLibrary";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { useTheme } from "@/hooks/useTheme";
import type { ThemePreference } from "@/types/theme";

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies ReadonlyArray<{
  value: ThemePreference;
  label: string;
}>;

export function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const { locations, error, clearError, addFolder, removeFolder, cloudMode } =
    useLibrary();
  const remote = useRemoteConfig();
  const localFoldersDisabled = cloudMode || remote.draft.enabled;

  return (
    <section className="page">
      <PageHeader title="Settings" subtitle="Preferences for this app" />

      <div className="settings">
        <section className="settings-section">
          <div className="settings-section__copy">
            <h2 className="settings-section__title">Appearance</h2>
            <p className="settings-section__description">
              Choose how 3D Library looks. System follows your macOS appearance.
            </p>
          </div>

          <SegmentedControl
            ariaLabel="Appearance"
            options={themeOptions}
            value={preference}
            onChange={setPreference}
          />
        </section>

        <CloudConnectionSection remote={remote} />

        <FilamentCostSettingsSection />

        <section
          className={`settings-block${
            localFoldersDisabled ? " settings-block--disabled" : ""
          }`}
          aria-disabled={localFoldersDisabled}
        >
          <div className="settings-block__header">
            <div>
              <h2 className="settings-section__title">Library locations</h2>
              <p className="settings-section__description">
                {localFoldersDisabled
                  ? "Local folders are disabled while Cloud library is enabled. Turn off Cloud library to manage folders on this Mac."
                  : "Local folders scanned for STL, 3MF, OBJ, and STEP files. Removing a folder never deletes files from disk."}
              </p>
            </div>
            <button
              type="button"
              className="button button--primary"
              disabled={localFoldersDisabled}
              onClick={() => void addFolder()}
            >
              Add folder
            </button>
          </div>

          {error && !localFoldersDisabled ? (
            <div className="banner banner--error" role="alert">
              <p>{error}</p>
              <button type="button" className="banner__dismiss" onClick={clearError}>
                Dismiss
              </button>
            </div>
          ) : null}

          {locations.length === 0 ? (
            <p className="settings-empty">
              {localFoldersDisabled
                ? "Using cloud catalog only."
                : "No folders added yet."}
            </p>
          ) : (
            <ul className="location-list">
              {locations.map((location) => (
                <li key={location.path} className="location-list__item">
                  <div className="location-list__icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path
                        d="M2.5 5h4.2l1.3 1.3H15.5v7.7H2.5V5Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="location-list__copy">
                    <p className="location-list__name">{location.name}</p>
                    <p className="location-list__path">{location.path}</p>
                  </div>
                  <button
                    type="button"
                    className="button button--ghost location-list__remove"
                    aria-label={`Remove ${location.name}`}
                    disabled={localFoldersDisabled}
                    onClick={() => void removeFolder(location.path)}
                  >
                    −
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <TagsSettingsSection />
      </div>
    </section>
  );
}
