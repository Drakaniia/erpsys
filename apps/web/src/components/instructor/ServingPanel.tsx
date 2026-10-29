import { PRE_ENROLLMENT_STEP_CODES, STEP_NAMES } from "$lib/domain/constants";
import { initials, relativeTime } from "$lib/officer/format";
import type { QueueEntry } from "$lib/instructor/types";

// ponytail: entry slide-in spring dropped — settled DOM identical.
export default function ServingPanel({
  entry,
  myAdviserId = "",
  busy = false,
  onvalidate,
  onreturntoqueue,
  onmovetoend,
}: {
  entry: QueueEntry | null;
  myAdviserId?: string;
  busy?: boolean;
  onvalidate: () => void;
  onreturntoqueue: () => void;
  onmovetoend: () => void;
}) {
  const isServing = entry !== null;
  const iMyLock = isServing && entry!.servedById === myAdviserId;
  const verified = entry ? entry.verifiedSteps >= 5 : false;
  const checks = entry ? Math.min(5, Math.max(0, entry.verifiedSteps)) : 0;
  const missingCount = entry ? 5 - checks : 0;
  const missingNames = entry?.missingStepNames ?? [];
  const missingLabel =
    missingCount === 0
      ? "All 5 steps verified"
      : missingNames.length > 0
        ? `${checks}/5 verified — Missing: ${missingNames.join(", ")}`
        : `${checks}/5 verified — ${missingCount} step${missingCount > 1 ? "s" : ""} missing`;

  return (
    <section
      aria-label={isServing ? "Now serving" : "No student being served"}
      className="flex h-full flex-col rounded-2xl border border-border bg-surface-raised p-5 shadow-sm"
    >
      {isServing && entry ? (
        <>
          <p
            className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${iMyLock ? "text-primary" : "text-muted"}`}
          >
            {iMyLock ? (
              <>
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
                Now serving
              </>
            ) : (
              "Being served by colleague"
            )}
          </p>
          <div className="flex-1" key={entry.entryId}>
            <div className="mt-3 flex items-start gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-white"
                aria-hidden="true"
              >
                {initials(entry.name)}
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-medium tracking-tight text-ink">
                  {entry.name}
                </h2>
                <p className="mt-0.5 text-sm text-muted tabular-nums">
                  {entry.studentNumber}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Joined {relativeTime(entry.joinedAt)}
                </p>
              </div>
            </div>
            <p
              className={`mt-4 flex items-center gap-1.5 text-sm ${verified ? "text-ink" : "text-warning"}`}
            >
              <span aria-hidden="true" className="flex items-center gap-1">
                {Array.from({ length: checks }, (_, i) => (
                  <svg
                    key={`c-${i}`}
                    viewBox="0 0 12 12"
                    className="h-3 w-3 text-primary"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 6.5 4.5 9 10 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ))}
                {Array.from({ length: missingCount }, (_, i) => (
                  <svg
                    key={`m-${i}`}
                    viewBox="0 0 12 12"
                    className="h-3 w-3 text-muted"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ))}
              </span>
              <span>{missingLabel}</span>
            </p>
            {!verified && missingNames.length > 0 && (
              <div
                className="mt-2 flex flex-wrap gap-1.5"
                role="list"
                aria-label="Missing steps"
              >
                {PRE_ENROLLMENT_STEP_CODES.map((code) => {
                  const name = STEP_NAMES[code];
                  const isMissing = missingNames.includes(name);
                  return (
                    <span
                      key={code}
                      role="listitem"
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${isMissing ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface text-muted"}`}
                    >
                      <span aria-hidden="true">{isMissing ? "✗" : "✓"}</span>
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
            {!iMyLock && (
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                Being served by{" "}
                <span className="font-medium text-ink">
                  {entry.servedByName ?? "another adviser"}
                </span>
              </p>
            )}
            {iMyLock && (
              <div className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={onvalidate}
                  disabled={busy || !verified}
                  aria-disabled={!verified}
                  className="press h-12 w-full rounded-xl bg-primary px-6 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "Processing…" : "Validate"}
                </button>
                {!verified && (
                  <p
                    className="text-xs text-muted"
                    role="status"
                    aria-live="polite"
                  >
                    All 5 prior steps must be verified before enrollment. SBO
                    must verify remaining steps first.
                  </p>
                )}
                <div className="flex items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={onreturntoqueue}
                    disabled={busy}
                    className="text-sm text-muted hover:text-ink disabled:opacity-60"
                  >
                    Return to queue
                  </button>
                  <button
                    type="button"
                    onClick={onmovetoend}
                    disabled={busy}
                    className="text-sm text-muted hover:text-ink disabled:opacity-60"
                  >
                    Not present — move to end
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <svg
            className="mb-3 h-10 w-10 text-muted/30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-sm font-medium text-muted">
            No student being served
          </p>
          <p className="mt-1 text-xs text-muted/60">
            Click &quot;Serve&quot; on a student in the queue to begin
          </p>
        </div>
      )}
    </section>
  );
}
