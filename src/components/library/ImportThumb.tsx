import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getImportPreview } from "@/lib/remoteApi";

const pathCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function loadPreview(path: string): Promise<string | null> {
  if (pathCache.has(path)) {
    return pathCache.get(path) ?? null;
  }
  const pending = inflight.get(path);
  if (pending) {
    return pending;
  }

  const request = getImportPreview(path)
    .then((result) => {
      pathCache.set(path, result);
      inflight.delete(path);
      return result;
    })
    .catch(() => {
      pathCache.set(path, null);
      inflight.delete(path);
      return null;
    });

  inflight.set(path, request);
  return request;
}

type ImportThumbProps = {
  path: string;
  extension: string;
  name: string;
};

export function ImportThumb({ path, extension, name }: ImportThumbProps) {
  const [src, setSrc] = useState<string | null>(() => {
    const cached = pathCache.get(path);
    return cached ? convertFileSrc(cached) : null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = pathCache.get(path);
    if (cached) {
      setSrc(convertFileSrc(cached));
      setFailed(false);
      return;
    }
    if (cached === null) {
      setSrc(null);
      return;
    }

    void loadPreview(path).then((result) => {
      if (cancelled) {
        return;
      }
      setSrc(result ? convertFileSrc(result) : null);
      setFailed(false);
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (src && !failed) {
    return (
      <img
        className="imports-thumb__img"
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="imports-thumb__badge" aria-hidden="true" title={name}>
      {extension.toUpperCase() || "?"}
    </span>
  );
}
