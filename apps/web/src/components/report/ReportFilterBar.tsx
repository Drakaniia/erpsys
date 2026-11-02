import { useEffect, useRef, useState } from "react";
import type { StudentsScope } from "$lib/instructor/students";
import {
  BUCKET_OPTIONS,
  ENROLLED_OPTIONS,
  EVIDENCE_OPTIONS,
  ORG_OPTIONS,
  RANGE_OPTIONS,
  REPORT_FILTER_CONFIG,
  ROLE_OPTIONS,
  SCOPE_OPTIONS,
  STATUS_OPTIONS,
  STEP_OPTIONS,
  STEP_STATE_OPTIONS,
  YEAR_LEVEL_OPTIONS,
  reportFilterControl,
  sortOptionsFor,
} from "$lib/report/filter-config";
import type {
  Option,
  ReportDepartment,
  ReportFilterValue,
} from "$lib/report/filter-config";
import type { ReportDef, ReportFilterKey, ReportRole } from "$lib/report/types";
import FilterDropdown from "../ui/FilterDropdown";
import MultiSelectDropdown from "../ui/MultiSelectDropdown";
import type { MultiSelectOption } from "$lib/ui/multi-select";

export default function ReportFilterBar({
  def,
  role,
  value,
  departments = [],
  onchange,
}: {
  def: ReportDef;
  role: ReportRole;
  value: ReportFilterValue;
  departments?: readonly ReportDepartment[];
  onchange: (patch: Partial<ReportFilterValue>) => void;
}) {
  const selectableDepartments = departments.filter(
    (d) => value.scope === "all" || d.assigned !== false,
  );

  const departmentOptions: MultiSelectOption[] = selectableDepartments.map(
    (d) => ({
      value: d.id,
      label: `${d.code} — ${d.name}`,
      muted: d.isActive === false,
      description: d.isActive === false ? "Inactive department" : undefined,
    }),
  );

  const courseOptions: readonly { value: string; label: string }[] = [
    { value: "", label: "All courses" },
    ...selectableDepartments.map((d) => ({
      value: d.id,
      label: `${d.code} — ${d.name}`,
    })),
  ];

  const bucketOptions: MultiSelectOption[] = BUCKET_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));

  const yearLevelOptions: MultiSelectOption[] = YEAR_LEVEL_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
    }),
  );

  /**
   * The empty-valued first option is not decoration: the officer's step is a
   * REQUIRED filter (the procedure's schema has no default for it), so its
   * placeholder has to read as an instruction and Generate has to stay disabled
   * while it is chosen. The instructor's step is optional, hence "Any step".
   */
  function selectOptionsFor(
    key: ReportFilterKey,
    roleArg: ReportRole,
  ): readonly Option[] {
    switch (key) {
      case "step":
        return roleArg === "instructor"
          ? [{ value: "", label: "Any step" }, ...STEP_OPTIONS]
          : [{ value: "", label: "Select a step" }, ...STEP_OPTIONS];
      case "status":
        return STATUS_OPTIONS;
      case "evidence":
        return EVIDENCE_OPTIONS;
      case "range":
        return RANGE_OPTIONS;
      case "stepState":
        return STEP_STATE_OPTIONS;
      case "role":
        return ROLE_OPTIONS;
      case "org":
        return ORG_OPTIONS;
      case "course":
        return courseOptions;
      // The admin's year level is one value, so it is one option list with an
      // explicit "no filter" entry rather than a multi-select that could offer
      // several and send one.
      case "yearLevels":
        return [{ value: "", label: "All year levels" }, ...YEAR_LEVEL_OPTIONS];
      case "sort":
        return sortOptionsFor(roleArg);
      default:
        return [];
    }
  }

  function selectValueFor(
    key: ReportFilterKey,
    valueArg: ReportFilterValue,
  ): string {
    switch (key) {
      case "step":
        return valueArg.step;
      case "status":
        return valueArg.status;
      case "evidence":
        return valueArg.evidence;
      case "range":
        return valueArg.range;
      case "stepState":
        return valueArg.stepState;
      case "role":
        return valueArg.role;
      case "org":
        return valueArg.org;
      case "course":
        return valueArg.course;
      case "yearLevels":
        return valueArg.yearLevels[0] ?? "";
      case "sort":
        return valueArg.sort;
      case "enrolled":
        return valueArg.enrolled;
      case "scope":
        return valueArg.scope;
      default:
        return "";
    }
  }

  function selectPatchFor(
    key: ReportFilterKey,
    next: string,
  ): Partial<ReportFilterValue> {
    switch (key) {
      case "step":
        return { step: next };
      case "status":
        return { status: next };
      case "evidence":
        return { evidence: next };
      case "range":
        return { range: next };
      case "stepState":
        return { stepState: next };
      case "role":
        return { role: next };
      case "org":
        return { org: next };
      case "course":
        return { course: next };
      // The value stays a one-element array so the multi-select shape the
      // roster shares is untouched; `""` means "no level filter".
      case "yearLevels":
        return { yearLevels: next ? [next] : [] };
      case "sort":
        return { sort: next };
      case "enrolled":
        return { enrolled: next };
      case "scope":
        return { scope: next as StudentsScope };
      default:
        return {};
    }
  }

  /**
   * The debounce mirrors the live filter bars so a typed query does not write a
   * URL per keystroke.
   */
  const [searchInput, setSearchInput] = useState(value.q);
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!searchFocused) setSearchInput(value.q);
  }, [value.q, searchFocused]);

  function onSearchInput(next: string) {
    setSearchInput(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => onchange({ q: next.trim() }), 300);
  }

  if (def.filters.length === 0) {
    return <p className="text-sm text-muted">This report has no filters.</p>;
  }

  return (
    <div className="space-y-2.5">
      {def.filters.map((key) => {
        const config = REPORT_FILTER_CONFIG[key];
        const control = reportFilterControl(key, role);
        return (
          <div key={key} className="flex flex-wrap items-center gap-3">
            <span
              className="w-[86px] shrink-0 text-xs font-medium uppercase tracking-wide text-muted"
              id={`${key}-label`}
            >
              {config.label}
            </span>

            <div className="min-w-[160px] flex-1">
              {control === "search" ? (
                <div className="relative">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="search"
                    value={searchInput}
                    aria-labelledby={`${key}-label`}
                    placeholder="Name or student number"
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={(e) => onSearchInput(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                </div>
              ) : control === "select" ? (
                <FilterDropdown
                  value={selectValueFor(key, value)}
                  options={selectOptionsFor(key, role)}
                  ariaLabel={`${config.label} filter`}
                  onchange={(next) => onchange(selectPatchFor(key, next))}
                />
              ) : control === "multi" ? (
                key === "departments" ? (
                  <MultiSelectDropdown
                    label={config.label}
                    placeholder="All courses"
                    options={departmentOptions}
                    selected={value.departments}
                    onchange={(next) => onchange({ departments: next })}
                    panelWidth="min-w-[280px]"
                  />
                ) : key === "yearLevels" ? (
                  /* The instructor only: `getRosterReport` takes `yearLevels[]`.
                     The admin's year level resolves to `select` above, so this
                     branch can never offer it two levels it will not send. */
                  <MultiSelectDropdown
                    label={config.label}
                    placeholder="All year levels"
                    options={yearLevelOptions}
                    selected={value.yearLevels}
                    onchange={(next) => onchange({ yearLevels: next })}
                  />
                ) : (
                  <MultiSelectDropdown
                    label={config.label}
                    placeholder="All"
                    options={bucketOptions}
                    selected={value.buckets}
                    onchange={(next) => onchange({ buckets: next })}
                    panelWidth="min-w-[280px]"
                  />
                )
              ) : control === "segmented" ? (
                <div
                  className="inline-flex rounded-xl border border-border bg-surface p-0.5"
                  role="group"
                  aria-labelledby={`${key}-label`}
                >
                  {(key === "scope" ? SCOPE_OPTIONS : ENROLLED_OPTIONS).map(
                    (option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={
                          selectValueFor(key, value) === option.value
                        }
                        onClick={() =>
                          onchange(selectPatchFor(key, option.value))
                        }
                        className={`press rounded-lg px-3 py-1 text-sm transition-colors ${
                          selectValueFor(key, value) === option.value
                            ? "bg-surface-raised font-medium text-ink shadow-sm"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        {option.label}
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  aria-pressed={value.unassigned}
                  onClick={() => onchange({ unassigned: !value.unassigned })}
                  title="Students with no course record for the selected academic year"
                  className={`press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    value.unassigned
                      ? "border-primary/40 bg-primary/[0.08] font-medium text-primary"
                      : "border-border bg-surface-raised text-muted hover:text-ink"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current"
                    aria-hidden="true"
                  />
                  Only unassigned
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
