import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { useSpring } from "$lib/ui/use-spring";
import { usePresence } from "$lib/ui/use-presence";

export default function SignOutConfirm({
  open,
  snapshot,
  busy = false,
  checking: _checking = false,
  onclose,
  onexecute,
}: {
  open: boolean;
  snapshot: {
    code: string;
    name: string;
    myOpen: boolean;
    waitingCount: number;
    servingName: string | null;
    servingNumber: string | null;
  };
  busy?: boolean;
  checking?: boolean;
  onclose: () => void;
  onexecute: () => void;
}) {
  const [reduced, setReduced] = useState(false);
  const [panelIn, setPanelIn] = useSpring(0, UI_SPRING);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open && Boolean(snapshot), {
    fade: true,
    duration: 180,
    outDuration: 180,
  });

  useEffect(() => {
    if (!open) return;
    setReduced(prefersReducedMotion());
    setPanelIn(0, true);
    const raf = requestAnimationFrame(() => setPanelIn(1));
    return () => cancelAnimationFrame(raf);
  }, [open, setPanelIn]);

  useEffect(() => {
    if (!open || !snapshot) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onclose });
    return () => trap.destroy();
  }, [open, snapshot, onclose]);

  const panelStyle = reduced
    ? { opacity: panelIn }
    : { opacity: panelIn, transform: `scale(${0.96 + 0.04 * panelIn})` };

  if (!presence.mounted || !snapshot) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      tabIndex={-1}
      style={{ background: "rgba(0, 0, 0, 0.08)", ...presence.style }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signout-confirm-title"
      onClick={onclose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onclose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[420px] rounded-2xl border border-border bg-surface-raised p-5 shadow-[0_16px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]"
        style={panelStyle}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
            aria-hidden="true"
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
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="signout-confirm-title"
              className="text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink"
            >
              Sign out from {snapshot.code}?
            </h2>
            <p className="mt-1 text-xs leading-5 tracking-[0.01em] text-muted">
              You&apos;re still assigned to{" "}
              <span className="font-medium text-ink">
                {snapshot.name} ({snapshot.code})
              </span>
              . Signing out unassigns you from it.
            </p>
          </div>
        </div>

        <ul className="mt-4 flex flex-col gap-2.5 rounded-xl border border-border bg-surface px-3 py-3">
          {snapshot.myOpen ? (
            <li className="flex gap-2.5 text-xs leading-5">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                aria-hidden="true"
              />
              <span className="text-ink/80">
                <span className="font-medium text-ink">
                  Accepting students is ON
                </span>{" "}
                — it will close on sign out. Students stay queued; a colleague
                must reopen to keep intake open.
              </span>
            </li>
          ) : (
            <li className="flex gap-2.5 text-xs leading-5">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink/25"
                aria-hidden="true"
              />
              <span className="text-muted">
                Accepting is currently off — no availability change on sign out.
              </span>
            </li>
          )}
          {snapshot.waitingCount > 0 ? (
            <li className="flex gap-2.5 text-xs leading-5">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                aria-hidden="true"
              />
              <span className="text-ink/80">
                <span className="font-medium text-ink">
                  {snapshot.waitingCount} student
                  {snapshot.waitingCount === 1 ? "" : "s"} waiting
                </span>{" "}
                in {snapshot.code} — queue is not cleared on sign out;
                they&apos;ll remain until served or the queue is managed.
              </span>
            </li>
          ) : null}
          {snapshot.servingName ? (
            <li className="flex gap-2.5 text-xs leading-5">
              <span
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-error"
                aria-hidden="true"
              />
              <span className="text-ink/80">
                <span className="font-medium text-error">
                  Serving {snapshot.servingName}
                  {snapshot.servingNumber
                    ? ` (${snapshot.servingNumber})`
                    : ""}{" "}
                  — IN_PROGRESS
                </span>{" "}
                stays locked to you. Sign out won&apos;t complete them; finish
                or return them first if you can.
              </span>
            </li>
          ) : null}
        </ul>

        <p className="mt-3 text-[11px] leading-4 tracking-[0.01em] text-muted">
          Signing out unassigns you and closes intake. Students already queued
          stay in line until served or the queue is managed.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={onexecute}
            disabled={busy}
            className="rounded-lg bg-warning px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
