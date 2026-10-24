import { useEffect, useRef, type ReactNode } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import "./ModalShell.css";

export default function ModalShell({
  open,
  labelledby,
  describedby,
  anchorRect = null,
  onclose,
  /** Dialog heading. */
  title,
  subtitle = "",
  /** `lg` is for content that needs room, such as a document preview. */
  size = "md",
  children,
  footer,
}: {
  open: boolean;
  labelledby: string;
  describedby?: string;
  anchorRect?: DOMRect | null;
  onclose: () => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrim = usePresence(open, {
    fade: true,
    duration: 180,
    outDuration: 160,
    easing: "cubicOut",
  });
  const panel = usePresence(open, {
    scale: 0.96,
    fade: true,
    duration: 280,
    outDuration: 180,
    easing: "cubicOut",
  });

  useEffect(() => {
    if (!open) return;
    const panelEl = panelRef.current;
    if (!panelEl) return;
    const trap = dialogTrap(panelEl, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, onclose]);

  const transformOrigin = (() => {
    if (!anchorRect) return "50% 20%";
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = ((anchorRect.left + anchorRect.width / 2) / vw) * 100;
    const y = ((anchorRect.top + anchorRect.height / 2) / vh) * 100;
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  })();

  if (!panel.mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledby}
      aria-describedby={describedby}
      tabIndex={-1}
      onClick={onclose}
      style={scrim.style}
    >
      <div
        className="modal-scrim absolute inset-0 bg-black/25 backdrop-blur-[12px] backdrop-saturate-150"
        aria-hidden="true"
        style={scrim.style}
      />

      <div
        ref={panelRef}
        className={`modal-panel relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/85 shadow-[0_16px_48px_rgba(0,0,0,0.16),0_1px_0_rgba(255,255,255,0.6)_inset] backdrop-blur-[20px] backdrop-saturate-180 ${
          size === "lg"
            ? "max-h-[calc(100dvh-2rem)] max-w-[860px]"
            : "max-w-[440px]"
        }`}
        style={{ ...panel.style, transformOrigin }}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <h2
              id={labelledby}
              className="text-[15px] font-semibold tracking-[-0.02em] text-ink"
            >
              {title}
            </h2>
            {subtitle ? (
              <p
                id={describedby}
                className="mt-0.5 truncate text-sm text-muted"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onclose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-[transform,background-color,color] duration-100 ease-out hover:bg-ink/[0.06] hover:text-ink active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}
