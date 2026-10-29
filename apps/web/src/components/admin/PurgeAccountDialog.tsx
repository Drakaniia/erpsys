import { useEffect, useRef, useState } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";

export default function PurgeAccountDialog({
  open,
  name,
  busy = false,
  onconfirm,
  onclose,
}: {
  open: boolean;
  name: string;
  busy?: boolean;
  onconfirm: () => void;
  onclose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped(""); // fresh confirm every open
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);

  if (!open) return null;

  const matches = typed.trim().toLowerCase() === name.toLowerCase();

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="purge-dialog-title"
      aria-describedby="purge-dialog-body"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl border border-error/30 bg-surface-raised p-5 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="purge-dialog-title"
          className="text-base font-semibold text-error"
        >
          Permanently delete {name}?
        </h2>
        <p id="purge-dialog-body" className="mt-1 text-sm text-muted">
          This will wipe all of their records — including verifications and
          stamps they issued on other students' profiles. This cannot be undone.
        </p>
        <label
          className="mt-4 block text-xs font-medium text-muted"
          htmlFor="purge-confirm-input"
        >
          Type the account name to confirm
        </label>
        <input
          id="purge-confirm-input"
          value={typed}
          onChange={(e) => setTyped(e.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-[border-color] duration-100 ease-out focus:border-primary"
          placeholder={name}
        />
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
            disabled={busy || !matches}
            title={matches ? undefined : "Type the account name to enable"}
            className="rounded-lg bg-error px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-40"
          >
            {busy ? "Working…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
