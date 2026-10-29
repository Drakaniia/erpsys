import { useEffect, useRef } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";

export default function DeleteAccountDialog({
  open,
  names,
  excludedCount = 0,
  adviserNote = false,
  busy = false,
  onconfirm,
  onclose,
}: {
  open: boolean;
  names: string[];
  excludedCount?: number;
  adviserNote?: boolean;
  busy?: boolean;
  onconfirm: () => void;
  onclose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);

  if (!open) return null;

  const isBulk = names.length > 1;
  const title = isBulk
    ? `Delete ${names.length} accounts?`
    : `Delete ${names[0] ?? "this account"}?`;
  const body = isBulk
    ? "Accounts without any records will be permanently removed; accounts with records will be disabled and can no longer sign in (their records are preserved)."
    : `If ${names[0] ?? "this account"} has no records, the account will be permanently removed. If they have records, the account will be disabled — ${names[0] ?? "they"} can no longer sign in, and their records are preserved until you permanently delete them later.`;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-body"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-dialog-title"
          className="text-base font-semibold text-ink"
        >
          {title}
        </h2>
        <p id="delete-dialog-body" className="mt-1 text-sm text-muted">
          {body}
        </p>
        {adviserNote && (
          <p className="mt-2 text-xs text-muted">
            This adviser's mapping and availability are removed. Adviser
            accounts that sign in with Google will re-materialize on their next
            sign-in — blocking is the durable control.
          </p>
        )}
        {isBulk && excludedCount > 0 && (
          <p className="mt-2 text-xs text-muted">
            {excludedCount} row{excludedCount === 1 ? "" : "s"} excluded (admin
            or blocked accounts).
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onconfirm}
            disabled={busy}
            className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Working…" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
