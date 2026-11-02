import { initials, relativeTime } from "$lib/officer/format";
import { YEAR_LEVEL_LABELS } from "$lib/domain/constants";
import type { QueueEntry } from "$lib/instructor/types";

// ponytail: row slide-in + position-pop springs dropped — settled DOM identical.
export default function WaitingRow({
  entry,
  position,
  selected = false,
  canServe = false,
  busy = false,
  deptOpen = true,
  onserve,
  onremove,
  removing = false,
}: {
  entry: QueueEntry;
  position: number;
  selected?: boolean;
  canServe?: boolean;
  busy?: boolean;
  deptOpen?: boolean;
  onserve?: () => void;
  onremove?: (entry: QueueEntry) => void;
  removing?: boolean;
}) {
  const locked = entry.locked === true;

  return (
    <div
      aria-current={selected ? "true" : undefined}
      className={`group flex min-h-[52px] items-center gap-3 px-4 ${selected ? "bg-surface/60" : ""} ${locked ? "bg-surface/30" : ""}`}
    >
      <span
        className={`w-8 shrink-0 text-sm tabular-nums ${position <= 5 ? "font-medium text-muted" : "text-muted/60"}`}
        aria-hidden="true"
      >
        <span className="inline-block">#{position}</span>
      </span>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/20 text-xs font-semibold text-muted"
        aria-hidden="true"
      >
        {initials(entry.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-sm ${locked ? "text-muted" : "text-ink/70"}`}
        >
          {entry.name}
        </span>
        <span className="truncate text-xs text-muted/70 tabular-nums">
          {entry.studentNumber}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${locked ? "border-dashed border-border/70 text-muted/70" : "border-border/70 text-muted"}`}
        title={locked ? "Outside the year levels assigned to you" : undefined}
      >
        {entry.yearLevel
          ? YEAR_LEVEL_LABELS[entry.yearLevel as keyof typeof YEAR_LEVEL_LABELS]
          : "No level"}
      </span>
      <span className="shrink-0 text-xs text-muted/60 tabular-nums">
        Joined {relativeTime(entry.joinedAt)}
      </span>
      {locked ? (
        <span
          className="shrink-0 cursor-not-allowed rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted/70"
          title="Outside the year levels assigned to you in this department"
          role="button"
          aria-disabled="true"
        >
          Not your level
        </span>
      ) : position === 1 && canServe && deptOpen ? (
        <button
          type="button"
          onClick={onserve}
          disabled={busy}
          aria-busy={busy ? "true" : undefined}
          className="press inline-flex min-w-[5.25rem] shrink-0 items-center justify-center rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-[transform,background-color] duration-100 ease-out hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Starting…" : "Serve"}
        </button>
      ) : position === 1 && !deptOpen ? (
        <span
          className="shrink-0 cursor-not-allowed rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white opacity-50"
          title="Open the queue to serve students"
          role="button"
          aria-disabled="true"
        >
          Serve
        </span>
      ) : position === 1 ? (
        <span
          className="shrink-0 rounded px-2 py-1 text-xs text-muted/50"
          aria-hidden="true"
        >
          Locked
        </span>
      ) : null}
      {onremove && !locked && (
        <button
          type="button"
          onClick={() => onremove?.(entry)}
          disabled={removing || busy}
          aria-label={`Remove ${entry.name} from queue`}
          className="press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-[transform,background-color,color] duration-100 ease-out hover:bg-error/10 hover:text-error active:scale-[0.97] disabled:opacity-40"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          <span>{removing ? "Removing…" : "Remove"}</span>
        </button>
      )}
    </div>
  );
}
