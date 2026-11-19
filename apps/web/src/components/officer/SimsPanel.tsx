import { useEffect, useRef, useState } from "react";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { SIMS_TITLE, SIMS_URL } from "$lib/officer/sims";

const iconBtn =
  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export default function SimsPanel({ hidden = false }: { hidden?: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (hidden) setFullscreen(false);
  }, [hidden]);

  useEffect(() => {
    if (!fullscreen || !panelRef.current) return;
    const trap = dialogTrap(panelRef.current, {
      onEscape: () => setFullscreen(false),
      onKey: (event) => {
        event.stopPropagation();
        return false;
      },
    });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      trap.destroy();
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${SIMS_TITLE} balance check`}
      {...(fullscreen ? { role: "dialog", "aria-modal": true } : {})}
      aria-hidden={hidden || undefined}
      className={
        hidden
          ? "hidden"
          : fullscreen
            ? "fixed inset-0 z-[60] flex flex-col bg-surface"
            : "flex h-[calc(100vh-220px)] min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-white xl:sticky xl:top-0"
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
        <p className="min-w-0 truncate text-xs font-medium text-muted">
          {SIMS_TITLE} · check the student&apos;s balance
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={SIMS_URL}
            target="_blank"
            rel="noreferrer"
            title="Use this if the SIMS login doesn't stay signed in here"
            className={`${iconBtn} text-muted hover:text-ink`}
          >
            Open in new tab
          </a>
          <button
            type="button"
            aria-pressed={fullscreen}
            onClick={() => setFullscreen((v) => !v)}
            data-modal-initial-focus
            className={iconBtn}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              {fullscreen ? (
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              ) : (
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              )}
            </svg>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </div>
      <iframe
        src={SIMS_URL}
        title={SIMS_TITLE}
        className="block w-full flex-1 border-0 bg-white"
      />
    </section>
  );
}
