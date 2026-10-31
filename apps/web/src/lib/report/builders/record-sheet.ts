import {
  STEP_CODES,
  YEAR_LEVEL_LABELS,
  stepLabel,
} from "$lib/domain/constants";
import type { StudentRecord, StudentRecordStep } from "$lib/domain/types";
import { STEP_STATE_LABELS } from "../../instructor/students";
import {
  EMPTY,
  QUEUE_LABELS,
  formatDate,
  formatDateTime,
  orDash,
  toWinAnsi,
} from "../format";
import {
  baseStyles,
  keyValueGrid,
  pageFurniture,
  sectionTitle,
} from "../furniture";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

export type { StudentRecord } from "$lib/domain/types";

/**
 * R1 - the Student Verification Record, identical in all three consoles
 * (spec 5.18 / 6.1). Portrait, one page per student, four sections:
 *
 *   1. Student                     (label/value grid)
 *   2. Academic year & enrollment  (label/value grid)
 *   3. Verification steps          (nine-column table, all six steps, always)
 *   4. Queue & enrollment          (label/value grid)
 *
 * This builder takes records and returns a plain object. It never imports
 * pdfmake, `$lib` or `$app` (spec 7.6).
 */

const NOT_ENROLLED = "Not enrolled";
const NOT_IN_QUEUE = "Not in queue";

const STEP_HEADERS = [
  "Step",
  "Status",
  "Submitted",
  "Verified",
  "Verified by",
  "Returned",
  "Returned by",
  "Evidence files",
  "Officer reply",
];

/**
 * Step name and officer reply take the slack; the date and status columns are
 * sized by their content. Nine columns in a portrait text column, so the two
 * free-text columns cannot both be `auto`.
 */
const STEP_WIDTHS: (string | number)[] = [
  "*",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "auto",
  "*",
];

/** The single choke point for text in this builder: WinAnsi-safe, never empty. */
function text(value: string | null | undefined): string {
  return orDash(toWinAnsi(value));
}

function yearLevelLabel(level: string): string {
  return (
    (YEAR_LEVEL_LABELS as Record<string, string>)[level] ?? toWinAnsi(level)
  );
}

/** `Information Technology (BSIT)`, or the absent form. Never an empty `()`. */
function courseLabel(enrollment: StudentRecord["enrollment"]): string {
  if (!enrollment) return NOT_ENROLLED;
  const name = toWinAnsi(enrollment.departmentName);
  const code = toWinAnsi(enrollment.departmentCode);
  if (!name) return code || NOT_ENROLLED;
  return code ? `${name} (${code})` : name;
}

/**
 * An unknown queue status falls through to its own text rather than to a
 * blank cell -- a status the console has added should still be readable here.
 */
function queueStatusLabel(queue: StudentRecord["queue"]): string {
  if (!queue) return NOT_IN_QUEUE;
  const status = toWinAnsi(queue.status);
  const label = QUEUE_LABELS[status] ?? status;
  return label || NOT_IN_QUEUE;
}

/**
 * `enrolledAt` is populated from the queue completion or the ENROLLMENT step
 * even when there is no enrollment document, so enrollment status is either
 * signal, not `enrollment !== null` alone.
 */
function isEnrolled(record: StudentRecord): boolean {
  return record.enrollment !== null || record.enrolledAt !== null;
}

/**
 * The assembler already emits one step per `STEP_CODES` entry, `MISSING`
 * included. This is the same shape for a step that never arrived, so the
 * section is six rows whatever the payload looks like (spec 6.1).
 */
function missingStep(code: (typeof STEP_CODES)[number]): StudentRecordStep {
  return {
    code,
    status: "MISSING",
    submittedAt: null,
    verifiedAt: null,
    verifiedByName: null,
    respondedAt: null,
    respondedByName: null,
    evidenceCount: 0,
    replyChips: [],
    replyNote: null,
  };
}

/** One row per `STEP_CODES` entry, in `STEP_CODES` order. Never filtered. */
function stepRows(steps: StudentRecord["steps"]): ContentNode[][] {
  const byCode = new Map(steps.map((step) => [step.code, step] as const));
  return STEP_CODES.map((code) =>
    stepRow(byCode.get(code) ?? missingStep(code)),
  );
}

function stepRow(step: StudentRecordStep): ContentNode[] {
  // Chips then the free-text note, one cell. `text()` folds the join through
  // toWinAnsi and falls back to "-" when the officer wrote nothing.
  const reply = text(
    [...step.replyChips, step.replyNote].filter(Boolean).join("; "),
  );

  return [
    { text: toWinAnsi(stepLabel(step.code)), style: "td" },
    { text: STEP_STATE_LABELS[step.status], style: "td" },
    { text: formatDateTime(step.submittedAt), style: "td" },
    { text: formatDateTime(step.verifiedAt), style: "td" },
    { text: text(step.verifiedByName), style: "td" },
    { text: formatDate(step.respondedAt), style: "td" },
    { text: text(step.respondedByName), style: "td" },
    { text: String(step.evidenceCount), style: "td" },
    { text: reply, style: "td" },
  ];
}

function stepTable(steps: StudentRecord["steps"]): ContentNode {
  return {
    table: {
      // `headerRows: 1`, not `headerRow: true`: pdfmake counts the rows to
      // repeat, and the flag the sketch used is silently ignored.
      headerRows: 1,
      dontBreakRows: true,
      widths: STEP_WIDTHS,
      body: [
        STEP_HEADERS.map((label) => ({ text: label, style: "th" })),
        ...stepRows(steps),
      ],
    },
  };
}

/**
 * `startsPage` is true for every record after the first, so the break sits
 * BEFORE records 2..n rather than after each one. A trailing `pageBreak:
 * "after"` on the last record would leave pdfmake a blank final page in a
 * batch; a leading one is the number of breaks that separates the records.
 */
function recordContent(
  record: StudentRecord,
  startsPage: boolean,
): ContentNode[] {
  const enrolled = isEnrolled(record);

  return [
    ...(startsPage ? [{ text: "", pageBreak: "before" }] : []),
    {
      text: toWinAnsi(record.student.name),
      fontSize: 14,
      bold: true,
      margin: [0, 0, 0, 2],
    },
    {
      text: `AY ${toWinAnsi(record.year.label)} - ${toWinAnsi(record.year.semesterLabel)}`,
      fontSize: 9,
      color: "#555",
      margin: [0, 0, 0, 4],
    },

    sectionTitle("Student"),
    keyValueGrid([
      ["Full name", toWinAnsi(record.student.name)],
      ["Student number", text(record.student.studentNumber)],
      ["Email", text(record.student.email)],
      ["Course", courseLabel(record.enrollment)],
      [
        "Year level",
        text(
          record.enrollment
            ? yearLevelLabel(record.enrollment.yearLevel)
            : EMPTY,
        ),
      ],
      ["Outside organisation", record.student.isOutsideOrg ? "Yes" : "No"],
      ["Account created", formatDate(record.student.createdAt)],
    ]),

    sectionTitle("Academic year & enrollment"),
    keyValueGrid([
      [
        "Academic year",
        `AY ${toWinAnsi(record.year.label)} - ${toWinAnsi(record.year.semesterLabel)}`,
      ],
      ["Enrolled", enrolled ? "Yes" : "No"],
      ["Course", courseLabel(record.enrollment)],
      [
        "Year level",
        record.enrollment
          ? yearLevelLabel(record.enrollment.yearLevel)
          : NOT_ENROLLED,
      ],
    ]),

    sectionTitle("Verification steps"),
    stepTable(record.steps),

    sectionTitle("Queue & enrollment"),
    keyValueGrid([
      ["Queue status", queueStatusLabel(record.queue)],
      ["Joined at", formatDateTime(record.queue?.joinedAt)],
      ["Serving started", formatDateTime(record.queue?.servedAt)],
      ["Completed at", formatDateTime(record.queue?.completedAt)],
      ["Served by", text(record.queue?.servedByName)],
      ["Enrolled at", formatDateTime(record.enrolledAt)],
    ]),
  ];
}

export function buildRecordSheet(
  records: StudentRecord[],
  meta: ReportMeta,
): ReportDocDefinition {
  return {
    ...pageFurniture(meta, "portrait"),
    styles: baseStyles(),
    // One student per page in a batch: records 2..n each open a fresh page, so
    // a single-student export carries no break at all and a two-student export
    // exactly one.
    content: [
      ...records.flatMap((record, index) => recordContent(record, index > 0)),
      // The self-service note (D12) closes the document, once, after every
      // record. Absent for every console copy, so their output is unchanged.
      ...(meta.authenticityNote
        ? [
            {
              text: toWinAnsi(meta.authenticityNote),
              fontSize: 7.5,
              color: "#888",
              margin: [0, 12, 0, 0],
            },
          ]
        : []),
    ],
  };
}
