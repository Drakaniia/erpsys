import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";

export default function ShortcutsPopover({
  open,
  onclose,
  id,
  shortcuts,
}: {
  open: boolean;
  onclose: () => void;
  id: string;
  shortcuts: ReadonlyArray<{ action: string; keys: readonly string[] }>;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  const [reduced, setReduced] = useState(false);
  const [popIn, setPopIn] = useSpring(0, UI_SPRING);

  useEffect(() => {
    if (!open) return;
    setReduced(prefersReducedMotion());
    setPopIn(0, true); // replay on re-open
    const raf = requestAnimationFrame(() => setPopIn(1));
    return () => cancelAnimationFrame(raf);
  }, [open, setPopIn]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current?.contains(event.target as Node)) return;
      const trigger = (event.target as Element | null)?.closest(
        "[data-shortcuts-trigger]",
      );
      if (trigger) return;
      onclose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onclose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onclose]);

  if (!open) return null;

  return (
    <div
      ref={root}
      id={id}
      role="region"
      aria-label="Keyboard shortcuts"
      style={{
        opacity: popIn,
        ...(reduced ? {} : { transform: `scale(${0.96 + 0.04 * popIn})` }),
      }}
      className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-xl border border-border bg-surface-raised p-4 shadow-lg"
    >
      <h3 className="text-sm font-semibold tracking-tight text-ink">
        Keyboard shortcuts
      </h3>
      <dl className="mt-3 grid gap-2">
        {shortcuts.map((row) => (
          <div
            key={row.action}
            className="flex items-center justify-between gap-4"
          >
            <dt className="text-xs text-muted">{row.action}</dt>
            <dd className="flex items-center gap-1">
              {row.keys.map((key, i) => (
                <span key={i} className="flex items-center gap-1">
                  {key !== row.keys[0] && (
                    <span className="text-xs text-muted" aria-hidden="true">
                      /
                    </span>
                  )}
                  <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink">
                    {key}
                  </kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
