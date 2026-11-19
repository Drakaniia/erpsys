/** PDF rows render a file-chip, never an <img>. */
export default function FileChip({
  name,
  href,
  compact = false,
}: {
  name?: string | null;
  href?: string | null;
  compact?: boolean;
}) {
  const label = name || "Document.pdf";
  const body = (
    <>
      <svg
        width={compact ? 14 : 18}
        height={compact ? 14 : 18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 text-error/70"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span
        className={`min-w-0 flex-1 truncate font-medium text-ink ${compact ? "text-xs" : "text-sm"}`}
        title={label}
      >
        {label}
      </span>
      <span className="shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error">
        PDF
      </span>
    </>
  );
  const cls = `flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 ${compact ? "py-1.5" : "py-2.5"}`;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      aria-label={`Open ${label}`}
    >
      {body}
    </a>
  ) : (
    <div className={cls} aria-label={label}>
      {body}
    </div>
  );
}
