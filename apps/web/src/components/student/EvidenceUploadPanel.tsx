import { useRef, useState } from "react";
import { useIntegrations } from "$lib/integrations/use-integrations";
import {
  STORAGE_ACCEPT,
  validateStorageFile,
} from "$lib/storage/use-storage-upload";
import type { StorageRoute } from "$lib/storage/use-storage-upload";
import DriveThumb from "../DriveThumb";
import FileChip from "../FileChip";
import EmptyState from "../ui/EmptyState";

type EvidenceItem = {
  id: string;
  fileUrl: string;
  fileKey?: string | null;
  mime?: string | null;
  name?: string | null;
  kind: string;
  expiresAt?: string | null;
  expired?: boolean;
};

/** The upload tab of EvidenceSlot: thumbnails, dropzone, expiry note. */
export default function EvidenceUploadPanel({
  items,
  multiple = false,
  locked,
  label,
  hint,
  uploading,
  pending,
  onpick,
  onremovepending,
  ondelete,
  onpreview,
  route = "evidenceImage",
}: {
  items: EvidenceItem[];
  multiple?: boolean;
  locked: boolean;
  label: string;
  hint?: string;
  uploading: boolean;
  pending: { id: string; name: string; previewUrl: string | null }[];
  onpick: (file: File) => void;
  onremovepending: (id: string) => void;
  ondelete: (uploadId: string) => void;
  onpreview: (index: number) => void;
  route?: StorageRoute;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { flags } = useIntegrations();

  const imageItems = items.filter((e) => e.kind !== "EXTERNAL_LINK");
  const liveItems = imageItems.filter((e) => !e.expired);
  const showSlot = multiple || (liveItems.length === 0 && pending.length === 0);

  const soonestExpiry = (() => {
    const times = liveItems
      .map((e) => (e.expiresAt ? new Date(e.expiresAt).getTime() : Number.NaN))
      .filter((t) => !Number.isNaN(t));
    return times.length > 0 ? Math.min(...times) : null;
  })();

  const expiryHint = (() => {
    if (locked || liveItems.length === 0) return null;
    if (soonestExpiry === null)
      return "Unsubmitted uploads are deleted 24 hours after upload.";
    const hours = Math.max(
      1,
      Math.round((soonestExpiry - Date.now()) / 3_600_000),
    );
    return `Expires in ${hours}h — unsubmitted uploads are deleted 24 hours after upload.`;
  })();

  function liveIndexAt(index: number): number {
    return imageItems.slice(0, index).filter((e) => !e.expired).length;
  }

  function openPicker() {
    if (locked || uploading) return;
    inputRef.current?.click();
  }

  function handleFile(file: File | undefined | null) {
    setLocalError(null);
    if (!file) return;
    const invalid = validateStorageFile(file, route);
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    onpick(file);
  }

  return (
    <div id="tab-upload" role="tabpanel">
      {imageItems.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {imageItems.map((item, i) => (
            <li key={item.id} className="relative">
              {item.expired ? (
                <div
                  className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-error/40 bg-error/5 px-2 text-center"
                  aria-label="Upload expired"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-error/70"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-error">
                    Expired
                  </span>
                </div>
              ) : (
                <div className="block h-24 w-24 overflow-hidden rounded-xl border border-border bg-surface">
                  <DriveThumb
                    item={item}
                    alt={`Upload ${liveIndexAt(i) + 1}`}
                    label={`View upload ${liveIndexAt(i) + 1}`}
                    className="h-full w-full object-cover"
                    onClick={() => onpreview(liveIndexAt(i))}
                  />
                </div>
              )}
              {!locked ? (
                <button
                  type="button"
                  onClick={() => ondelete(item.id)}
                  aria-label="Remove upload"
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised text-muted shadow hover:text-error"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              ) : null}
              {!locked && !item.expired ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {expiryHint ? (
        <p className="mt-2 text-xs text-muted">{expiryHint}</p>
      ) : null}

      {pending.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3">
          {pending.map((p) => (
            <li key={p.id} className="relative">
              {p.previewUrl ? (
                <div className="h-24 w-24 overflow-hidden rounded-xl border border-border bg-surface">
                  <img
                    src={p.previewUrl}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-48">
                  <FileChip name={p.name} compact />
                </div>
              )}
              <button
                type="button"
                onClick={() => onremovepending(p.id)}
                disabled={uploading}
                aria-label="Remove upload"
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised text-muted shadow hover:text-error disabled:opacity-50"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!flags.r2 && imageItems.length === 0 ? (
        <EmptyState
          variant="card"
          title="Uploads are paused"
          hint="The office paused new uploads. Anything you already attached stays here."
        />
      ) : null}

      {showSlot && !locked && flags.r2 ? (
        <>
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            aria-label={label}
            className="mt-3 flex min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface/60 px-4 py-6 text-center hover:border-primary/40 disabled:opacity-60"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-primary"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            <span className="text-sm font-medium text-ink">{label}</span>
            {hint ? <span className="text-xs text-muted">{hint}</span> : null}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={STORAGE_ACCEPT}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              void handleFile(f);
              e.currentTarget.value = "";
            }}
          />
        </>
      ) : null}

      {localError ? (
        <div
          className="mt-2 rounded-xl border border-error/25 bg-error/5 px-3 py-2.5"
          aria-live="polite"
        >
          <p className="text-xs text-error">{localError}</p>
        </div>
      ) : null}
    </div>
  );
}
