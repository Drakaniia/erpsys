import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "$lib/ui/use-presence";
import { dialogTrap } from "$lib/ui/dialog-trap";

export default function AccountLinkDialog({
  open,
  email,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  email: string;
  onConfirm: () => void;
  onCancel: () => void;
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
    const trap = dialogTrap(panel, { onEscape: onCancel });
    return () => trap.destroy();
  }, [open, onCancel]);

  if (!presence.mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-dialog-title"
      aria-describedby="link-dialog-body"
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-transparent"
        aria-label="Close dialog"
        onClick={onCancel}
      />

      <div
        ref={panelRef}
        role="presentation"
        style={presence.style}
        className="relative w-full max-w-[400px] rounded-xl border border-auth-border bg-surface-raised p-6 shadow-[0_8px_24px_rgba(16,24,40,0.12),0_1px_2px_rgba(16,24,40,0.08)] outline-none"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent chip */}
        <span className="inline-flex items-center rounded-full bg-gold/15 px-3 py-0.5 text-xs font-semibold tracking-wide text-[#9a6700] uppercase">
          Link Account
        </span>

        <h2
          id="link-dialog-title"
          className="mt-3 text-lg font-semibold tracking-[-0.02em] text-ink"
        >
          Link Google Account?
        </h2>
        <p id="link-dialog-body" className="mt-1 text-sm leading-6 text-muted">
          An account with <strong className="text-ink">{email}</strong> already
          exists. Would you like to link your Google account to it?
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="press order-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:text-ink sm:order-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="press order-1 rounded-lg bg-auth-blue px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97] sm:order-2"
          >
            Link Account
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
