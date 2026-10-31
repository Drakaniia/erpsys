import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVELS,
  YEAR_LEVEL_LABELS,
  stepLabel,
} from "$lib/domain/constants";
import {
  BUCKET_DEFINITIONS,
  BUCKET_LABELS,
  STUDENT_BUCKETS,
  STEP_STATES,
  STEP_STATE_LABELS,
  type StudentsScope,
} from "$lib/instructor/students";
import type { ReportFilterKey, ReportRole } from "$lib/report/types";

/**
 * The filter vocabulary lives in this component's module script rather than in
 * a `lib/` module because it is only ever consumed by the two things that
 * render it: this bar and the Reports panel. Splitting it out would mean a
 * fifth home for a dozen constants, three of which are lists of labels.
 */

/**
 * One flat bag of control values for every filter any catalogue can declare.
 * Flat because the bar renders a declared key at a time and never needs to
 * know which role a value belongs to; the role only decides which subset is
 * read from the URL and which is written back.
 *
 * `sort` is `field:dir` in a single value so one control can express both,
 * while the URL keeps the console's existing two-param `?sort=`/`?dir=` shape.
 */
export type ReportFilterValue = {
  step: string;
  q: string;
  status: string;
  evidence: string;
  range: string;
  sort: string;
  departments: string[];
  yearLevels: string[];
  buckets: string[];
  stepState: string;
  enrolled: string;
  unassigned: boolean;
  role: string;
  org: string;
  course: string;
  scope: StudentsScope;
};

export const DEFAULT_REPORT_FILTER_VALUE: ReportFilterValue = {
  step: "",
  q: "",
  status: "ALL",
  evidence: "ALL",
  range: "ALL",
  sort: "submittedAt:asc",
  departments: [],
  yearLevels: [],
  buckets: [],
  stepState: "",
  enrolled: "all",
  unassigned: false,
  role: "ALL",
  org: "ALL",
  course: "",
  scope: "mine",
};

/**
 * Per-role defaults for the keys the URL is allowed to omit. Anything equal
 * to its role's default is written as `null` (i.e. removed), so a Reports URL
 * stays as short as the live list's.
 */
export const ROLE_DEFAULTS: Record<ReportRole, ReportFilterValue> = {
  officer: { ...DEFAULT_REPORT_FILTER_VALUE, sort: "submittedAt:asc" },
  instructor: { ...DEFAULT_REPORT_FILTER_VALUE, sort: "name:asc" },
  admin: { ...DEFAULT_REPORT_FILTER_VALUE, sort: "joined:desc" },
  // The student catalogue declares no filters, so this entry exists only to
  // keep the table total over `ReportRole`; nothing in it is ever read.
  student: { ...DEFAULT_REPORT_FILTER_VALUE, sort: "name:asc" },
};

/**
 * The value a role starts from. Always reach for this rather than
 * `DEFAULT_REPORT_FILTER_VALUE` directly: the flat default carries the
 * OFFICER's sort, so an admin built from it would write a `?sort=submittedAt`
 * its own procedure rejects.
 */
export function defaultFilterValueFor(role: ReportRole): ReportFilterValue {
  return { ...ROLE_DEFAULTS[role] };
}

export type FilterControl =
  | "search"
  | "select"
  | "multi"
  | "segmented"
  | "toggle";

/**
 * Which control renders a declared key, and what it is called. This table IS
 * the reason the catalogue is declarative: adding a filter key to a `ReportDef`
 * is all it takes for the bar to grow a labelled, keyboard-reachable control
 * for it. No per-role markup.
 *
 * `controlByRole` overrides `control` for one role, and is read through
 * `reportFilterControl` rather than branched on in the markup. It exists
 * because a key's SHAPE is not the same as its NAME: `yearLevels` is a genuine
 * multi-select for the instructor (`getRosterReport` really takes
 * `yearLevels: YearLevel[]`) and a single select for the admin
 * (`getUserDirectoryReport` takes one `yearLevel`). A multi-select there let
 * the control offer two levels while the query sent one, and the header echoed
 * both -- a wrong number stated accurately (spec 5.4).
 */
export const REPORT_FILTER_CONFIG: Record<
  ReportFilterKey,
  {
    label: string;
    control: FilterControl;
    controlByRole?: Partial<Record<ReportRole, FilterControl>>;
  }
> = {
  step: { label: "Step", control: "select" },
  search: { label: "Search", control: "search" },
  status: { label: "Status", control: "select" },
  evidence: { label: "Evidence", control: "select" },
  range: { label: "Submitted", control: "select" },
  sort: { label: "Sort", control: "select" },
  departments: { label: "Course", control: "multi" },
  yearLevels: {
    label: "Year level",
    control: "multi",
    controlByRole: { admin: "select" },
  },
  buckets: { label: "Status", control: "multi" },
  stepState: { label: "Step state", control: "select" },
  enrolled: { label: "Enrolled", control: "segmented" },
  unassigned: { label: "Unassigned", control: "toggle" },
  role: { label: "Role", control: "select" },
  org: { label: "Organization", control: "select" },
  course: { label: "Course", control: "select" },
  scope: { label: "Scope", control: "segmented" },
};

/** The control a key renders for a role -- the config's per-role override first. */
export function reportFilterControl(
  key: ReportFilterKey,
  role: ReportRole,
): FilterControl {
  const config = REPORT_FILTER_CONFIG[key];
  return config.controlByRole?.[role] ?? config.control;
}

export type ReportDepartment = {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  assigned?: boolean;
};

export type Option = { value: string; label: string; description?: string };

export const STEP_OPTIONS: readonly Option[] = PRE_ENROLLMENT_STEP_CODES.map(
  (code) => ({ value: code, label: stepLabel(code) }),
);

export const STATUS_OPTIONS: readonly Option[] = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "RETURNED", label: "Returned" },
  { value: "VERIFIED", label: "Verified" },
];

export const EVIDENCE_OPTIONS: readonly Option[] = [
  { value: "ALL", label: "Any evidence" },
  { value: "HAS", label: "Has evidence" },
  { value: "NONE", label: "No evidence" },
];

export const RANGE_OPTIONS: readonly Option[] = [
  { value: "ALL", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This academic year" },
];

const OFFICER_SORT_OPTIONS: readonly Option[] = [
  { value: "submittedAt:asc", label: "Submitted (oldest first)" },
  { value: "submittedAt:desc", label: "Submitted (newest first)" },
  { value: "studentName:asc", label: "Student name (A-Z)" },
  { value: "studentName:desc", label: "Student name (Z-A)" },
  { value: "status:asc", label: "Status (A-Z)" },
];

const INSTRUCTOR_SORT_OPTIONS: readonly Option[] = [
  { value: "name:asc", label: "Name (A-Z)" },
  { value: "name:desc", label: "Name (Z-A)" },
  { value: "studentNumber:asc", label: "Student number (lowest)" },
  { value: "stepsVerified:desc", label: "Steps verified (most)" },
  { value: "yearLevel:asc", label: "Year level" },
  { value: "enrolledAt:desc", label: "Enrolled (newest)" },
];

const ADMIN_SORT_OPTIONS: readonly Option[] = [
  { value: "joined:desc", label: "Joined (newest)" },
  { value: "joined:asc", label: "Joined (oldest)" },
  { value: "studentNumber:asc", label: "Student number (lowest)" },
  { value: "name:asc", label: "Name (A-Z)" },
];

export function sortOptionsFor(role: ReportRole): readonly Option[] {
  if (role === "instructor") return INSTRUCTOR_SORT_OPTIONS;
  if (role === "admin") return ADMIN_SORT_OPTIONS;
  return OFFICER_SORT_OPTIONS;
}

export const ROLE_OPTIONS: readonly Option[] = [
  { value: "ALL", label: "All roles" },
  { value: "STUDENT", label: "Student" },
  { value: "SBO_OFFICER", label: "SBO Officer" },
  { value: "ENROLLMENT_ADVISER", label: "Instructor" },
  { value: "ADMIN", label: "Admin" },
];

export const ORG_OPTIONS: readonly Option[] = [
  { value: "ALL", label: "Inside & outside" },
  { value: "INSIDE", label: "Inside org" },
  { value: "OUTSIDE", label: "Outside org" },
];

export const ENROLLED_OPTIONS: readonly Option[] = [
  { value: "all", label: "All" },
  { value: "enrolled", label: "Enrolled" },
  { value: "not_enrolled", label: "Not enrolled" },
];

export const SCOPE_OPTIONS: readonly Option[] = [
  { value: "mine", label: "My departments" },
  { value: "all", label: "All departments" },
];

export const STEP_STATE_OPTIONS: readonly Option[] = STEP_STATES.map(
  (state) => ({
    value: state,
    label: STEP_STATE_LABELS[state],
  }),
);

export const YEAR_LEVEL_OPTIONS: readonly Option[] = YEAR_LEVELS.map(
  (level) => ({
    value: level,
    label: YEAR_LEVEL_LABELS[level],
  }),
);

export const BUCKET_OPTIONS: readonly Option[] = STUDENT_BUCKETS.map(
  (bucket) => ({
    value: bucket,
    label: BUCKET_LABELS[bucket],
    description: BUCKET_DEFINITIONS[bucket],
  }),
);
