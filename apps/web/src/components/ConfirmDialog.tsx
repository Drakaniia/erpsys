import { useEffect, useRef, type ReactNode } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  destructive = false,
  warning = false,
  busy = false,
  onconfirm,
  onclose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  warning?: boolean;
  busy?: boolean;
  onconfirm: () => void;
  onclose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);

  if (!presence.mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={body ? "confirm-dialog-body" : undefined}
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        style={presence.style}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-ink"
        >
          {title}
        </h2>
        {body ? (
          <p id="confirm-dialog-body" className="mt-1 text-sm text-muted">
            {body}
          </p>
        ) : null}
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
            className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              destructive
                ? "bg-error text-white"
                : warning
                  ? "bg-warning text-white"
                  : "bg-primary text-white"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
