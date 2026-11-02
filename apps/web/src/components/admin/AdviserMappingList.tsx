import ConfirmDialog from "../ConfirmDialog";
import YearLevelChips from "../YearLevelChips";
import { initials } from "$lib/officer/format";
import { YEAR_LEVELS, departmentLevelRangeLabel } from "$lib/domain/constants";
import type { DepartmentItem } from "$lib/admin/types";
import { useAdviserMapping } from "./use-adviser-mapping";

export default function AdviserMappingList({
  ontoast,
  registerrefresh = () => {},
}: {
  ontoast: (message: string, kind?: "success" | "error") => void;
  registerrefresh?: (fn: () => Promise<unknown> | void) => void;
}) {
  const {
    advisers,
    activeDepartments,
    isPending,
    isError,
    refetchAll,
    editingId,
    selectedLevels,
    openEditor,
    setLevels,
    toggleDept,
    saveEditor,
    cancelEditor,
    clearing,
    setClearing,
    confirmClear,
    savePending,
  } = useAdviserMapping({ ontoast, registerrefresh });

  return (
    <div className="flex flex-col gap-4">
      {isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-error/30 bg-error/5 px-4 py-3">
          <p className="text-sm text-error">Could not load advisers.</p>
          <button
            onClick={refetchAll}
            className="rounded-lg border border-error/30 px-3 py-1.5 text-sm text-error transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 active:scale-[0.97]"
          >
            Retry
          </button>
        </div>
      )}

      {isPending ? (
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface-raised"
          aria-hidden="true"
        >
          {Array.from({ length: 3 }, (_, i) => i).map((i) => (
            <div
              key={i}
              className="flex h-14 items-center justify-between gap-4 border-b border-border px-4 last:border-b-0"
              style={{ "--skeleton-i": i } as React.CSSProperties}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 space-y-1.5">
                  <div className="skeleton h-3 w-40 rounded" />
                  <div className="skeleton h-2.5 w-48 rounded" />
                </div>
              </div>
              <div className="skeleton h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : advisers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-raised px-6 py-14 text-center">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-primary"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <p className="text-sm font-medium text-ink">
            No instructors have signed in yet
          </p>
          <p className="max-w-sm text-xs text-muted">
            Instructors appear here after their first login with a @buksu.edu.ph
            account.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-5 tracking-[0.01em] text-muted">
              Advisers derive their role from the @buksu.edu.ph domain. Assign
              their departments here — the instructor page picks the mapping up
              on its next poll.
            </p>
            <div
              className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-raised px-3.5 py-2.5"
              role="note"
            >
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </span>
              <p className="text-xs leading-5 tracking-[0.01em] text-ink/80">
                <span className="font-medium text-ink">
                  Signing out clears the mapping and closes
                </span>{" "}
                <span className="font-medium">Accepting students</span>.
                Removing departments here does not demote the adviser (§6.5);
                their page just shows the no-departments state.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            <ul className="divide-y divide-border">
              {advisers.map((adviser) => (
                <li key={adviser.id} className="px-4 py-3">
                  {editingId === adviser.id ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {initials(adviser.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {adviser.name}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {adviser.email}
                          </p>
                        </div>
                      </div>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label={`Departments for ${adviser.name}`}
                      >
                        {activeDepartments.map((d) => {
                          const selected = selectedLevels.has(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => toggleDept(d.id)}
                              aria-pressed={selected}
                              className={`rounded-full border px-3 py-1 text-xs font-medium tracking-[0.01em] transition-[transform,background-color,border-color,color] duration-100 ease-out active:scale-[0.97] ${
                                selected
                                  ? "border-primary bg-primary text-white"
                                  : "border-border text-muted hover:border-primary/40 hover:text-primary"
                              }`}
                            >
                              {d.code}
                            </button>
                          );
                        })}
                        {activeDepartments.length === 0 && (
                          <p className="text-xs text-muted">
                            No active departments to assign.
                          </p>
                        )}
                      </div>

                      {selectedLevels.size > 0 && (
                        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                          {[...selectedLevels.keys()].map((deptId) => {
                            const dept = activeDepartments.find(
                              (d) => d.id === deptId,
                            );
                            if (!dept) return null;
                            return (
                              <div key={deptId} className="flex flex-col">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-ink">
                                    {dept.code}
                                  </p>
                                  <span className="text-[11px] text-muted">
                                    {departmentLevelRangeLabel(
                                      selectedLevels.get(deptId) ?? [],
                                    )}
                                  </span>
                                </div>
                                <div className="mt-1.5">
                                  <YearLevelChips
                                    selected={selectedLevels.get(deptId) ?? []}
                                    options={
                                      dept.yearLevels.length > 0
                                        ? dept.yearLevels
                                        : YEAR_LEVELS
                                    }
                                    label="Year levels"
                                    emptyNote="No levels selected — every year level this program offers."
                                    onchange={(levels) =>
                                      setLevels(deptId, levels)
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditor}
                          disabled={savePending}
                          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditor}
                          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-[transform,background-color] duration-100 ease-out hover:text-ink active:scale-[0.97]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          aria-hidden="true"
                        >
                          {initials(adviser.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {adviser.name}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {adviser.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        {adviser.departments.length === 0 ? (
                          <span className="text-xs text-muted">
                            No departments assigned
                          </span>
                        ) : (
                          <div className="flex max-w-[320px] flex-wrap justify-end gap-1.5">
                            {adviser.departments.map((d: DepartmentItem) => (
                              <span
                                key={d.id}
                                className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                              >
                                {d.code} ·{" "}
                                {departmentLevelRangeLabel(d.yearLevels)}
                              </span>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => openEditor(adviser)}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted transition-[transform,background-color] duration-100 ease-out hover:bg-surface hover:text-ink active:scale-[0.97]"
                        >
                          Edit
                        </button>
                        {adviser.departments.length > 0 && (
                          <button
                            onClick={() => setClearing(adviser)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-error/80 transition-[transform,background-color] duration-100 ease-out hover:bg-error/5 hover:text-error active:scale-[0.97]"
                          >
                            Remove all
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <ConfirmDialog
        open={clearing !== null}
        title={clearing ? `Remove all departments from ${clearing.name}?` : ""}
        body="They keep their instructor role — their page just shows the no-departments state until departments are assigned."
        confirmLabel="Remove all"
        destructive
        busy={savePending}
        onconfirm={confirmClear}
        onclose={() => setClearing(null)}
      />
    </div>
  );
}
