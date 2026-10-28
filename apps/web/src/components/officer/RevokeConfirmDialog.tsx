import { useEffect, useRef } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";

function useDialogFocus(open: boolean, onclose: () => void) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const panel = cardRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);
  return cardRef;
}

export default function RevokeConfirmDialog({
  open,
  studentName,
  onconfirm,
  oncancel,
  busy,
}: {
  open: boolean;
  studentName: string;
  onconfirm: () => void;
  oncancel: () => void;
  busy: boolean;
}) {
  const cardRef = useDialogFocus(open, oncancel);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });
  if (!presence.mounted) return null;
  return (
    <div
      className="modal-scrim fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
    >
      <div
        className="absolute inset-0"
        onClick={oncancel}
        aria-hidden="true"
      ></div>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-dialog-title"
        tabIndex={-1}
        style={presence.style}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-xl outline-none"
      >
        <h2
          id="revoke-dialog-title"
          className="text-lg font-semibold tracking-tight"
        >
          Revoke stamp for {studentName}?
        </h2>
        <p className="mt-2 text-sm text-muted">
          The submission returns to unverified and the revocation is recorded in
          the audit trail (who and when). This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-ink disabled:opacity-50"
            onClick={oncancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-1.5 text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-50"
            onClick={onconfirm}
            disabled={busy}
          >
            {busy ? "Revoking…" : "Revoke"}
          </button>
        </div>
      </div>
    </div>
  );
}
