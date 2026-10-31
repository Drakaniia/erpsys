export type ReportRole = "officer" | "instructor" | "admin" | "student";

export type Orientation = "portrait" | "landscape";

export type ReportKind =
  | "record"
  | "step-summary"
  | "step-register"
  | "roster"
  | "enrollment-summary"
  | "user-directory";

/**
 * A pdfmake content node, kept structural on purpose. `ReportDocDefinition` is a
 * LOCAL structural type rather than an import from pdfmake, so builders stay
 * decoupled from the engine and the engine can be loaded lazily (pdf.ts).
 */
export type ContentNode = Record<string, unknown>;

export type ReportDocDefinition = {
  pageSize: "A4";
  pageOrientation: Orientation;
  pageMargins: [number, number, number, number];
  /**
   * The font every node that names none is laid out in. pdfmake's own fallback
   * is `Roboto`, whose TTF this app deliberately does not ship (spec 5.7) --
   * only the Helvetica AFMs are registered (`pdf.ts`). A document that leaves
   * this out fails on its first line with `File 'Roboto-Regular.ttf' not found
   * in virtual file system`, so naming the registered family here is what makes
   * the document renderable at all.
   */
  defaultStyle: { font: string; fontSize: number };
  header: (currentPage: number, pageCount: number) => ContentNode;
  footer: (currentPage: number, pageCount: number) => ContentNode;
  info: { title: string; author: string };
  /**
   * The named styles every report body references (`section`, `th`, `td`,
   * `note`, `warning`), supplied by `baseStyles()` in `furniture.ts`. Declared
   * here rather than re-narrowed per builder: without the key the document is
   * incomplete and `createPdf` throws on an unresolvable style reference.
   */
  styles: Record<string, Record<string, unknown>>;
  content: ContentNode[];
};

export type ReportMeta = {
  title: string;
  generatedBy: string;
  generatedOn: string;
  yearLabel: string;
  semester: string;
  filterEcho: string | null;
  matchedCount?: number;
  returnedCount?: number;
  truncated?: boolean;
  /**
   * A short self-service note printed at the end of a report when it is the
   * subject's own copy rather than an institution-issued one (D12). Rendered
   * only when present, so console output is unchanged.
   */
  authenticityNote?: string | null;
};

/** The filter controls a report can expose, keyed to the URL params that drive it. */
export type ReportFilterKey =
  | "step"
  | "search"
  | "status"
  | "evidence"
  | "range"
  | "sort"
  | "departments"
  | "yearLevels"
  | "buckets"
  | "stepState"
  | "enrolled"
  | "unassigned"
  | "role"
  | "org"
  | "course"
  | "scope";

export type ReportDef = {
  kind: ReportKind;
  role: ReportRole;
  label: string;
  description: string;
  orientation: Orientation;
  filters: ReportFilterKey[];
  needsStudentPicker: boolean;
};

export const OFFICER_REPORTS: ReportDef[] = [
  {
    kind: "record",
    role: "officer",
    label: "Student Verification Record",
    description:
      "The full verification record for one or more students, covering their details, enrollment, and every step.",
    orientation: "portrait",
    filters: [],
    needsStudentPicker: true,
  },
  {
    kind: "step-summary",
    role: "officer",
    label: "Step Status Summary",
    description:
      "A quick count of how many students are verified and unverified at each step of the checklist.",
    orientation: "portrait",
    filters: [],
    needsStudentPicker: false,
  },
  {
    kind: "step-register",
    role: "officer",
    label: "Step Verification Register",
    description:
      "A detailed list of every student at a single step, with their status, evidence, and reply history.",
    orientation: "landscape",
    filters: ["step", "search", "status", "evidence", "range", "sort"],
    needsStudentPicker: false,
  },
];

export const INSTRUCTOR_REPORTS: ReportDef[] = [
  {
    kind: "record",
    role: "instructor",
    label: "Student Verification Record",
    description:
      "The full verification record for one or more students, covering their details, enrollment, and every step.",
    orientation: "portrait",
    filters: [],
    needsStudentPicker: true,
  },
  {
    kind: "roster",
    role: "instructor",
    label: "Roster & Progress",
    description:
      "Your advisees with their progress through the checklist, plus the totals behind the roster you see on screen.",
    orientation: "landscape",
    filters: [
      "departments",
      "yearLevels",
      "buckets",
      "step",
      "stepState",
      "enrolled",
      "unassigned",
      "search",
      "sort",
      "scope",
    ],
    needsStudentPicker: false,
  },
];

export const ADMIN_REPORTS: ReportDef[] = [
  {
    kind: "record",
    role: "admin",
    label: "Student Verification Record",
    description:
      "The full verification record for one or more students, covering their details, enrollment, and every step.",
    orientation: "portrait",
    filters: [],
    needsStudentPicker: true,
  },
  {
    kind: "enrollment-summary",
    role: "admin",
    label: "Enrollment & Completion Summary",
    description:
      "How many students are enrolled and completing each step this term, broken down by department.",
    orientation: "portrait",
    filters: [],
    needsStudentPicker: false,
  },
  {
    kind: "user-directory",
    role: "admin",
    label: "User Directory",
    description:
      "A list of everyone with an account, with their role, organisation, and course.",
    orientation: "landscape",
    filters: ["search", "role", "org", "course", "yearLevels", "sort"],
    needsStudentPicker: false,
  },
];

/**
 * The student's own catalogue (D13): one entry, the same R1 record sheet the
 * consoles build. It is not a console surface -- there is no Reports panel and
 * no student picker -- but routing the download through the same catalogue is
 * what gives the student the one filename convention and the one error path.
 */
export const STUDENT_REPORTS: ReportDef[] = [
  {
    kind: "record",
    role: "student",
    label: "Student Verification Record",
    description:
      "Your full verification record, covering your details, enrollment, and every step.",
    orientation: "portrait",
    filters: [],
    needsStudentPicker: false,
  },
];

export function reportsForRole(role: ReportRole): ReportDef[] {
  if (role === "officer") return OFFICER_REPORTS;
  if (role === "instructor") return INSTRUCTOR_REPORTS;
  if (role === "student") return STUDENT_REPORTS;
  return ADMIN_REPORTS;
}
