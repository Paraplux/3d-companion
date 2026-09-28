import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImportThumb } from "@/components/library/ImportThumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useLibrary } from "@/hooks/useLibrary";
import { useRemoteConfig } from "@/hooks/useRemoteConfig";
import { formatBytes } from "@/lib/format";
import { toUserError } from "@/lib/libraryApi";
import {
  finalizeImportCandidate,
  listImportCandidates,
  uploadRemoteFile,
} from "@/lib/remoteApi";
import type { ImportCandidate } from "@/types/remoteConfig";

function formatModified(ms: number): string {
  if (!ms) {
    return "—";
  }
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export function ImportsPage() {
  const { cloudMode, rescan } = useLibrary();
  const { config, ready: remoteReady } = useRemoteConfig();
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const folderConfigured = Boolean(config.importsFolderPath.trim());

  const refresh = useCallback(async () => {
    if (!folderConfigured) {
      setCandidates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await listImportCandidates();
      setCandidates(next);
      setSelected((current) => {
        const paths = new Set(next.map((item) => item.path));
        return new Set([...current].filter((path) => paths.has(path)));
      });
    } catch (err) {
      setError(toUserError(err, "Could not read the Imports folder."));
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [folderConfigured]);

  useEffect(() => {
    if (!remoteReady || !cloudMode) {
      return;
    }
    void refresh();
  }, [cloudMode, refresh, remoteReady]);

  const allSelected =
    candidates.length > 0 && selected.size === candidates.length;

  const selectedCandidates = useMemo(
    () => candidates.filter((item) => selected.has(item.path)),
    [candidates, selected],
  );

  function toggleOne(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(candidates.map((item) => item.path)));
  }

  async function importPaths(paths: string[]) {
    if (paths.length === 0) {
      return;
    }

    setImporting(true);
    setError(null);
    setStatusMessage(null);

    let uploaded = 0;
    let deduped = 0;
    const errors: string[] = [];

    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      if (!path) {
        continue;
      }
      const name = path.split("/").pop() ?? path;
      setProgressLabel(`Importing ${index + 1} of ${paths.length} — ${name}`);
      try {
        const result = await uploadRemoteFile(path);
        if (result.deduplicated) {
          deduped += 1;
        } else {
          uploaded += 1;
        }
        await finalizeImportCandidate(path);
      } catch (err) {
        errors.push(toUserError(err, `Could not import ${name}`));
      }
    }

    setProgressLabel(null);
    setImporting(false);

    await refresh();
    try {
      await rescan();
    } catch {
      // Catalog refresh is best-effort after imports.
    }

    if (errors.length > 0) {
      setError(
        errors.length === 1
          ? (errors[0] ?? "Import failed.")
          : `${errors.length} imports failed. ${errors[0] ?? ""}`,
      );
    }

    const parts: string[] = [];
    if (uploaded > 0) {
      parts.push(`${uploaded} uploaded`);
    }
    if (deduped > 0) {
      parts.push(`${deduped} already in cloud`);
    }
    if (parts.length > 0) {
      setStatusMessage(parts.join(" · "));
    }
    setSelected(new Set());
  }

  if (!remoteReady) {
    return (
      <section className="page">
        <PageHeader title="Imports" subtitle="Loading…" />
      </section>
    );
  }

  if (!cloudMode) {
    return (
      <section className="page">
        <PageHeader title="Imports" subtitle="Cloud staging" />
        <EmptyState
          title="Cloud library is off"
          description="Enable Cloud library in Settings to import Bambu / MakerWorld downloads into the cloud catalog."
          action={
            <Link className="button button--primary" to="/settings">
              Open Settings
            </Link>
          }
        />
      </section>
    );
  }

  if (!folderConfigured) {
    return (
      <section className="page">
        <PageHeader title="Imports" subtitle="Cloud staging" />
        <EmptyState
          title="No Imports folder yet"
          description="Choose the folder where Bambu Studio / MakerWorld saves downloads (Settings → Imports folder)."
          action={
            <Link className="button button--primary" to="/settings">
              Choose folder
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="page page--imports">
      <div className="imports-top">
        <PageHeader
          title="Imports"
          subtitle={
            progressLabel ??
            statusMessage ??
            `${candidates.length} file${candidates.length === 1 ? "" : "s"} · ${config.importsFolderPath}`
          }
        />
        <div className="imports-toolbar">
          <button
            type="button"
            className="button button--ghost"
            disabled={loading || importing}
            onClick={() => void refresh()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={importing || selectedCandidates.length === 0}
            onClick={() =>
              void importPaths(selectedCandidates.map((item) => item.path))
            }
          >
            {importing
              ? "Importing…"
              : `Import selected (${selectedCandidates.length})`}
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={importing || candidates.length === 0}
            onClick={() => void importPaths(candidates.map((item) => item.path))}
          >
            Import all
          </button>
        </div>
      </div>

      {error ? (
        <div className="banner banner--error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="banner__dismiss"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {statusMessage && !error ? (
        <div className="banner banner--success" role="status">
          <p>{statusMessage}</p>
        </div>
      ) : null}

      {!loading && candidates.length === 0 ? (
        <EmptyState
          title="Nothing to import"
          description="Drop models into your Imports folder from MakerWorld / Bambu Studio, then refresh."
          action={
            <button
              type="button"
              className="button button--primary"
              onClick={() => void refresh()}
            >
              Refresh
            </button>
          }
        />
      ) : null}

      {candidates.length > 0 ? (
        <div className="imports-table-wrap">
          <table className="imports-table">
            <thead>
              <tr>
                <th className="imports-table__check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    disabled={importing}
                  />
                </th>
                <th className="imports-table__preview">Preview</th>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Modified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((item) => (
                <tr key={item.path}>
                  <td className="imports-table__check">
                    <input
                      type="checkbox"
                      checked={selected.has(item.path)}
                      onChange={() => toggleOne(item.path)}
                      aria-label={`Select ${item.name}`}
                      disabled={importing}
                    />
                  </td>
                  <td className="imports-table__preview">
                    <div className="imports-thumb">
                      <ImportThumb
                        path={item.path}
                        extension={item.extension}
                        name={item.name}
                      />
                    </div>
                  </td>
                  <td className="imports-table__name">{item.name}</td>
                  <td>{item.extension.toUpperCase()}</td>
                  <td>{formatBytes(item.size)}</td>
                  <td>{formatModified(item.modifiedAt)}</td>
                  <td className="imports-table__actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={importing}
                      onClick={() => void importPaths([item.path])}
                    >
                      Import
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
