import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { formatBytes } from "@/lib/format";
import type { ImportsAfterAction } from "@/types/remoteConfig";

type CloudConnectionSectionProps = {
  remote: ReturnType<typeof useRemoteConfig>;
};

const afterActionOptions: Array<{ value: ImportsAfterAction; label: string }> = [
  { value: "move", label: "Move to Imported/" },
  { value: "keep", label: "Keep in folder" },
  { value: "delete", label: "Delete local file" },
];

export function CloudConnectionSection({ remote }: CloudConnectionSectionProps) {
  const {
    ready,
    draft,
    dirty,
    saving,
    testing,
    clearingCache,
    backfillingThumbs,
    cacheStats,
    error,
    testResult,
    backfillMessage,
    configured,
    savedConfigured,
    connectionDirty,
    clearError,
    clearBackfillMessage,
    updateDraft,
    save,
    test,
    clearCache,
    backfillThumbnails,
  } = remote;

  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function pickImportsFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose Bambu / MakerWorld downloads folder",
    });
    if (selected === null || Array.isArray(selected)) {
      return;
    }
    updateDraft({ importsFolderPath: selected });
  }

  if (!ready) {
    return (
      <section className="settings-block">
        <p className="settings-empty">Loading cloud settings…</p>
      </section>
    );
  }

  const cacheLabel =
    cacheStats == null
      ? "Measuring…"
      : cacheStats.fileCount === 0
        ? "Empty"
        : `${formatBytes(cacheStats.bytes)} · ${cacheStats.fileCount} file${
            cacheStats.fileCount === 1 ? "" : "s"
          }`;

  return (
    <section className="settings-block">
      <div className="settings-block__header">
        <div>
          <h2 className="settings-section__title">Cloud library</h2>
          <p className="settings-section__description">
            Sync your catalog across devices. When enabled, this Mac uses the
            cloud library only — local folders are ignored.
          </p>
        </div>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => updateDraft({ enabled: event.target.checked })}
          />
          <span>Enabled</span>
        </label>
      </div>

      {error ? (
        <div className="banner banner--error" role="alert">
          <p>{error}</p>
          <button type="button" className="banner__dismiss" onClick={clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      {testResult ? (
        <div
          className={
            testResult.ok ? "banner banner--success" : "banner banner--error"
          }
          role="status"
        >
          <p>{testResult.message}</p>
        </div>
      ) : null}

      {backfillMessage && !error ? (
        <div className="banner banner--success" role="status">
          <p>{backfillMessage}</p>
          <button
            type="button"
            className="banner__dismiss"
            onClick={clearBackfillMessage}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="settings-form">
        <label className="settings-field">
          <span className="settings-field__label">Server URL</span>
          <input
            className="settings-field__input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://library.example.com"
            value={draft.baseUrl}
            onChange={(event) => updateDraft({ baseUrl: event.target.value })}
          />
          <span className="settings-field__hint">
            Your cloud library address. Adding `/v1` is optional.
          </span>
        </label>

        <label className="settings-field">
          <span className="settings-field__label">API key</span>
          <input
            className="settings-field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Access token"
            value={draft.apiKey}
            onChange={(event) => updateDraft({ apiKey: event.target.value })}
          />
        </label>

        <label className="settings-toggle settings-toggle--field">
          <input
            type="checkbox"
            checked={draft.autoSyncOnReturn}
            onChange={(event) =>
              updateDraft({ autoSyncOnReturn: event.target.checked })
            }
          />
          <span className="settings-toggle__copy">
            <span className="settings-field__label">
              Auto sync after Bambu
            </span>
            <span className="settings-field__hint">
              When you return after editing a cloud file in Bambu Studio, push
              changes automatically. Unchanged files are skipped.
            </span>
          </span>
        </label>

        <div className="settings-advanced">
          <button
            type="button"
            className="settings-advanced__toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            {advancedOpen ? "Hide advanced" : "Show advanced"}
          </button>

          {advancedOpen ? (
            <div className="settings-advanced__body">
              <label className="settings-field settings-field--narrow">
                <span className="settings-field__label">Cache TTL (days)</span>
                <input
                  className="settings-field__input"
                  type="number"
                  min={1}
                  max={365}
                  value={draft.cacheTtlDays}
                  onChange={(event) =>
                    updateDraft({
                      cacheTtlDays: Number(event.target.value) || 7,
                    })
                  }
                />
                <span className="settings-field__hint">
                  Downloaded models stay on this Mac for this many days after
                  last open. Expired files are removed on launch.
                </span>
              </label>

              <div className="settings-field">
                <span className="settings-field__label">Download cache</span>
                <div className="settings-field__row">
                  <p className="settings-cache-size">{cacheLabel}</p>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={
                      clearingCache ||
                      saving ||
                      cacheStats == null ||
                      cacheStats.fileCount === 0
                    }
                    onClick={() => void clearCache()}
                  >
                    {clearingCache ? "Clearing…" : "Clear cache"}
                  </button>
                </div>
                <span className="settings-field__hint">
                  Local copies used for preview and Bambu. Clearing frees disk;
                  files re-download on next open.
                </span>
              </div>

              <div className="settings-field">
                <span className="settings-field__label">Server thumbnails</span>
                <div className="settings-field__row">
                  <p className="settings-cache-size">
                    Fill missing previews on the server
                  </p>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={
                      !savedConfigured ||
                      connectionDirty ||
                      backfillingThumbs ||
                      saving ||
                      testing
                    }
                    onClick={() => void backfillThumbnails()}
                  >
                    {backfillingThumbs ? "Regenerating…" : "Regenerate thumbnails"}
                  </button>
                </div>
                <span className="settings-field__hint">
                  Generates missing catalog previews. Save URL/key first if you
                  changed them.
                </span>
              </div>

              <div className="settings-field">
                <span className="settings-field__label">Imports folder</span>
                <div className="settings-field__row">
                  <input
                    className="settings-field__input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="/Users/you/BambuStudio/Downloads"
                    value={draft.importsFolderPath}
                    onChange={(event) =>
                      updateDraft({ importsFolderPath: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => void pickImportsFolder()}
                  >
                    Browse…
                  </button>
                </div>
                <span className="settings-field__hint">
                  Bambu / MakerWorld downloads. Files under Imports can be sent
                  to the cloud. Subfolder <code>Imported/</code> is skipped.
                </span>
              </div>

              <label className="settings-field">
                <span className="settings-field__label">After import</span>
                <select
                  className="settings-field__input"
                  value={draft.importsAfterAction}
                  onChange={(event) =>
                    updateDraft({
                      importsAfterAction: event.target
                        .value as ImportsAfterAction,
                    })
                  }
                >
                  {afterActionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="settings-field__hint">
                  What to do with the local file after a successful upload.
                </span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="button button--ghost"
          disabled={!configured || testing || saving}
          onClick={() => void test()}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
