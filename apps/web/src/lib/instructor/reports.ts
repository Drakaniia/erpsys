import {
  buildStudentFilterInput,
  readStudentFilters,
  studentFilterUpdates,
  type StudentFilters,
  type StudentsScope,
} from "./students";
import type { ReportKind } from "../report/types";

/**
 * The Reports tab's id, matched against `INSTRUCTOR_TAB_ID`'s convention. It is
 * a plain string rather than a department id, which is why the state module
 * routes it through `selectReportsTab()` instead of `selectTab()` -- see spec
 * 9.3. `InstructorTabBar` and the page read this constant rather than
 * restating `"reports"`.
 */
export const REPORTS_TAB_ID = "reports";

/** Which report is on screen. Shared with the officer and admin consoles. */
const REPORT_PARAM = "report";

/**
 * `?scope=mine|all`. NOT one of `students.ts`'s params: the roster keeps scope
 * in component state because it has no URL to survive, but a report
 * configuration is meant to be shareable (spec 5.11), so the toggle the
 * catalogue declares under `scope` needs a home of its own here.
 */
const SCOPE_PARAM = "scope";

export function reportsTabSelected(params: URLSearchParams): boolean {
  return params.get("tab") === REPORTS_TAB_ID;
}

/**
 * The selected report, validated against the role's catalogue. A `?report=` the
 * catalogue does not offer -- a stale link, or an officer's kind pasted into an
 * instructor URL -- resolves to `null` rather than to a report that does not
 * exist, and the panel falls back to the first entry.
 */
export function readReportKind(
  params: URLSearchParams,
  catalog: ReadonlyArray<{ kind: ReportKind }>,
): ReportKind | null {
  const value = params.get(REPORT_PARAM);
  if (!value) return null;
  return catalog.some((def) => def.kind === value)
    ? (value as ReportKind)
    : null;
}

export function reportKindUpdate(
  kind: ReportKind | null,
): Record<string, string | null> {
  return { [REPORT_PARAM]: kind };
}

export function readReportScope(params: URLSearchParams): StudentsScope {
  return params.get(SCOPE_PARAM) === "all" ? "all" : "mine";
}

export function reportScopeUpdate(
  scope: StudentsScope,
): Record<string, string | null> {
  return { [SCOPE_PARAM]: scope === "all" ? "all" : null };
}

/**
 * The exact input `instructor.getRosterReport` takes: the roster filter the
 * Students tab already builds, plus the two sort keys, minus nothing. Reports
 * are about the ACTIVE year (spec 5.10), so `academicYearId` is dropped when it
 * is absent rather than sent as `undefined` -- the procedure resolves the
 * active year itself and `resolveRosterYear` treats the two identically.
 */
export function rosterReportInput(
  filters: StudentFilters,
  scope: StudentsScope,
): ReturnType<typeof buildStudentFilterInput> & {
  sort: StudentFilters["sort"];
  dir: StudentFilters["dir"];
} {
  const input = buildStudentFilterInput(
    { ...filters, academicYearId: null },
    scope,
  );
  return { ...input, sort: filters.sort, dir: filters.dir };
}

/**
 * The Reports tab reuses the Students tab's filter params verbatim rather than
 * declaring a parallel vocabulary (spec 5.11): a link to a roster report and a
 * link to the same roster share every parameter but `report`.
 */
export { buildStudentFilterInput, readStudentFilters, studentFilterUpdates };
export type { StudentFilters, StudentsScope };
