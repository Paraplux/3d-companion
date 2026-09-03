import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
      </div>
    </section>
  );
}
