export function getDomainBadge(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (h === "drive.google.com") return "drive.google.com";
    if (h === "storage.to" || h.endsWith(".storage.to")) return "storage.to";
    return h;
  } catch {
    return "";
  }
}

export default function LinkManager({
  externalLink,
  linkInput,
  linkError,
  linkSaving,
  linkBusy,
  onsave,
  onremove,
  oninput,
}: {
  externalLink: { id: string; fileUrl: string; kind: string } | null;
  linkInput: string;
  linkError: string | null;
  linkSaving: boolean;
  linkBusy: boolean;
  onsave: () => void;
  onremove: () => void;
  oninput: (value: string) => void;
}) {
  return (
    <div
      id="tab-link"
      role="tabpanel"
      className="rounded-xl border border-border bg-surface p-3"
    >
      <label
        htmlFor="evidence-link-input"
        className="text-sm font-medium text-ink"
      >
        Share link
      </label>
      <p className="mt-1 text-xs text-muted">
        storage.to (recommended) or Google Drive — https:// only. One link per
        step.
      </p>
      <a
        href="https://storage.to"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Visit storage.to
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </a>
      {externalLink ? (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {getDomainBadge(externalLink.fileUrl)}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-sm text-ink"
              title={externalLink.fileUrl}
            >
              {externalLink.fileUrl}
            </span>
            <a
              href={externalLink.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              Open
            </a>
            <button
              type="button"
              onClick={onremove}
              disabled={linkSaving || linkBusy}
              aria-label="Remove link"
              className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-error disabled:opacity-50"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              id="evidence-link-input"
              type="url"
              inputMode="url"
              placeholder="https://storage.to/... or https://drive.google.com/..."
              value={linkInput}
              onChange={(e) => oninput(e.target.value)}
              disabled={linkSaving || linkBusy}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onsave}
              disabled={linkSaving || linkBusy}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {linkSaving ? "Saving…" : "Update"}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex gap-2">
          <input
            id="evidence-link-input"
            type="url"
            inputMode="url"
            placeholder="https://storage.to/... or https://drive.google.com/..."
            value={linkInput}
            onChange={(e) => oninput(e.target.value)}
            disabled={linkSaving || linkBusy}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={onsave}
            disabled={linkSaving || linkBusy}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {linkSaving ? "Saving…" : "Add"}
          </button>
        </div>
      )}
      <div className="mt-3 rounded-lg border border-border bg-muted/5 px-3 py-2.5">
        <p className="text-xs font-semibold text-ink">
          How to share from storage.to:
        </p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-muted">
          <li>
            Upload your file at{" "}
            <a
              href="https://storage.to"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              storage.to
            </a>
          </li>
          <li>Copy the share link (https://storage.to/...)</li>
          <li>
            Ensure sharing is &quot;Anyone with the link&quot; and paste it here
          </li>
        </ol>
      </div>
      {linkError ? (
        <p className="mt-2 text-xs text-error" aria-live="polite">
          {linkError}
        </p>
      ) : null}
    </div>
  );
}
