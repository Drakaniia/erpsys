import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
  departmentLevelLabel,
  type PreEnrollmentStepCode,
  type YearLevel,
} from "$lib/domain/constants";

export const STUDENTS_TAB_ID = "students";

export function studentsTabSelected(params: URLSearchParams): boolean {
  return params.get("tab") === STUDENTS_TAB_ID;
}

export const STUDENT_BUCKETS = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "READY_FOR_QUEUE",
  "ENROLLED",
] as const;
export type StudentBucket = (typeof STUDENT_BUCKETS)[number];

/** Full labels for filters and tooltips. */
export const BUCKET_LABELS: Record<StudentBucket, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  READY_FOR_QUEUE: "Ready for queue",
  ENROLLED: "Enrolled",
};

export const BUCKET_SHORT_LABELS: Record<StudentBucket, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  READY_FOR_QUEUE: "Ready",
  ENROLLED: "Enrolled",
};

export const BUCKET_DEFINITIONS: Record<StudentBucket, string> = {
  NOT_STARTED: "No pre-enrollment steps verified and nothing submitted.",
  IN_PROGRESS:
    "At least one step touched (verified or submitted), but not all of the first five.",
  READY_FOR_QUEUE: "Steps 1–5 verified and no queue entry yet.",
  ENROLLED: "Queue completed for this academic year (step 6 verified).",
};

export const STEP_STATES = [
  "MISSING",
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
  "RETURNED",
] as const;
export type StudentStepState = (typeof STEP_STATES)[number];

export const STEP_STATE_LABELS: Record<StudentStepState, string> = {
  MISSING: "Missing",
  PENDING: "Pending",
  SUBMITTED: "Pending review",
  VERIFIED: "Verified",
  RETURNED: "Returned",
};

export const STEP_STATE_TONES: Record<StudentStepState, string> = {
  MISSING: "text-muted/70 bg-surface",
  PENDING: "text-ink/70 bg-ink/[0.04]",
  SUBMITTED: "text-gold bg-gold/15",
  VERIFIED: "text-primary bg-primary/10",
  RETURNED: "text-error bg-error/10",
};

export const STUDENT_SORTS = [
  "name",
  "studentNumber",
  "stepsVerified",
  "yearLevel",
  "enrolledAt",
] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];
export type SortDir = "asc" | "desc";
export type EnrollmentFilter = "all" | "enrolled" | "not_enrolled";
export type StudentsScope = "mine" | "all";

export const DEFAULT_STUDENT_PAGE_SIZE = 50;

const DESC_FIRST_SORTS: ReadonlySet<StudentSort> = new Set<StudentSort>([
  "stepsVerified",
  "enrolledAt",
]);

export type StudentFilters = {
  academicYearId: string | null;
  departmentIds: string[];
  yearLevels: YearLevel[];
  buckets: StudentBucket[];
  stepCode: PreEnrollmentStepCode | null;
  stepState: StudentStepState | null;
  enrolled: EnrollmentFilter;
  unassigned: boolean;
  q: string;
  sort: StudentSort;
  dir: SortDir;
};

export const DEFAULT_STUDENT_FILTERS: StudentFilters = {
  academicYearId: null,
  departmentIds: [],
  yearLevels: [],
  buckets: [],
  stepCode: null,
  stepState: null,
  enrolled: "all",
  unassigned: false,
  q: "",
  sort: "name",
  dir: "asc",
};

const PARAM = {
  academicYearId: "ay",
  departmentIds: "depts",
  yearLevels: "levels",
  buckets: "buckets",
  stepCode: "step",
  stepState: "stepState",
  enrolled: "enrolled",
  unassigned: "unassigned",
  q: "q",
  sort: "sort",
  dir: "dir",
} as const;

function list(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function listOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T[] {
  return list(value).filter((item): item is T =>
    (allowed as readonly string[]).includes(item),
  );
}

export function readStudentFilters(params: URLSearchParams): StudentFilters {
  return {
    academicYearId: params.get(PARAM.academicYearId)?.trim() || null,
    departmentIds: list(params.get(PARAM.departmentIds)),
    yearLevels: listOf(params.get(PARAM.yearLevels), YEAR_LEVELS),
    buckets: listOf(params.get(PARAM.buckets), STUDENT_BUCKETS),
    stepCode: oneOf(params.get(PARAM.stepCode), PRE_ENROLLMENT_STEP_CODES),
    stepState: oneOf(params.get(PARAM.stepState), STEP_STATES),
    enrolled:
      params.get(PARAM.enrolled) === "enrolled"
        ? "enrolled"
        : params.get(PARAM.enrolled) === "not"
          ? "not_enrolled"
          : "all",
    unassigned: params.get(PARAM.unassigned) === "1",
    q: params.get(PARAM.q)?.trim() ?? "",
    sort: oneOf(params.get(PARAM.sort), STUDENT_SORTS) ?? "name",
    dir: oneOf(params.get(PARAM.dir), ["asc", "desc"] as const) ?? "asc",
  };
}

export function studentFilterUpdates(
  filters: Partial<StudentFilters>,
): Record<string, string | null> {
  const merged = { ...DEFAULT_STUDENT_FILTERS, ...filters };
  return {
    [PARAM.academicYearId]: merged.academicYearId || null,
    [PARAM.departmentIds]: merged.departmentIds.length
      ? merged.departmentIds.join(",")
      : null,
    [PARAM.yearLevels]: merged.yearLevels.length
      ? merged.yearLevels.join(",")
      : null,
    [PARAM.buckets]: merged.buckets.length ? merged.buckets.join(",") : null,
    [PARAM.stepCode]: merged.stepCode,
    [PARAM.stepState]: merged.stepState,
    [PARAM.enrolled]:
      merged.enrolled === "all"
        ? null
        : merged.enrolled === "enrolled"
          ? "enrolled"
          : "not",
    [PARAM.unassigned]: merged.unassigned ? "1" : null,
    [PARAM.q]: merged.q.trim() || null,
    [PARAM.sort]:
      merged.sort === DEFAULT_STUDENT_FILTERS.sort ? null : merged.sort,
    [PARAM.dir]: merged.dir === DEFAULT_STUDENT_FILTERS.dir ? null : merged.dir,
  };
}

export function activeStudentFilterCount(filters: StudentFilters): number {
  let count = 0;
  if (filters.academicYearId) count += 1;
  if (filters.departmentIds.length) count += 1;
  if (filters.yearLevels.length) count += 1;
  if (filters.buckets.length) count += 1;
  if (filters.stepCode || filters.stepState) count += 1;
  if (filters.enrolled !== "all") count += 1;
  if (filters.unassigned) count += 1;
  if (filters.q.trim()) count += 1;
  return count;
}

export function hasActiveStudentFilters(filters: StudentFilters): boolean {
  return activeStudentFilterCount(filters) > 0;
}

export function selectableDepartmentIds(
  departments: ReadonlyArray<{ id: string; assigned: boolean }>,
  scope: StudentsScope,
): string[] {
  return departments
    .filter((d) => scope === "all" || d.assigned)
    .map((d) => d.id);
}

export type StudentFilterSanitizerInput = {
  filters: StudentFilters;
  scope: StudentsScope;
  departments: ReadonlyArray<{ id: string; assigned: boolean }> | null;
  years: ReadonlyArray<{ id: string }> | null;
};

export function sanitizeStudentFilters({
  filters,
  scope,
  departments,
  years,
}: StudentFilterSanitizerInput): Partial<StudentFilters> | null {
  if (!departments || !years) return null;

  const patch: Partial<StudentFilters> = {};

  if (
    filters.academicYearId &&
    !years.some((year) => year.id === filters.academicYearId)
  ) {
    patch.academicYearId = null;
  }

  if (filters.departmentIds.length > 0) {
    const selectable = new Set(selectableDepartmentIds(departments, scope));
    const kept = filters.departmentIds.filter((id) => selectable.has(id));
    if (kept.length !== filters.departmentIds.length)
      patch.departmentIds = kept;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function nextSortFor(
  column: StudentSort,
  current: { sort: StudentSort; dir: SortDir },
): { sort: StudentSort; dir: SortDir } {
  if (current.sort === column) {
    return { sort: column, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { sort: column, dir: DESC_FIRST_SORTS.has(column) ? "desc" : "asc" };
}

export function sortAria(
  column: StudentSort,
  sort: StudentSort,
  dir: SortDir,
): "ascending" | "descending" | "none" {
  if (column !== sort) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export type StudentFilterInput = {
  scope: StudentsScope;
  academicYearId?: string;
  departmentIds?: string[];
  yearLevels?: YearLevel[];
  buckets?: StudentBucket[];
  steps?: PreEnrollmentStepCode[];
  stepState?: StudentStepState;
  enrolled?: boolean;
  unassigned?: boolean;
  q?: string;
};

export type StudentQueryInput = StudentFilterInput & {
  sort: StudentSort;
  dir: SortDir;
  limit: number;
  cursor?: string;
};

export function buildStudentFilterInput(
  filters: StudentFilters,
  scope: StudentsScope,
): StudentFilterInput {
  const input: StudentFilterInput = { scope };

  if (filters.academicYearId) input.academicYearId = filters.academicYearId;
  if (filters.departmentIds.length) input.departmentIds = filters.departmentIds;
  if (filters.yearLevels.length) input.yearLevels = filters.yearLevels;
  if (filters.buckets.length) input.buckets = filters.buckets;
  if (filters.stepCode) input.steps = [filters.stepCode];
  if (filters.stepState) input.stepState = filters.stepState;
  if (filters.enrolled !== "all")
    input.enrolled = filters.enrolled === "enrolled";
  if (filters.unassigned) input.unassigned = true;
  const q = filters.q.trim();
  if (q) input.q = q;

  return input;
}

export function buildStudentQuery(
  filters: StudentFilters,
  options: { scope: StudentsScope; cursor?: string | null; limit?: number },
): StudentQueryInput {
  const query: StudentQueryInput = {
    ...buildStudentFilterInput(filters, options.scope),
    sort: filters.sort,
    dir: filters.dir,
    limit: options.limit ?? DEFAULT_STUDENT_PAGE_SIZE,
  };

  if (options.cursor) query.cursor = options.cursor;

  return query;
}

export function reminderToast(result: {
  sent: number;
  skipped: number;
}): string {
  const { sent, skipped } = result;
  if (skipped > 0) {
    return sent === 0
      ? `No reminders sent — ${skipped} skipped.`
      : `Reminded ${sent} — ${skipped} skipped.`;
  }
  if (sent === 0) return "No reminders sent.";
  return sent === 1 ? "Reminded 1 student." : `Reminded ${sent} students.`;
}

export function yearLevelLabel(level: string | null): string {
  if (!level) return "—";
  return YEAR_LEVEL_LABELS[level as YearLevel] ?? "—";
}

export function departmentLevelTag(
  departmentCode: string | null,
  level: string | null,
): string {
  if (!departmentCode) return "—";
  if (!level || !YEAR_LEVELS.includes(level as YearLevel))
    return departmentCode;
  return departmentLevelLabel(departmentCode, level as YearLevel);
}

export function stepLabel(code: string): string {
  const names: Record<string, string> = {
    ASSESSMENT: "Assessment",
    SOCIAL_MEDIA: "Social Media",
    PROFILING: "Profiling",
    MUGSHOT: "Mugshot",
    CONSENT: "Consent",
  };
  return names[code] ?? code;
}

export function queueLabel(status: string, waitingPosition?: number): string {
  switch (status) {
    case "WAITING":
      return waitingPosition ? `Waiting #${waitingPosition}` : "Waiting";
    case "IN_PROGRESS":
      return "Serving";
    case "COMPLETED":
      return "Done";
    default:
      return "—";
  }
}
