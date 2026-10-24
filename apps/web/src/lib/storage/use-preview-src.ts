import { useEffect, useState } from "react";
import { contentUrl, isProxyRow, parse409Fallback } from "./preview";
import {
  cachePreviewBlob,
  cachePreviewFallback,
  getCachedPreview,
} from "./preview-cache";

export type PreviewItem = {
  id: string;
  fileKey?: string | null;
  fileUrl?: string | null;
};

/**
 * R2 rows load bytes via GET /uploads/:id/content (never a persisted
 * direct link). Legacy EXTERNAL_LINK / UploadThing rows keep rendering
 * fileUrl exactly as today. On 409 {fallbackUrl}, render the fallback.
 *
 * Bytes are cached per upload id in IndexedDB (per device) so revisiting a
 * page does not re-fetch them.
 */
export function usePreviewSrc(item: PreviewItem | null): string | null {
  const [src, setSrc] = useState<string | null>(
    item && !isProxyRow(item) ? (item.fileUrl ?? null) : null,
  );

  useEffect(() => {
    if (!item || !isProxyRow(item)) {
      setSrc(item?.fileUrl ?? null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    (async () => {
      try {
        const cached = await getCachedPreview(item.id);
        if (cancelled) return;
        if (cached?.kind === "blob") {
          objectUrl = URL.createObjectURL(cached.blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
            return;
          }
          setSrc(objectUrl);
          return;
        }
        if (cached?.kind === "fallback") {
          setSrc(cached.url);
          return;
        }
      } catch {
        // Fall through to network fetch.
      }
      if (cancelled) return;
      try {
        const res = await fetch(contentUrl(item.id), {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 409) {
          const fallback =
            parse409Fallback(await res.json()) ?? item.fileUrl ?? null;
          setSrc(fallback);
          if (fallback) void cachePreviewFallback(item.id, fallback);
          return;
        }
        if (!res.ok) {
          setSrc(item.fileUrl ?? null);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        void cachePreviewBlob(item.id, blob);
      } catch {
        if (!cancelled) setSrc(item.fileUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.fileKey, item?.fileUrl]);

  return src;
}
