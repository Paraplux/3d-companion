import { useRemoteConfig } from "@/hooks/useRemoteConfig";

type CloudConnectionSectionProps = {
  remote: ReturnType<typeof useRemoteConfig>;
};

export function CloudConnectionSection({ remote }: CloudConnectionSectionProps) {
  const {
    ready,
    draft,
    dirty,
    saving,
    testing,
    error,
    testResult,
    configured,
    clearError,
    updateDraft,
    save,
    test,
  } = remote;

  if (!ready) {
    return (
      <section className="settings-block">
        <p className="settings-empty">Loading cloud settings…</p>
      </section>
    );
  }

  return (
    <section className="settings-block">
      <div className="settings-block__header">
        <div>
          <h2 className="settings-section__title">Cloud library</h2>
          <p className="settings-section__description">
            Connect to your 3D Library API gateway (Coolify). When enabled, this
            Mac uses the cloud catalog only — local folders are ignored.
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

      <div className="settings-form">
        <label className="settings-field">
          <span className="settings-field__label">API URL</span>
          <input
            className="settings-field__input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://3d-library.example.com"
            value={draft.baseUrl}
            onChange={(event) => updateDraft({ baseUrl: event.target.value })}
          />
          <span className="settings-field__hint">
            Origin of the gateway. `/v1` is optional — both work.
          </span>
        </label>

        <label className="settings-field">
          <span className="settings-field__label">API key</span>
          <input
            className="settings-field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Bearer token from Coolify / API_KEYS"
            value={draft.apiKey}
            onChange={(event) => updateDraft({ apiKey: event.target.value })}
          />
        </label>

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
            Downloaded models stay on this Mac for this many days after last open.
          </span>
        </label>
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
