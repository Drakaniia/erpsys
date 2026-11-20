import { useEffect, useRef, type ReactNode } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";

export default function ReactivateAccountDialog({
  open,
  name,
  busy = false,
  confirmDisabled = false,
  children,
  onconfirm,
  onclose,
}: {
  open: boolean;
  name: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
  onconfirm: () => void;
  onclose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const trap = dialogTrap(panelRef.current, {
      onEscape: () => {
        if (!busy) onclose();
      },
    });
    return () => trap.destroy();
  }, [open, busy, onclose]);

  if (!open) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-dialog-title"
      aria-describedby="reactivate-dialog-body"
      onClick={() => {
        if (!busy) onclose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="reactivate-dialog-title"
          className="text-base font-semibold text-ink"
        >
          Reactivate {name}?
        </h2>
        <p id="reactivate-dialog-body" className="mt-1 text-sm text-muted">
          This restores sign-in access with the account’s existing role and
          keeps its linked records. The user must sign in again. Canceled queue
          entries and removed calendar data will not be restored.
        </p>
        {children}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onconfirm}
            disabled={busy || confirmDisabled}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Reactivating…" : "Reactivate account"}
          </button>
        </div>
      </div>
    </div>
  );
}
