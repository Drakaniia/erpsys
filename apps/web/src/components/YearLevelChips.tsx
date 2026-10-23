import {
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
  normalizeYearLevels,
  type YearLevel,
} from "$lib/domain/constants";

export default function YearLevelChips({
  selected,
  options = YEAR_LEVELS,
  disabled = false,
  label = "Applicable year levels",
  taken = [],
  emptyNote = "No levels selected — all year levels are offered.",
  legend,
  onchange,
}: {
  selected: YearLevel[];
  options?: readonly YearLevel[];
  disabled?: boolean;
  label?: string;
  taken?: readonly YearLevel[];
  emptyNote?: string;
  legend?: string;
  onchange: (levels: YearLevel[]) => void;
}) {
  // Held levels are not selectable, so "all" means every level the caller can
  // actually take. Counting the held ones would keep the shortcut live with
  // nothing left to do and hand `taken` levels straight back through onchange.
  const freeOptions = options.filter((level) => !taken.includes(level));
  const allSelected =
    freeOptions.length > 0 &&
    freeOptions.every((level) => selected.includes(level));

  function toggle(level: YearLevel) {
    if (taken.includes(level)) return;
    onchange(
      selected.includes(level)
        ? selected.filter((l) => l !== level)
        : normalizeYearLevels([...selected, level]),
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled || allSelected}
            onClick={() => onchange([...freeOptions])}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors duration-100 ease-out hover:bg-primary/10 disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            disabled={disabled || selected.length === 0}
            onClick={() => onchange([])}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors duration-100 ease-out hover:bg-ink/[0.04] hover:text-ink disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((level) => {
          const checked = selected.includes(level);
          const isTaken = taken.includes(level);
          return (
            <button
              key={level}
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-disabled={isTaken}
              disabled={disabled || isTaken}
              onClick={() => toggle(level)}
              title={isTaken ? "Served by another instructor" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-[transform,background-color,border-color,color] duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed ${isTaken ? "border-dashed border-border/70 text-muted/60" : checked ? "border-primary/25 bg-primary/10 text-primary" : "border-border text-ink/70 hover:border-border/80 hover:bg-ink/[0.03] hover:text-ink"}`}
            >
              {YEAR_LEVEL_LABELS[level]}
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="mt-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          {emptyNote}
        </p>
      )}

      {legend && (
        <p className="mt-2 text-xs leading-5 tracking-[0.01em] text-muted">
          {legend}
        </p>
      )}
    </>
  );
}
