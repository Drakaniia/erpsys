import { useEffect, useRef } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";

export default function RoleChangeDialog({
  open,
  role,
  names,
  excludedCount = 0,
  busy = false,
  onconfirm,
  onclose,
}: {
  open: boolean;
  role: "SBO_OFFICER" | "STUDENT";
  names: string[];
  excludedCount?: number;
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
  const title =
    role === "SBO_OFFICER"
      ? isBulk
        ? `Promote ${names.length} students to SBO Officer?`
        : `Promote ${names[0] ?? "this student"} to SBO Officer?`
      : isBulk
        ? `Demote ${names.length} students to Student?`
        : `Demote ${names[0] ?? "this student"} to Student?`;
  const body =
    role === "SBO_OFFICER"
      ? "This grants access to student verification data (evidence, stamps, mugshots)."
      : "Officer access is removed. Their past stamps remain attributed to them in the audit trail.";

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-dialog-title"
      aria-describedby="role-dialog-body"
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
        <h2 id="role-dialog-title" className="text-base font-semibold text-ink">
          {title}
        </h2>
        <p id="role-dialog-body" className="mt-1 text-sm text-muted">
          {body}
        </p>
        {isBulk && excludedCount > 0 && (
          <p className="mt-2 text-xs text-muted">
            {excludedCount} row{excludedCount === 1 ? "" : "s"} skipped (self or
            non-lever roles).
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
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Working…" : role === "SBO_OFFICER" ? "Promote" : "Demote"}
          </button>
        </div>
      </div>
    </div>
  );
}
