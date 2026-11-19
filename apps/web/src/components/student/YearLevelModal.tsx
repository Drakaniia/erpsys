import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { YEAR_LEVEL_LABELS, type YearLevel } from "$lib/domain/constants";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import YearLevelChips from "../YearLevelChips";

export default function YearLevelModal({
  open,
  busy,
  courseName,
  offeredLevels,
  savedYearLevel,
  onsaved,
  onclose,
}: {
  open: boolean;
  busy: boolean;
  courseName: string;
  offeredLevels: readonly YearLevel[];
  savedYearLevel: YearLevel | null;
  onsaved: (yearLevel: YearLevel) => void;
  onclose: () => void;
}) {
  const options: readonly YearLevel[] =
    offeredLevels.length > 0 ? offeredLevels : [];

  const [level, setLevel] = useState<YearLevel[]>([]);
  const seeded = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open, {
    fade: true,
    duration: 180,
    outDuration: 150,
  });

  useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    if (seeded.current === courseName) return;
    seeded.current = courseName;
    setLevel(savedYearLevel ? [savedYearLevel] : []);
  }, [open, courseName, savedYearLevel]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, {
      onEscape: () => {
        if (!busy) onclose();
      },
      initialFocus: "panel",
    });
    return () => trap.destroy();
  }, [open, busy, onclose]);

  function chooseLevel(next: YearLevel[]) {
    setLevel(next.length > 1 ? [next[next.length - 1]!] : next);
  }

  const changed = level.length === 1 && level[0] !== savedYearLevel;
  const ready = level.length === 1 && options.length > 0 && !busy;

  if (!presence.mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="presentation"
      style={presence.style}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={busy ? undefined : onclose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="year-level-title"
        aria-describedby="year-level-body"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/95 p-5 shadow-[0_16px_48px_rgba(16,24,40,0.18),0_4px_12px_rgba(16,24,40,0.12)] backdrop-blur-xl backdrop-saturate-150 outline-none"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />

        <h2
          id="year-level-title"
          className="text-base font-semibold tracking-[-0.01em] text-ink"
        >
          Your year level
        </h2>
        <p id="year-level-body" className="mt-1 text-sm text-muted">
          {courseName}
        </p>

        <div className="mt-4">
          {options.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-muted">
              {courseName} hasn&apos;t published which year levels it serves yet
              — contact the SBO office.
            </p>
          ) : (
            <YearLevelChips
              options={options}
              selected={level}
              disabled={busy}
              label="Year level"
              emptyNote="Pick the year level you're enrolling as."
              onchange={chooseLevel}
            />
          )}
        </div>

        {changed ? (
          <p className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-ink">
            {savedYearLevel ? (
              <>
                Your record says {YEAR_LEVEL_LABELS[savedYearLevel]}. Saving
                will change it to {level[0] ? YEAR_LEVEL_LABELS[level[0]] : ""}.
              </>
            ) : (
              <>
                Saving will record {level[0] ? YEAR_LEVEL_LABELS[level[0]] : ""}{" "}
                on your enrollment.
              </>
            )}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors duration-100 ease-out hover:text-ink active:scale-[0.97] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => level[0] && onsaved(level[0])}
            disabled={!ready}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
