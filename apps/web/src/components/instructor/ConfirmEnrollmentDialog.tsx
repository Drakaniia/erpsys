import { useEffect, useRef } from "react";
import { PRE_ENROLLMENT_STEP_CODES, STEP_NAMES } from "$lib/domain/constants";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import type { QueueEntry } from "$lib/instructor/types";

export default function ConfirmEnrollmentDialog({
  open,
  entry,
  departmentName,
  semesterLabel,
  yearLabel,
  busy = false,
  onconfirm,
  onreturntoqueue,
  onmovetoend,
}: {
  open: boolean;
  entry: QueueEntry | null;
  departmentName: string;
  semesterLabel: string;
  yearLabel: string;
  busy?: boolean;
  onconfirm: () => void;
  onreturntoqueue: () => void;
  onmovetoend: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open && Boolean(entry), {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (!open || !entry) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onreturntoqueue });
    return () => trap.destroy();
  }, [open, entry, onreturntoqueue]);

  if (!presence.mounted || !entry) return null;

  const verified = entry.verifiedSteps >= 5;
  const checks = Math.min(5, Math.max(0, entry.verifiedSteps));
  const missingCount = 5 - checks;
  const missingNames = entry.missingStepNames ?? [];

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-enroll-title"
      onClick={onreturntoqueue}
      onKeyDown={(e) => {
        if (e.key === "Escape") onreturntoqueue();
      }}
    >
      <div
        ref={panelRef}
        style={presence.style}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-enroll-title"
          className="text-base font-semibold text-ink"
        >
          Confirm enrollment
        </h2>
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-medium text-ink">{entry.name}</p>
          <p className="text-muted tabular-nums">{entry.studentNumber}</p>
          <p className="text-muted">Department: {departmentName}</p>
          <p className="text-muted">
            Semester: {semesterLabel} {yearLabel}
          </p>
          <p
            className={`flex items-center gap-1.5 ${verified ? "text-ink" : "text-muted"}`}
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
                  />
                </svg>
              ))}
            </span>
            <span>
              {verified
                ? "All 5 steps verified"
                : missingNames.length > 0
                  ? `${checks}/5 verified — Missing: ${missingNames.join(", ")}`
                  : `${checks}/5 verified — ${missingCount} step${missingCount > 1 ? "s" : ""} missing`}
            </span>
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
        </div>
        {!verified ? (
          <p className="mt-2 text-xs text-muted" role="alert">
            All 5 prior steps must be verified before enrollment. SBO must
            verify remaining steps.
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">Enrollment is final.</p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onmovetoend}
            disabled={busy}
            className="press rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-50"
          >
            Not present — move to end
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onreturntoqueue}
              disabled={busy}
              className="press rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onconfirm}
              disabled={busy || !verified}
              aria-disabled={!verified}
              className="press rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Confirming…" : "Confirm Enrollment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
