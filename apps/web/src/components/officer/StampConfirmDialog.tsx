import { useEffect, useRef } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import Stamp from "../ui/Stamp";

export default function StampConfirmDialog({
  open,
  stampName,
  stampGraphicUrl,
  stampSignatureUrl,
  dateLabel,
  onconfirm,
  oncancel,
  busy,
}: {
  open: boolean;
  stampName: string;
  stampGraphicUrl: string | null;
  stampSignatureUrl: string | null;
  dateLabel: string;
  onconfirm: () => void;
  oncancel: () => void;
  busy: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const panel = cardRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: oncancel });
    return () => trap.destroy();
  }, [open, oncancel]);
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
        aria-labelledby="stamp-dialog-title"
        tabIndex={-1}
        style={presence.style}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-xl outline-none"
      >
        <h2
          id="stamp-dialog-title"
          className="text-lg font-semibold tracking-tight"
        >
          Stamp as verified
        </h2>
        <p className="mt-1 text-sm text-muted">
          The stamp will appear exactly like this:
        </p>
        <div className="mt-4 flex items-center justify-center py-2">
          <Stamp>
            <div className="relative flex h-full select-none flex-col items-center justify-center text-center">
              <p className="text-lg font-bold uppercase tracking-[0.25em] text-primary/80">
                Verified
              </p>
              <div className="relative mt-2 flex items-center justify-center">
                {stampGraphicUrl && (
                  <img
                    src={stampGraphicUrl}
                    alt=""
                    className="h-12 w-12 object-contain opacity-75"
                    style={{ mixBlendMode: "multiply" }}
                  />
                )}
                <div className="mx-2 text-center">
                  <p className="text-sm font-semibold text-primary">
                    {stampName}
                  </p>
                  <p className="text-xs tabular-nums text-primary/70">
                    {dateLabel}
                  </p>
                </div>
              </div>
              {stampSignatureUrl && (
                <img
                  src={stampSignatureUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 m-auto h-16 w-32 object-contain opacity-70"
                  style={{
                    mixBlendMode: "multiply",
                    transform: "rotate(-12deg)",
                  }}
                />
              )}
            </div>
          </Stamp>
        </div>
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
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onconfirm}
            disabled={busy}
          >
            {busy ? "Stamping…" : "Stamp"}
          </button>
        </div>
      </div>
    </div>
  );
}
