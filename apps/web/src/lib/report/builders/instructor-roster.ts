import { PRE_ENROLLMENT_STEP_CODES, YEAR_LEVELS } from "$lib/domain/constants";
import type {
  RosterRow,
  RosterStats,
  RosterStepState,
} from "$lib/domain/types";
import { truncationNotice } from "$lib/domain/report";
import { BUCKET_LABELS, STUDENT_BUCKETS } from "../../instructor/students";
import {
  EMPTY,
  QUEUE_SHORT,
  SHORT_STATE_LABELS,
  formatCount,
  formatDate,
  orDash,
  shortYearLevel,
  toWinAnsi,
} from "../format";
import {
  baseStyles,
  pageFurniture,
  sectionTitle,
  simpleTable,
} from "../furniture";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

/**
 * R4 (spec 6.4 / 15.6). The payload is `instructor.getRosterReport` verbatim.
 * `stats` is aggregated over the SAME capped `rows` the table prints, so the
 * funnel, the course tables and the roster always describe one set of students
 * even when the 1,000-row cap bit -- the document then says so in amber
 * beneath the table (spec 5.12).
 */
export type RosterReport = {
  year: { id: string; label: string; semesterLabel: string };
  rows: RosterRow[];
  stats: RosterStats;
  matchedCount: number;
  truncated: boolean;
};

export type { RosterRow, RosterStats } from "$lib/domain/types";

/**
 * The five step-column headings. Hard-coded rather than taken from
 * `STEP_NAMES`, because the domain label for CONSENT is "Consent / Medical" and
 * the column is ~40pt wide -- the same width-driven abbreviation that
 * `SHORT_STATE_LABELS` exists for, with the long labels staying authoritative
 * elsewhere. The five step CELLS are derived from `PRE_ENROLLMENT_STEP_CODES`
 * in the same order, so the two can never drift apart.
 */
const STEP_COLUMN_LABELS: Record<string, string> = {
  ASSESSMENT: "Assessment",
  SOCIAL_MEDIA: "Social Media",
  PROFILING: "Profiling",
  MUGSHOT: "Mugshot",
  CONSENT: "Consent",
};

/** Thirteen columns -- the documented maximum for this layout (spec 15.6). */
const ROSTER_HEADERS = [
  "#",
  "Student No",
  "Student",
  "Course",
  "Yr",
  ...PRE_ENROLLMENT_STEP_CODES.map((code) => STEP_COLUMN_LABELS[code] ?? code),
  "Steps",
  "Queue",
  "Enrolled at",
];

const ROSTER_WIDTHS = [20, 52, "*", 46, 22, 44, 48, 42, 40, 40, 30, 42, 56];

/**
 * `RosterRow` carries ONE array of per-step states, keyed by step code --
 * `row.stepStates: { code, status }[]` -- not a field per step. This is the
 * single place that lookup lives. A step absent from the array reads MISSING,
 * which is what `classifyStudent` backfills on the server too.
 */
export function stateOf(row: RosterRow, code: string): RosterStepState {
  return row.stepStates.find((s) => s.code === code)?.status ?? "MISSING";
}

function shortState(row: RosterRow, code: string): string {
  return SHORT_STATE_LABELS[stateOf(row, code)] ?? EMPTY;
}

function head(text: string): ContentNode {
  return { text, style: "th" };
}

function cell(text: string): ContentNode {
  return { text, style: "td" };
}

export function buildRosterReport(
  data: RosterReport,
  meta: ReportMeta,
): ReportDocDefinition {
  const { rows, stats } = data;

  // Funnel: the four buckets as a one-row strip, labels as the header.
  const funnel = {
    ...simpleTable(
      STUDENT_BUCKETS.map((bucket) => BUCKET_LABELS[bucket]),
      [
        STUDENT_BUCKETS.map((bucket) =>
          formatCount(stats.distribution[bucket] ?? 0),
        ),
      ],
      ["*", "*", "*", "*"],
    ),
    fontSize: 7.5,
  };

  // By course, in byCourse's own order -- unassigned already sorts last.
  const byCourse = {
    ...simpleTable(
      ["Course", "Code", "Students"],
      stats.byCourse.map((course) => [
        toWinAnsi(course.departmentName ?? "Unassigned"),
        toWinAnsi(orDash(course.departmentCode)),
        formatCount(course.count),
      ]),
      ["*", 70, 70],
    ),
    fontSize: 7.5,
  };

  // By course and year level: one column per YEAR_LEVELS entry, plus a total.
  // The headings abbreviate through the SHARED `shortYearLevel`, the same call
  // the roster's `Yr` cells make -- a second local copy of that rule would let
  // a domain label change desynchronise the heading from the column.
  const byLevel = {
    ...simpleTable(
      ["Course", ...YEAR_LEVELS.map((level) => shortYearLevel(level)), "Total"],
      stats.byCourseYearLevel.map((course) => [
        toWinAnsi(course.departmentName),
        ...YEAR_LEVELS.map((level) => formatCount(course.counts[level] ?? 0)),
        formatCount(course.total),
      ]),
      ["*", 40, 40, 40, 40, 40, 50],
    ),
    fontSize: 7.5,
  };

  const roster: ContentNode = {
    table: {
      // Thirteen columns, header repeated on every continuation page.
      headerRows: 1,
      dontBreakRows: true,
      widths: ROSTER_WIDTHS,
      body: [
        ROSTER_HEADERS.map(head),
        ...rows.map((row, index) =>
          [
            String(index + 1),
            orDash(row.studentNumber),
            toWinAnsi(row.studentName),
            row.departmentCode ? toWinAnsi(row.departmentCode) : "Unassigned",
            shortYearLevel(row.yearLevel),
            ...PRE_ENROLLMENT_STEP_CODES.map((code) => shortState(row, code)),
            `${row.stepsVerified}/${row.stepsTotal}`,
            QUEUE_SHORT[row.queueStatus] ?? EMPTY,
            formatDate(row.enrolledAt),
          ].map(cell),
        ),
      ],
    },
    fontSize: 6.5,
  };

  const content: ContentNode[] = [
    sectionTitle("Funnel"),
    funnel,
    sectionTitle("By course"),
    byCourse,
    sectionTitle("By course and year level"),
    byLevel,
    // The roster always starts a fresh page.
    { text: "", pageBreak: "after" },
    sectionTitle("Roster"),
    roster,
    {
      text: `${formatCount(rows.length)} of ${formatCount(data.matchedCount)} students`,
      style: "note",
      margin: [0, 6, 0, 0],
    },
  ];

  // The server owns the truncation sentence, and it is only present when the
  // cap actually bit -- `truncationNotice` returns "" otherwise.
  if (data.truncated) {
    const note = truncationNotice(rows.length, data.matchedCount);
    if (note)
      content.push({ text: note, style: "warning", margin: [0, 4, 0, 0] });
  }

  return {
    ...pageFurniture(meta, "landscape"),
    styles: baseStyles(),
    content,
  };
}
