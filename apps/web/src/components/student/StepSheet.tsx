import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion, rubberband } from "$lib/motion";

// ponytail: CSS transition replaces svelte/motion springs + manual rAF poll.
// Same visuals (bottom sheet mobile, side panel desktop, drag-down-to-close,
// Esc, focus trap + restore); spring physics resume only if motion regresses.
export default function StepSheet({
  open,
  label,
  chipLabel,
  chipClasses,
  onclose,
  children,
}: {
  open: boolean;
  label: string;
  chipLabel: string;
  chipClasses: string;
  onclose: () => void;
  children?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(false);

  // The close handlers are recreated every render; keep the latest one in a
  // ref so the keydown listener never calls a stale closure.
  const oncloseRef = useRef(onclose);
  useEffect(() => {
    oncloseRef.current = onclose;
  });

  const [dragOffset, setDragOffset] = useState(0);
  const drag = useRef<{
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (open) {
      const prev = document.activeElement as HTMLElement | null;
      if (prev && prev !== document.body) prevFocus.current = prev;
      setMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setShown(true);
          panelRef.current?.focus();
        }),
      );
    } else if (mounted) {
      setShown(false);
      const delay = prefersReducedMotion() ? 0 : 180;
      const t = setTimeout(() => {
        setMounted(false);
        prevFocus.current?.focus?.();
        prevFocus.current = null;
        oncloseRef.current();
      }, delay);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        oncloseRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current && !desktop) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !panelRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else if (
          document.activeElement === last ||
          !panelRef.current.contains(document.activeElement)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [mounted, desktop]);

  if (!mounted) return null;

  const reduce = prefersReducedMotion();
  const mobileStyle = reduce
    ? undefined
    : dragOffset !== 0
      ? { transform: `translateY(${dragOffset}px)`, transition: "none" }
      : {
          transform: shown ? "translateY(0)" : "translateY(100%)",
          transition: "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)",
        };

  return (
    <>
      <div
        className="modal-scrim fixed inset-0 z-50 lg:hidden"
        style={{
          background: "rgba(0, 0, 0, 0.08)",
          opacity: shown ? 1 : 0,
          transition: reduce ? undefined : "opacity 180ms ease-out",
        }}
        aria-hidden="true"
        onClick={onclose}
      />

      <div
        ref={panelRef}
        role={desktop ? "region" : "dialog"}
        aria-modal={desktop ? undefined : "true"}
        aria-label={label}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-2xl border-t border-border bg-surface-raised shadow-2xl outline-none lg:static lg:inset-auto lg:z-auto lg:mx-0 lg:h-full lg:max-h-none lg:max-w-none lg:w-full lg:rounded-2xl lg:border lg:shadow-xl"
        style={desktop ? undefined : mobileStyle}
        onPointerDown={(e) => {
          if (desktop) return;
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, textarea, select")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const now = performance.now();
          drag.current = {
            startY: e.clientY,
            lastY: e.clientY,
            lastT: now,
            velocity: 0,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const now = performance.now();
          const dy = e.clientY - d.startY;
          const dt = now - d.lastT;
          if (dt > 0) d.velocity = ((e.clientY - d.lastY) / dt) * 1000;
          d.lastY = e.clientY;
          d.lastT = now;
          setDragOffset(dy < 0 ? rubberband(dy, 400) : dy);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dy = dragOffset;
          setDragOffset(0);
          if (dy > 80 || (d.velocity > 600 && dy > 24)) onclose();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragOffset(0);
        }}
      >
        <div
          aria-hidden="true"
          className="flex shrink-0 justify-center pt-2 lg:hidden"
        >
          <span className="h-1 w-8 rounded-full bg-border" />
        </div>
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-1 lg:px-5 lg:pb-3 lg:pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-ink">
              {label}
            </h2>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chipClasses}`}
          >
            {chipLabel}
          </span>
          <button
            type="button"
            onClick={onclose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.93]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="apple-scrollbar sheet-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 lg:px-5">
          {children}
        </div>
      </div>
    </>
  );
}
