import { roleLabel } from "../../auth/role-label";
import { formatCount, formatDateTime, toWinAnsi } from "../format";
import {
  baseStyles,
  pageFurniture,
  sectionTitle,
  simpleTable,
} from "../furniture";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

/**
 * The subset of `admin.getOverview` that R5 reads
 * (`apps/server/src/services/admin/overview.ts`). Declared structurally
 * rather than inferred from the oRPC output, so the builder stays a pure
 * function over JSON and the server contract can move without a rebuild of
 * the report layer. The full overview satisfies this type.
 */
export type EnrollmentSummaryData = {
  roleCounts: {
    STUDENT: number;
    SBO_OFFICER: number;
    ENROLLMENT_ADVISER: number;
    ADMIN: number;
  };
  stepTotals: Array<{
    code: string;
    name: string;
    order: number;
    verified: number;
  }>;
  departmentTallies: Array<{
    departmentId: string;
    name: string;
    code: string;
    waiting: number;
    enrolled: number;
  }>;
  recentActivity: Array<{
    id: string;
    actorName: string;
    action: string;
    targetRef: string;
    at: string;
  }>;
};

/**
 * The four roles in the order the summary reads best, paired with the human
 * label `roleLabel` already prints everywhere in the UI. The enum key is what
 * the payload carries; the label is what a reader of the PDF needs (spec 6.5).
 */
const ROLE_ROWS: ReadonlyArray<keyof EnrollmentSummaryData["roleCounts"]> = [
  "STUDENT",
  "SBO_OFFICER",
  "ENROLLMENT_ADVISER",
  "ADMIN",
];

const HEADER = ["Role", "Users"];
const STEP_HEADER = ["Step", "Verified"];
const DEPARTMENT_HEADER = [
  "Department",
  "Code",
  "Waiting",
  "Enrolled",
  "Total",
];
const ACTIVITY_HEADER = ["When", "Actor", "Action", "Target"];

/**
 * R5 -- the admin Enrollment & Completion Summary (spec 6.5, sketch 15.7).
 *
 * Portrait, four sections, no filters: `meta.filterEcho` is null so the
 * furniture omits its filter line entirely (spec 5.6). Everything the document
 * prints comes from the already-loaded admin overview, so generating it costs
 * no extra round trip.
 */
export function buildEnrollmentSummary(
  overview: EnrollmentSummaryData,
  meta: ReportMeta,
): ReportDocDefinition {
  const content: ContentNode[] = [
    sectionTitle("Users by role"),
    simpleTable(
      HEADER,
      ROLE_ROWS.map((role) => [
        roleLabel(role),
        formatCount(overview.roleCounts[role]),
      ]),
      ["*", 70],
    ),

    sectionTitle("Verification totals by step"),
    simpleTable(
      STEP_HEADER,
      overview.stepTotals.map((step) => [
        toWinAnsi(step.name),
        formatCount(step.verified),
      ]),
      ["*", 70],
    ),

    sectionTitle("Enrollment by department"),
    simpleTable(
      DEPARTMENT_HEADER,
      overview.departmentTallies.map((tally) => [
        toWinAnsi(tally.name),
        toWinAnsi(tally.code),
        formatCount(tally.waiting),
        formatCount(tally.enrolled),
        // `Total` is computed here, not read: a sum the server already knows
        // but does not return is cheaper to add in the report than to thread
        // through the overview contract (spec 15.7).
        formatCount(tally.waiting + tally.enrolled),
      ]),
      ["*", 55, 55, 55, 50],
    ),

    sectionTitle("Recent admin activity"),
    simpleTable(
      ACTIVITY_HEADER,
      overview.recentActivity.map((entry) => [
        formatDateTime(entry.at),
        toWinAnsi(entry.actorName),
        toWinAnsi(entry.action),
        toWinAnsi(entry.targetRef),
      ]),
      [80, "*", "*", "*"],
    ),
  ];

  return {
    ...pageFurniture(meta, "portrait"),
    styles: baseStyles(),
    content,
  };
}
