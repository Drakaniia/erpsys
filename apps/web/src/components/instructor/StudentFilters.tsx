import { useEffect, useMemo, useRef, useState } from "react";
import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
} from "$lib/domain/constants";
import MultiSelectDropdown from "../ui/MultiSelectDropdown";
import type { MultiSelectOption } from "$lib/ui/multi-select";
import {
  activeStudentFilterCount,
  BUCKET_DEFINITIONS,
  BUCKET_LABELS,
  hasActiveStudentFilters,
  selectableDepartmentIds,
  STEP_STATE_LABELS,
  STEP_STATES,
  stepLabel,
  type EnrollmentFilter,
  type StudentFilters,
  type StudentsScope,
} from "$lib/instructor/students";

type DepartmentOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  assigned: boolean;
};
type YearOption = {
  id: string;
  label: string;
  semesterLabel: string;
  isActive: boolean;
};

const ENROLLMENT_OPTIONS: Array<{ value: EnrollmentFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "enrolled", label: "Enrolled" },
  { value: "not_enrolled", label: "Not enrolled" },
];

export default function StudentFilters({
  filters,
  scope,
  departments,
  years,
  activeYearId,
  total,
  loading,
  onscope,
  onpatch,
  onclear,
}: {
  filters: StudentFilters;
  scope: StudentsScope;
  departments: DepartmentOption[];
  years: YearOption[];
  activeYearId: string | null;
  total: number | null;
  loading: boolean;
  onscope: (scope: StudentsScope) => void;
  onpatch: (patch: Partial<StudentFilters>) => void;
  onclear: () => void;
}) {
  const selectableIds = useMemo(
    () => new Set(selectableDepartmentIds(departments, scope)),
    [departments, scope],
  );
  const courseOptions: MultiSelectOption[] = departments
    .filter((d) => selectableIds.has(d.id))
    .map((d) => ({
      value: d.id,
      label: `${d.code} — ${d.name}`,
      muted: !d.isActive,
      description: d.isActive ? undefined : "Inactive department",
    }));
  const yearLevelOptions: MultiSelectOption[] = YEAR_LEVELS.map((level) => ({
    value: level,
    label: YEAR_LEVEL_LABELS[level],
  }));
  const bucketOptions: MultiSelectOption[] = (
    Object.keys(BUCKET_LABELS) as Array<keyof typeof BUCKET_LABELS>
  ).map((bucket) => ({
    value: bucket,
    label: BUCKET_LABELS[bucket],
    description: BUCKET_DEFINITIONS[bucket],
  }));
  const stepOptions = [
    { value: "", label: "Any step" },
    ...PRE_ENROLLMENT_STEP_CODES.map((code) => ({
      value: code,
      label: stepLabel(code),
    })),
  ];

  const activeCount = activeStudentFilterCount(filters);
  const requirementSummary = `${filters.stepCode ? stepLabel(filters.stepCode) : "Any step"} — ${filters.stepState ? STEP_STATE_LABELS[filters.stepState] : "any state"}`;

  const [searchInput, setSearchInput] = useState(filters.q);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  function onSearchInput(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.currentTarget.value;
    setSearchInput(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => onpatch({ q: value }), 300);
  }

  function clearSearch() {
    setSearchInput("");
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    onpatch({ q: "" });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-xl border border-border bg-surface p-0.5"
          role="group"
          aria-label="Student scope"
        >
          <button
            type="button"
            onClick={() => onscope("mine")}
            aria-pressed={scope === "mine"}
            className={`press rounded-lg px-3 py-1 text-sm transition-colors ${scope === "mine" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            My departments
          </button>
          <button
            type="button"
            onClick={() => onscope("all")}
            aria-pressed={scope === "all"}
            className={`press rounded-lg px-3 py-1 text-sm transition-colors ${scope === "all" ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            All departments
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="sr-only sm:not-sr-only">Academic year</span>
          <select
            value={filters.academicYearId ?? ""}
            onChange={(e) =>
              onpatch({ academicYearId: e.currentTarget.value || null })
            }
            className="rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">
              {activeYearId ? "Active year" : "Newest year"}
            </option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.label}
                {year.isActive ? " · Active" : ""}
              </option>
            ))}
          </select>
        </label>
        {scope === "all" && (
          <p className="text-xs text-muted/80" role="status">
            Showing all students in the college.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectDropdown
          label="Course"
          placeholder="Course"
          options={courseOptions}
          selected={filters.departmentIds}
          onchange={(next) => onpatch({ departmentIds: next })}
          panelWidth="min-w-[280px]"
        />
        <MultiSelectDropdown
          label="Year level"
          placeholder="Year level"
          options={yearLevelOptions}
          selected={filters.yearLevels}
          onchange={(next) =>
            onpatch({ yearLevels: next as StudentFilters["yearLevels"] })
          }
        />
        <MultiSelectDropdown
          label="Status"
          placeholder="Status"
          options={bucketOptions}
          selected={filters.buckets}
          onchange={(next) =>
            onpatch({ buckets: next as StudentFilters["buckets"] })
          }
        />
        <div
          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${filters.stepCode || filters.stepState ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-surface-raised"}`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
            className="shrink-0 text-muted/70"
          >
            <path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Requirement</span>
          <select
            aria-label="Requirement step"
            title={requirementSummary}
            value={filters.stepCode ?? ""}
            onChange={(e) =>
              onpatch({
                stepCode: (e.currentTarget.value ||
                  null) as StudentFilters["stepCode"],
              })
            }
            className="bg-transparent text-sm text-ink focus:outline-none"
          >
            {stepOptions.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Requirement state"
            title={requirementSummary}
            value={filters.stepState ?? ""}
            onChange={(e) =>
              onpatch({
                stepState: (e.currentTarget.value ||
                  null) as StudentFilters["stepState"],
              })
            }
            className="bg-transparent text-sm text-ink focus:outline-none"
          >
            <option value="">any state</option>
            {STEP_STATES.map((state) => (
              <option key={state} value={state}>
                {STEP_STATE_LABELS[state]}
              </option>
            ))}
          </select>
        </div>
        <div
          className="flex rounded-xl border border-border bg-surface p-0.5"
          role="group"
          aria-label="Enrollment state"
        >
          {ENROLLMENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onpatch({ enrolled: option.value })}
              aria-pressed={filters.enrolled === option.value}
              className={`press rounded-lg px-2.5 py-1 text-sm transition-colors ${filters.enrolled === option.value ? "bg-surface-raised font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onpatch({ unassigned: !filters.unassigned })}
          aria-pressed={filters.unassigned}
          title="Students with no course record for the selected academic year"
          className={`press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${filters.unassigned ? "border-primary/40 bg-primary/[0.08] font-medium text-primary" : "border-border bg-surface-raised text-muted hover:text-ink"}`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-current"
            aria-hidden="true"
          />
          Unassigned
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchInput}
            onChange={onSearchInput}
            placeholder="Search name or student #"
            aria-label="Search students"
            className="w-full rounded-xl border border-border bg-surface py-1.5 pl-8 pr-8 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="press absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <span className="text-sm text-muted tabular-nums" aria-live="polite">
          {loading && total === null
            ? "Loading…"
            : total !== null
              ? `${total} ${total === 1 ? "student" : "students"}`
              : null}
        </span>
        {hasActiveStudentFilters(filters) && (
          <button
            type="button"
            onClick={onclear}
            className="press rounded-lg px-2.5 py-1 text-sm text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
          >
            Clear filters
            {activeCount > 1 && (
              <span className="ml-1 tabular-nums text-muted/70">
                ({activeCount})
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
