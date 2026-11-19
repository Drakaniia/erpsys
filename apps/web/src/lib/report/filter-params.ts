import { YEAR_LEVELS, type YearLevel } from "$lib/domain/constants";
import {
  readStudentFilters,
  studentFilterUpdates,
  type EnrollmentFilter,
  type StudentBucket,
  type StudentFilters,
  type StudentSort,
  type StudentStepState,
  type StudentsScope,
} from "$lib/instructor/students";
import { reportScopeUpdate } from "$lib/instructor/reports";
import type { ReportFilterKey, ReportRole } from "$lib/report/types";
import {
  DEFAULT_REPORT_FILTER_VALUE,
  ROLE_DEFAULTS,
  type ReportFilterValue,
} from "./filter-config";

/**
 * `rstep`, not `step`: the officer console derives its ACTIVE TAB from
 * `?step=`, and `isOfficerTab("ASSESSMENT")` is false -- writing the step code
 * there would silently drop the user back to Overview mid-report. The Reports
 * panel both reads and writes this param, so it stays self-contained. The
 * instructor keeps `?step=` because its own console selects the tab with
 * `?tab=` and reuses the Students filter params verbatim (spec 5.11).
 */
const PARAM = {
  step: "rstep",
  q: "q",
  status: "status",
  evidence: "evidence",
  range: "range",
  sort: "sort",
  dir: "dir",
  departments: "depts",
  yearLevels: "levels",
  buckets: "buckets",
  stepState: "stepState",
  enrolled: "enrolled",
  unassigned: "unassigned",
  role: "role",
  org: "outside",
  course: "dept",
  scope: "scope",
} as const;

/**
 * `search` is the only declared key whose value field is not named after it
 * (`?q=` is the live console's param, kept for URL compatibility), so a
 * required-filter check cannot index by the key directly.
 */
const FIELD_FOR_KEY: Partial<Record<ReportFilterKey, keyof ReportFilterValue>> =
  {
    search: "q",
  };

export function reportFilterFieldFor(
  key: ReportFilterKey,
): keyof ReportFilterValue {
  return FIELD_FOR_KEY[key] ?? (key as keyof ReportFilterValue);
}

/** `"submittedAt:desc"` -> `{ sort: "submittedAt", dir: "desc" }`. */
export function splitSort(value: string): {
  sort: string;
  dir: "asc" | "desc";
} {
  const at = value.lastIndexOf(":");
  if (at === -1) return { sort: value, dir: "asc" };
  return {
    sort: value.slice(0, at),
    dir: value.slice(at + 1) === "desc" ? "desc" : "asc",
  };
}

export function joinSort(sort: string, dir: string): string {
  return `${sort}:${dir}`;
}

function oneOf(
  value: string | null,
  allowed: readonly string[],
  fallback: string,
) {
  return value && allowed.includes(value) ? value : fallback;
}

function csv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The admin console's `?levels=`, validated against the domain's own list --
 * the same `listOf(..., YEAR_LEVELS)` the instructor path gets from
 * `readStudentFilters`, and for the same reason. A hand-edited `?levels=SIXTH`
 * forwarded to a `z.enum(YEAR_LEVELS)` fails the whole query, which leaves the
 * panel with no preview, `noMatches` false, and Generate enabled against a call
 * that will throw. Dropping the unknown value degrades a bad URL to "no level
 * filter" instead of a broken one.
 *
 * Only the FIRST surviving value is kept, because the control is single-select
 * for this role: honouring a second value here would reintroduce the very
 * disagreement the single-select exists to prevent.
 */
function adminYearLevels(value: string | null): string[] {
  const known = csv(value).filter((level) =>
    (YEAR_LEVELS as readonly string[]).includes(level),
  );
  return known.slice(0, 1);
}

function paramsToStudentFilters(params: URLSearchParams): StudentFilters {
  return readStudentFilters(params);
}

/**
 * The instructor path never parses a param itself: the Students tab already
 * owns the vocabulary, and a report that read its own would be the second
 * place `?stepState=` is spelled (spec 5.11).
 */
function readInstructorValue(
  params: URLSearchParams,
  scope: StudentsScope,
): ReportFilterValue {
  const filters = paramsToStudentFilters(params);
  return {
    ...DEFAULT_REPORT_FILTER_VALUE,
    step: filters.stepCode ?? "",
    q: filters.q,
    yearLevels: [...filters.yearLevels],
    buckets: [...filters.buckets],
    stepState: filters.stepState ?? "",
    enrolled: filters.enrolled,
    unassigned: filters.unassigned,
    departments: [...filters.departmentIds],
    sort: joinSort(filters.sort, filters.dir),
    scope,
  };
}

const OFFICER_SORTS: readonly string[] = [
  "submittedAt",
  "studentName",
  "status",
];
const ADMIN_SORTS: readonly string[] = ["joined", "studentNumber", "name"];

export function readReportFilterValue(
  params: URLSearchParams,
  role: ReportRole,
  scope: StudentsScope,
): ReportFilterValue {
  if (role === "instructor") return readInstructorValue(params, scope);

  if (role === "admin") {
    return {
      ...DEFAULT_REPORT_FILTER_VALUE,
      scope: "mine",
      q: params.get(PARAM.q)?.trim() ?? "",
      role:
        oneOf(
          params.get(PARAM.role),
          ["STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER", "ADMIN"],
          "ALL",
        ) === "ALL"
          ? "ALL"
          : oneOf(
              params.get(PARAM.role),
              ["STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER", "ADMIN"],
              "ALL",
            ),
      org: oneOf(params.get(PARAM.org), ["INSIDE", "OUTSIDE"], "ALL"),
      course: params.get(PARAM.course)?.trim() ?? "",
      yearLevels: adminYearLevels(params.get(PARAM.yearLevels)),
      sort: joinSort(
        oneOf(params.get(PARAM.sort), ADMIN_SORTS, "joined"),
        oneOf(params.get(PARAM.dir), ["asc", "desc"], "desc"),
      ),
    };
  }

  return {
    ...DEFAULT_REPORT_FILTER_VALUE,
    scope: "mine",
    step: params.get(PARAM.step)?.trim() ?? "",
    q: params.get(PARAM.q)?.trim() ?? "",
    status: oneOf(
      params.get(PARAM.status),
      ["PENDING", "SUBMITTED", "VERIFIED", "RETURNED"],
      "ALL",
    ),
    evidence: oneOf(params.get(PARAM.evidence), ["HAS", "NONE"], "ALL"),
    range: oneOf(
      params.get(PARAM.range),
      ["today", "7d", "30d", "year"],
      "ALL",
    ),
    sort: joinSort(
      oneOf(params.get(PARAM.sort), OFFICER_SORTS, "submittedAt"),
      oneOf(params.get(PARAM.dir), ["asc", "desc"], "asc"),
    ),
  };
}

/**
 * Every param the value does not use is written as `null` rather than omitted,
 * so switching reports -- or consoles via a pasted link -- clears the filters
 * the new report does not offer instead of leaving them to fire silently.
 */
export function reportFilterUpdates(
  value: ReportFilterValue,
  role: ReportRole,
): Record<string, string | null> {
  if (role === "instructor") {
    const { sort, dir } = splitSort(value.sort);
    const studentValue: StudentFilters = {
      academicYearId: null,
      departmentIds: value.departments,
      yearLevels: value.yearLevels as YearLevel[],
      buckets: value.buckets as StudentBucket[],
      stepCode: (value.step || null) as StudentFilters["stepCode"],
      stepState: (value.stepState || null) as StudentStepState | null,
      enrolled: value.enrolled as EnrollmentFilter,
      unassigned: value.unassigned,
      q: value.q,
      sort: sort as StudentSort,
      dir,
    };
    return {
      ...studentFilterUpdates(studentValue),
      ...reportScopeUpdate(value.scope),
      // The officer and admin keys the instructor's own helpers do not know
      // about. Cleared for the same reason as below: a stale `?rstep=` left in
      // the URL is a filter the console is not showing anyone.
      [PARAM.step]: null,
      [PARAM.status]: null,
      [PARAM.evidence]: null,
      [PARAM.range]: null,
      [PARAM.role]: null,
      [PARAM.org]: null,
      [PARAM.course]: null,
    };
  }

  const defaults =
    role === "admin" ? ROLE_DEFAULTS.admin : ROLE_DEFAULTS.officer;
  const { sort, dir } = splitSort(value.sort);
  const defaultSort = splitSort(defaults.sort);

  return {
    [PARAM.step]: value.step || null,
    [PARAM.q]: value.q.trim() || null,
    [PARAM.status]: value.status === defaults.status ? null : value.status,
    [PARAM.evidence]:
      value.evidence === defaults.evidence ? null : value.evidence,
    [PARAM.range]: value.range === defaults.range ? null : value.range,
    [PARAM.sort]: sort === defaultSort.sort ? null : sort,
    [PARAM.dir]: dir === defaultSort.dir ? null : dir,
    [PARAM.departments]: null,
    [PARAM.yearLevels]:
      role === "admin" && value.yearLevels.length > 0
        ? value.yearLevels[0]
        : null,
    [PARAM.buckets]: null,
    [PARAM.stepState]: null,
    [PARAM.enrolled]: null,
    [PARAM.unassigned]: null,
    [PARAM.role]: role === "admin" && value.role !== "ALL" ? value.role : null,
    [PARAM.org]: role === "admin" && value.org !== "ALL" ? value.org : null,
    [PARAM.course]: role === "admin" ? value.course || null : null,
    [PARAM.scope]: null,
  };
}
