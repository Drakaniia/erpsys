import { useEffect, useMemo, useRef } from "react";
import { absoluteTime, relativeTime } from "$lib/officer/format";
import { usePresence } from "$lib/ui/use-presence";
import {
  STEP_STATE_LABELS,
  STEP_STATE_TONES,
  departmentLevelTag,
  queueLabel,
  type StudentStepState,
} from "$lib/instructor/students";
import type {
  StudentDetailData,
  StudentDetailStep,
} from "$lib/instructor/types";

// ponytail: sheet slide spring dropped — settled DOM identical.
export default function StudentDetailDrawer({
  open,
  loading = false,
  detail = null,
  error = null,
  busy = false,
  onclose,
  onremind,
}: {
  open: boolean;
  loading?: boolean;
  detail?: StudentDetailData | null;
  error?: string | null;
  busy?: boolean;
  onclose: () => void;
  onremind: (studentProfileId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (!open) return;
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        "[data-drawer-initial-focus]",
      );
      (first ?? panelRef.current)?.focus();
    });
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onclose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeydown);
      restoreFocusTo?.focus();
    };
  }, [open, onclose]);

  const steps = useMemo(
    () =>
      ((detail?.steps ?? []) as any[])
        .slice()
        .sort((a, b) => a.order - b.order),
    [detail],
  );

  function stepTiming(step: StudentDetailStep): string {
    if (step.status === "VERIFIED" && step.verifiedAt) {
      const who = step.verifiedByName ? ` by ${step.verifiedByName}` : "";
      return `Verified ${relativeTime(step.verifiedAt)}${who}`;
    }
    if (step.status === "SUBMITTED" && step.submittedAt)
      return `Submitted ${relativeTime(step.submittedAt)}`;
    if (step.status === "RETURNED" && step.respondedAt) {
      const who = step.respondedByName ? ` by ${step.respondedByName}` : "";
      return `Returned ${relativeTime(step.respondedAt)}${who}`;
    }
    if (step.status === "PENDING" && step.submittedAt)
      return `Submitted ${relativeTime(step.submittedAt)}`;
    return "Not started";
  }

  function stepAbsolute(step: StudentDetailStep): string | undefined {
    const iso = step.verifiedAt ?? step.respondedAt ?? step.submittedAt;
    return iso ? absoluteTime(iso) : undefined;
  }

  if (!presence.mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="presentation"
      style={presence.style}
    >
      <button
        type="button"
        aria-label="Close student details"
        onClick={onclose}
        className="absolute inset-0 cursor-default bg-ink/20 backdrop-blur-[1px]"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          detail ? `${detail.student.studentName} details` : "Student details"
        }
        tabIndex={-1}
        className="drawer-panel relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {detail ? (
              <>
                <h2 className="truncate text-base font-semibold tracking-tight text-ink">
                  {detail.student.studentName}
                </h2>
                <p className="truncate text-sm tabular-nums text-muted">
                  {detail.student.studentNumber ?? "No student number"}
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  {detail.enrollment ? (
                    <>
                      {departmentLevelTag(
                        detail.enrollment.departmentCode,
                        detail.enrollment.yearLevel,
                      )}{" "}
                      — {detail.enrollment.departmentName}
                    </>
                  ) : (
                    <span className="italic">
                      Unassigned — no course record for this year
                    </span>
                  )}
                </p>
                {detail.year && (
                  <p className="mt-0.5 text-xs text-muted tabular-nums">
                    AY {detail.year.label} · {detail.year.semesterLabel}
                  </p>
                )}
              </>
            ) : (
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Student details
              </h2>
            )}
          </div>
          <button
            type="button"
            data-drawer-initial-focus
            onClick={onclose}
            aria-label="Close"
            className="press -mr-1 -mt-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !detail ? (
            <ul className="space-y-2" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <li
                  key={i}
                  className="skeleton h-12 w-full rounded-xl"
                  style={{ "--skeleton-i": i } as React.CSSProperties}
                />
              ))}
            </ul>
          ) : error ? (
            <div className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-ink">
              {error}
            </div>
          ) : detail ? (
            <>
              <p className="mb-3 text-xs text-muted">
                {detail.pendingRequirements === 0
                  ? "All requirements verified."
                  : `${detail.pendingRequirements} of ${detail.steps.length} requirements pending.`}
              </p>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                Requirements
              </h3>
              <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border">
                {steps.map((step) => (
                  <li
                    key={step.code}
                    className="flex items-start justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{step.name}</p>
                      <p
                        className="truncate text-xs text-muted"
                        title={stepAbsolute(step)}
                      >
                        {stepTiming(step)}
                      </p>
                      {step.status === "RETURNED" && step.replyNote && (
                        <p className="mt-1 rounded-lg bg-error/5 px-2 py-1 text-xs text-ink">
                          {step.replyNote}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STEP_STATE_TONES[step.status as StudentStepState]}`}
                    >
                      {STEP_STATE_LABELS[step.status as StudentStepState]}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">
                Queue
              </h3>
              <div className="mt-2 rounded-xl border border-border px-3 py-2.5 text-sm">
                {detail.queue ? (
                  <>
                    <p className="text-ink">
                      {detail.queue.departmentCode} —{" "}
                      {detail.queue.departmentName}
                      <span className="ml-1 text-muted">
                        · {queueLabel(detail.queue.status)}
                      </span>
                    </p>
                    <dl className="mt-1 space-y-0.5 text-xs text-muted">
                      {detail.queue.joinedAt && (
                        <div className="flex justify-between gap-3">
                          <dt>Joined</dt>
                          <dd>{absoluteTime(detail.queue.joinedAt)}</dd>
                        </div>
                      )}
                      {detail.queue.servedAt && (
                        <div className="flex justify-between gap-3">
                          <dt>Served</dt>
                          <dd>{absoluteTime(detail.queue.servedAt)}</dd>
                        </div>
                      )}
                      {detail.queue.completedAt && (
                        <div className="flex justify-between gap-3">
                          <dt>Completed</dt>
                          <dd>{absoluteTime(detail.queue.completedAt)}</dd>
                        </div>
                      )}
                    </dl>
                  </>
                ) : (
                  <p className="text-muted">
                    Not in a queue for this academic year.
                  </p>
                )}
              </div>
              <p className="mt-5 text-xs text-muted/80">
                Evidence and uploads are reviewed in the SBO officer console.
              </p>
            </>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onclose}
            className="press rounded-xl px-3 py-1.5 text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!detail || busy}
            onClick={() => detail && onremind(detail.student.studentProfileId)}
            className="press rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Remind"}
          </button>
        </footer>
      </div>
    </div>
  );
}
