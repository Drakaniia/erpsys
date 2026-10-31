import type { UserListItem } from "$lib/domain/types";
import { truncationNotice } from "$lib/domain/report";
import { roleLabel } from "../../auth/role-label";
import {
  EMPTY,
  formatCount,
  formatDate,
  orDash,
  shortYearLevel,
  toWinAnsi,
} from "../format";
import { baseStyles, pageFurniture, simpleTable } from "../furniture";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

// Re-exported, never redefined: the row shape is the server's contract, and
// the UI imports it from this module so it need not reach into `$lib/domain/types`.
export type { UserListItem };

/**
 * The R6 payload as `admin.getUserDirectoryReport` returns it
 * (`apps/server/src/services/admin/report.ts:51-85`). `year` is NULLABLE:
 * the row hydration that fills `department` and `yearLevel` is scoped to a
 * resolved year, so with no year those two are null for every row and print
 * as a dash.
 */
export type UserDirectoryReport = {
  year: { id: string; label: string; semesterLabel: string } | null;
  rows: UserListItem[];
  matchedCount: number;
  truncated: boolean;
};

const HEADER = [
  "#",
  "User",
  "Email",
  "Student No",
  "Role",
  "Org",
  "Course",
  "Year level",
  "Joined",
  "Status",
];

/**
 * Ten columns across a landscape A4 (~233mm of text width). The three `*`
 * columns -- User, Email, Course -- are the free-text ones and take the slack;
 * the rest are pinned to roughly what their content needs, so `#` and `Org`
 * do not stretch a 1,000-row table.
 */
const WIDTHS: (string | number)[] = [24, "*", 150, 62, 62, 42, 78, 46, 52, 44];

function orgLabel(item: UserListItem): string {
  return item.isOutsideOrg ? "Outside" : "Inside";
}

function statusLabel(item: UserListItem): string {
  return item.blocked ? "Blocked" : "Active";
}

/**
 * R6 -- the admin User Directory (spec 6.6).
 *
 * Landscape, ten columns, and a footer line stating how many of the matched
 * rows the printed document actually carries. Every string that reaches the
 * page goes through `toWinAnsi` (spec 7.1); the enum-free `roleLabel` is the
 * same helper R5 uses, so the two admin reports cannot disagree on a role
 * name.
 */
export function buildUserDirectory(
  data: UserDirectoryReport,
  meta: ReportMeta,
): ReportDocDefinition {
  const rows = data.rows.map((item, index) => [
    formatCount(index + 1),
    toWinAnsi(item.name),
    toWinAnsi(item.email),
    orDash(item.studentNumber),
    roleLabel(item.role),
    orgLabel(item),
    item.department ? toWinAnsi(item.department.name) : EMPTY,
    shortYearLevel(item.yearLevel),
    formatDate(item.joinedAt),
    statusLabel(item),
  ]);

  const content: ContentNode[] = [simpleTable(HEADER, rows, WIDTHS)];

  // Never an empty line and never an empty note: `truncationNotice` returns
  // "" for a report that is actually complete, and that case renders nothing.
  content.push({
    text: `${formatCount(rows.length)} of ${formatCount(data.matchedCount)} rows`,
    style: "note",
    margin: [0, 4, 0, 0],
  });

  if (data.truncated) {
    const note = truncationNotice(data.rows.length, data.matchedCount);
    if (note) {
      content.push({
        text: note,
        style: "warning",
        margin: [0, 2, 0, 0],
      });
    }
  }

  return {
    ...pageFurniture(meta, "landscape"),
    styles: baseStyles(),
    content,
  };
}
