import { stepLabel } from "$lib/domain/constants";
import type { FilterEchoEntry } from "$lib/report/download";
import {
  BUCKET_OPTIONS,
  ENROLLED_OPTIONS,
  EVIDENCE_OPTIONS,
  ORG_OPTIONS,
  RANGE_OPTIONS,
  ROLE_DEFAULTS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  STEP_STATE_OPTIONS,
  YEAR_LEVEL_OPTIONS,
  sortOptionsFor,
} from "./filter-config";
import type {
  Option,
  ReportDepartment,
  ReportFilterValue,
} from "./filter-config";
import { joinSort, splitSort } from "./filter-params";
import type { ReportDef, ReportRole } from "./types";

function labelOf(options: readonly Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

function joined(
  options: readonly Option[],
  values: readonly string[],
  joiner = " / ",
): string {
  return values
    .map((value) => labelOf(options, value) || value)
    .filter(Boolean)
    .join(joiner);
}

/**
 * The `Filters:` fragments for the header, built from the DECLARED filters
 * only -- a report that exposes no filters can never grow an empty echo line
 * (spec 5.6). A control left at its default yields `""` and is dropped by
 * `assembleFilterEcho`, so the same "active means printed" rule holds here
 * and in the document.
 */
export function reportFilterEcho(
  value: ReportFilterValue,
  def: ReportDef,
  departments: readonly ReportDepartment[],
  role: ReportRole,
): FilterEchoEntry[] {
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const defaults =
    role === "admin"
      ? ROLE_DEFAULTS.admin
      : role === "instructor"
        ? ROLE_DEFAULTS.instructor
        : ROLE_DEFAULTS.officer;

  return def.filters.map((key) => {
    switch (key) {
      case "step":
        return { label: "Step", value: stepLabel(value.step) };
      case "search":
        return { label: "Search", value: value.q.trim() };
      case "status":
        // The officer's per-step submission status. The instructor's
        // equivalent is the `buckets` key, which is a different control.
        return {
          label: "Status",
          value:
            labelOf(STATUS_OPTIONS, value.status) === STATUS_OPTIONS[0].label
              ? ""
              : labelOf(STATUS_OPTIONS, value.status),
        };
      case "evidence":
        return {
          label: "Evidence",
          value:
            labelOf(EVIDENCE_OPTIONS, value.evidence) ===
            EVIDENCE_OPTIONS[0].label
              ? ""
              : labelOf(EVIDENCE_OPTIONS, value.evidence),
        };
      case "range":
        return {
          label: "Submitted",
          value:
            labelOf(RANGE_OPTIONS, value.range) === RANGE_OPTIONS[0].label
              ? ""
              : labelOf(RANGE_OPTIONS, value.range),
        };
      case "sort": {
        const { sort, dir } = splitSort(value.sort);
        const options = sortOptionsFor(role);
        const chosen = labelOf(options, joinSort(sort, dir));
        const isDefault =
          sort === splitSort(defaults.sort).sort &&
          dir === splitSort(defaults.sort).dir;
        return { label: "Sort", value: isDefault ? "" : chosen };
      }
      case "departments":
        return {
          label: "Course",
          value:
            value.departments.length === 0
              ? ""
              : `${value.departments.length} selected`,
        };
      case "yearLevels":
        return {
          label: "Year level",
          value: joined(YEAR_LEVEL_OPTIONS, value.yearLevels),
        };
      case "buckets":
        return {
          label: "Status",
          value: joined(BUCKET_OPTIONS, value.buckets),
        };
      case "stepState":
        return {
          label: "Step state",
          value: labelOf(STEP_STATE_OPTIONS, value.stepState),
        };
      case "enrolled":
        return {
          label: "Enrolled",
          value:
            value.enrolled === "all"
              ? ""
              : labelOf(ENROLLED_OPTIONS, value.enrolled),
        };
      case "unassigned":
        return {
          label: "Unassigned",
          value: value.unassigned ? "Only unassigned" : "",
        };
      case "role":
        return {
          label: "Role",
          value: value.role === "ALL" ? "" : labelOf(ROLE_OPTIONS, value.role),
        };
      case "org":
        return {
          label: "Organization",
          value: value.org === "ALL" ? "" : labelOf(ORG_OPTIONS, value.org),
        };
      case "course": {
        const dept = departmentById.get(value.course);
        return { label: "Course", value: dept ? dept.code : "" };
      }
      case "scope":
        return {
          label: "Scope",
          value: value.scope === "all" ? "All departments" : "",
        };
    }
  });
}
