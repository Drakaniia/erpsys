import type { ReportKind } from "$lib/report/types";

/**
 * The table headings shown above the count line, so a zero-match result reads
 * as "this report has no rows for these filters" rather than as a broken
 * panel (spec 5.17). The strings match the builder's own column headings; a
 * report kind with no rowset -- the two summaries and the record sheet --
 * declares an empty list and renders no table at all.
 */
export const REPORT_PREVIEW_COLUMNS: Record<ReportKind, readonly string[]> = {
  record: [],
  "step-summary": [],
  "step-register": [
    "#",
    "Student No",
    "Student",
    "Status",
    "Submitted",
    "Verified",
    "Evidence",
    "Replied",
  ],
  roster: [
    "#",
    "Student No",
    "Student",
    "Course",
    "Yr",
    "Assessment",
    "Social Media",
    "Profiling",
    "Mugshot",
    "Consent",
    "Steps",
    "Queue",
    "Enrolled at",
  ],
  "enrollment-summary": [],
  "user-directory": [
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
  ],
};
