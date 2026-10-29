import { useEffect, useRef, useState } from "react";
import {
  YEAR_LEVELS,
  departmentLevelRangeLabel,
  normalizeYearLevels,
  type YearLevel,
} from "$lib/domain/constants";
import { dialogTrap } from "$lib/ui/dialog-trap";
import { usePresence } from "$lib/ui/use-presence";
import YearLevelChips from "../YearLevelChips";
import {
  resolveAssignScope,
  takenYearLevels,
  type DepartmentOwner,
} from "$lib/instructor/assignment";

export type AssignTarget = {
  id: string;
  name: string;
  code: string;
  yearLevels: YearLevel[];
  owners: DepartmentOwner[];
  myYearLevels: YearLevel[];
};

export default function AssignDepartmentModal({
  open,
  mode = "assign",
  myAdviserId = null,
  department,
  busy = false,
  onsubmit,
  onclose,
}: {
  open: boolean;
  mode?: "assign" | "edit";
  myAdviserId?: string | null;
  department: AssignTarget | null;
  busy?: boolean;
  onsubmit: (scope: YearLevel[]) => void | Promise<void>;
  onclose: () => void;
}) {
  const [selected, setSelected] = useState<YearLevel[]>([]);
  const seededFor = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presence = usePresence(open && Boolean(department), {
    fade: true,
    duration: 150,
    outDuration: 150,
  });

  const options =
    department && normalizeYearLevels(department.yearLevels).length > 0
      ? normalizeYearLevels(department.yearLevels)
      : [...YEAR_LEVELS];
  const taken = department
    ? takenYearLevels(department.owners, myAdviserId)
    : [];

  useEffect(() => {
    if (!open || !department) {
      seededFor.current = null;
      return;
    }
    const key = `${mode}:${department.id}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    if (mode === "assign") {
      setSelected([]);
      return;
    }
    const blocked = new Set(takenYearLevels(department.owners, myAdviserId));
    setSelected(
      resolveAssignScope(department.myYearLevels, options).filter(
        (level) => !blocked.has(level),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, department?.id, mode]);

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
        aria-labelledby="assign-level-title"
        aria-describedby="assign-level-range"
        tabIndex={-1}
        style={presence.style}
        className="relative w-full max-w-md rounded-2xl border border-white/20 bg-white/95 p-5 shadow-[0_16px_48px_rgba(16,24,40,0.18),0_4px_12px_rgba(16,24,40,0.12)] backdrop-blur-xl backdrop-saturate-150 outline-none"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
        <h2
          id="assign-level-title"
          className="text-base font-semibold tracking-[-0.01em] text-ink"
        >
          {mode === "edit" ? "Edit" : "Assign"} {department.code}
        </h2>
        <p id="assign-level-range" className="mt-1 text-sm text-muted">
          {department.name}
          {selected.length > 0
            ? ` — ${departmentLevelRangeLabel(selected)}`
            : ""}
        </p>
        <div className="mt-4">
          <YearLevelChips
            selected={selected}
            options={options}
            taken={taken}
            disabled={busy}
            label="Year levels to serve"
            emptyNote="Pick at least one year level to serve."
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
            onClick={() => onsubmit(selected)}
            disabled={busy || selected.length === 0}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "edit" ? "Save" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
