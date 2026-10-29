import { useEffect, useRef } from "react";
import { usePresence } from "$lib/ui/use-presence";
import { dialogTrap } from "$lib/ui/dialog-trap";

export default function StillThereDialog({
  open,
  onhere,
  onclosequeue,
}: {
  open: boolean;
  onhere: () => void;
  onclosequeue: () => void;
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
    const trap = dialogTrap(panel, {});
    // Focus the safe answer — a reflex Enter must not close every queue.
    (panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel).focus();
    return () => trap.destroy();
  }, [open]);

  if (!presence.mounted) return null;

  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="still-there-title"
      aria-describedby="still-there-body"
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm rounded-2xl bg-surface-raised p-5 shadow-xl"
        style={presence.style}
        role="presentation"
        tabIndex={-1}
      >
        <h2 id="still-there-title" className="text-base font-semibold text-ink">
          Still there?
        </h2>
        <p id="still-there-body" className="mt-1 text-sm text-muted">
          Your queues close in 5 minutes if you don&apos;t respond. Students
          already queued stay in line and see the queue as closed until you
          reopen.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclosequeue}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
          >
            Close queue
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onhere}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97]"
          >
            I&apos;m here
          </button>
        </div>
      </div>
    </div>
  );
}
