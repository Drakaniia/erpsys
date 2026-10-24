import { useEffect, useRef, useState } from "react";
import {
  departmentLevelRangeLabel,
  normalizeYearLevels,
  type YearLevel,
} from "$lib/domain/constants";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import YearLevelChips from "./YearLevelChips";

export default function YearLevelModal({
  open,
  department,
  busy = false,
  onsaved,
  onclose,
}: {
  open: boolean;
  department: { id: string; name: string; yearLevels: YearLevel[] } | null;
  busy?: boolean;
  onsaved: (yearLevels: YearLevel[]) => void | Promise<void>;
  onclose: () => void;
}) {
  const [selected, setSelected] = useState<YearLevel[]>([]);
  const seededId = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open && Boolean(department), {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  useEffect(() => {
    if (!open || !department) {
      seededId.current = null;
      return;
    }
    if (seededId.current === department.id) return;
    seededId.current = department.id;
    setSelected(normalizeYearLevels(department.yearLevels));
  }, [open, department]);

  useEffect(() => {
    if (!open || !department) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, {
      onEscape: onclose,
      initialFocus: "panel",
    });
    return () => trap.destroy();
  }, [open, department, onclose]);

  if (!presence.mounted || !department) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        style={presence.style}
        aria-hidden="true"
        onClick={busy ? undefined : onclose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="year-level-title"
        aria-describedby="year-level-range"
        tabIndex={-1}
        style={presence.style}
        className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/95 p-5 shadow-[0_16px_48px_rgba(16,24,40,0.18),0_4px_12px_rgba(16,24,40,0.12)] backdrop-blur-xl backdrop-saturate-150 outline-none"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />

        <h2
          id="year-level-title"
          className="text-base font-semibold tracking-[-0.01em] text-ink"
        >
          {department.name}
        </h2>
        <p id="year-level-range" className="mt-1 text-sm text-muted">
          {departmentLevelRangeLabel(selected)}
        </p>

        <div className="mt-4">
          <YearLevelChips
            selected={selected}
            disabled={busy}
            onchange={(levels) => setSelected(levels)}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onclose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors duration-100 ease-out hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onsaved(selected)}
            disabled={busy}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
