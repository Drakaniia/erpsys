import { useEffect, useRef, useState } from "react";
import { relativeTime } from "$lib/officer/format";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";

const REASON_CHIPS = [
  "Wrong student",
  "COR not ready",
  "Details mismatch",
  "Duplicate enrollment",
  "Test enrollment",
] as const;
const REASON_MIN = 10;
const REASON_MAX = 500;

export default function RevertConfirmDialog({
  open,
  count = 1,
  student = null,
  departmentName,
  busy = false,
  onconfirm,
  onclose,
}: {
  open: boolean;
  count?: number;
  student?: {
    name: string;
    number?: string | null;
    completedAt: string;
    servedByName: string;
  } | null;
  departmentName: string;
  busy?: boolean;
  onconfirm: (reason: string) => void;
  onclose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (open) {
      setReason("");
      setSelectedChip(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);

  if (!presence.mounted) return null;

  const bulk = student === null;
  const reasonLen = reason.trim().length;
  const canSubmit = reasonLen >= REASON_MIN && reasonLen <= REASON_MAX && !busy;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="revert-dialog-title"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        style={presence.style}
        className="w-full max-w-md rounded-2xl bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="revert-dialog-title"
              className="text-base font-semibold text-ink"
            >
              {bulk
                ? `Revert ${count} enrollment${count === 1 ? "" : "s"}`
                : "Revert enrollment"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {bulk
                ? "Students will be returned to the queue at #1. This applies the same reason to all."
                : "Student will be returned to the queue at #1."}
            </p>
          </div>
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            aria-label="Close"
            className="mt-0.5 shrink-0 rounded-lg p-1 text-muted hover:text-ink disabled:opacity-50"
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
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm space-y-1">
          {bulk ? (
            <>
              <p className="font-medium text-ink">
                {count} student{count === 1 ? "" : "s"} selected
              </p>
              <p className="text-muted">Department: {departmentName}</p>
            </>
          ) : student ? (
            <>
              <p className="font-medium text-ink">{student.name}</p>
              {student.number && (
                <p className="text-muted tabular-nums">{student.number}</p>
              )}
              <p className="text-muted">Department: {departmentName}</p>
              <p className="text-muted">
                Enrolled {relativeTime(student.completedAt)} by{" "}
                <span className="text-ink">{student.servedByName}</span>
              </p>
            </>
          ) : null}
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted uppercase tracking-wide">
            Reason
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Reason presets"
          >
            {REASON_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setSelectedChip(chip);
                  setReason(chip);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${selectedChip === chip ? "border-error bg-error/10 text-error font-medium" : "border-border text-muted hover:border-muted hover:text-ink"}`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            rows={3}
            maxLength={REASON_MAX}
            placeholder={
              bulk
                ? "Describe the reason for reverting these enrollments…"
                : "Describe the reason for reverting this enrollment…"
            }
            disabled={busy}
            aria-label={
              bulk ? "Reason for bulk revert" : "Reason for reverting"
            }
            aria-required="true"
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          />
          <div className="mt-1 flex items-center justify-between">
            <p
              className={`text-xs ${reasonLen < REASON_MIN && reasonLen > 0 ? "text-error" : "text-muted"}`}
            >
              {reasonLen === 0
                ? `Minimum ${REASON_MIN} characters required`
                : reasonLen < REASON_MIN
                  ? `${REASON_MIN - reasonLen} more characters needed`
                  : `${reasonLen}/${REASON_MAX}`}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="press rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onconfirm(reason.trim())}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className="press rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? "Reverting…"
              : bulk
                ? `Revert ${count}`
                : "Revert enrollment"}
          </button>
        </div>
      </div>
    </div>
  );
}
