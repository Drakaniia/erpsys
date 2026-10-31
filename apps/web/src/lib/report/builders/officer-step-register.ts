import { stepLabel } from "$lib/domain/constants";
import { truncationNotice } from "$lib/domain/report";
import type { StepRegisterRow } from "$lib/domain/types";
import { STEP_STATE_LABELS } from "../../instructor/students";
import {
  EMPTY,
  formatCount,
  formatDateTime,
  orDash,
  toWinAnsi,
} from "../format";
import { baseStyles, pageFurniture } from "../furniture";
import type { ContentNode, ReportDocDefinition, ReportMeta } from "../types";

export type { StepRegisterRow } from "$lib/domain/types";

/**
 * R3 - the Step Verification Register (spec 6.3 / 15.5). Landscape, one capped
 * table: a lead line naming the step, eight columns, and a footer count with
 * the truncation sentence when the cap bit.
 *
 * The row type is the server's own `stepRegisterRowSchema` inference, reached
 * through the export map -- the web app does not restate the row shape. This
 * builder takes data and returns a plain object; it never imports pdfmake,
 * `$lib` or `$app` (spec 7.6).
 */
export type StepRegisterReport = {
  year: { id: string; label: string; semesterLabel: string };
  step: { code: string; name: string };
  rows: StepRegisterRow[];
  matchedCount: number;
  truncated: boolean;
};

const HEADERS = [
  "#",
  "Student No",
  "Student",
  "Status",
  "Submitted",
  "Verified",
  "Evidence",
  "Replied",
];

/** Eight columns across the A4 landscape text column (~735pt usable). */
const WIDTHS: (string | number)[] = [22, 62, "*", 58, 66, 66, 44, 40];

/** The single choke point for text in this builder: WinAnsi-safe, never empty. */
function text(value: string | null | undefined): string {
  return orDash(toWinAnsi(value));
}

/**
 * The Status column prints the human label, never the raw enum. A register a
 * registrar reads must not say `SUBMITTED` (spec 6.3): the same map the officer
 * console's status chips and the instructor roster use, so the printed column
 * and the screen cannot disagree. An officer status is a subset of
 * `StudentStepState`, so the lookup is total; a status the console adds later
 * falls through to its own text rather than to a blank cell.
 */
function statusLabel(status: StepRegisterRow["status"]): string {
  const label = STEP_STATE_LABELS[status];
  return label ? toWinAnsi(label) : toWinAnsi(status);
}

function registerTable(rows: StepRegisterRow[]): ContentNode {
  const body: ContentNode[][] = [
    HEADERS.map((label) => ({ text: label, style: "th" })),
    ...rows.map((row, index): ContentNode[] => [
      { text: String(index + 1), style: "td" },
      { text: text(row.student.studentNumber), style: "td" },
      { text: toWinAnsi(row.student.name), style: "td" },
      { text: statusLabel(row.status), style: "td" },
      { text: formatDateTime(row.submittedAt), style: "td" },
      { text: formatDateTime(row.verifiedAt), style: "td" },
      // A count, never an image and never a URL (spec 5.3).
      { text: String(row.evidenceCount), style: "td" },
      { text: row.hasReply ? "Yes" : EMPTY, style: "td" },
    ]),
  ];

  return {
    table: {
      // The header repeats on every continuation page, which is the whole point
      // of a register that can be a thousand rows. `headerRows` is the COUNT
      // pdfmake repeats; the sketch's `headerRow: true` did nothing.
      headerRows: 1,
      dontBreakRows: true,
      widths: WIDTHS,
      body,
    },
  };
}

export function buildStepRegister(
  data: StepRegisterReport,
  meta: ReportMeta,
): ReportDocDefinition {
  const returned = data.rows.length;
  const matched = data.matchedCount;

  const content: ContentNode[] = [
    {
      text: `Step: ${toWinAnsi(stepLabel(data.step.code))}   |   ${formatCount(matched)} submission(s)`,
      fontSize: 10,
      bold: true,
      margin: [0, 0, 0, 6],
    },
    registerTable(data.rows),
    {
      text: `${formatCount(returned)} of ${formatCount(matched)} rows`,
      style: "note",
      margin: [0, 6, 0, 0],
    },
  ];

  // The server owns the sentence, and it is empty when the cap did not bite --
  // so a note node is only ever created when there is a sentence to print.
  const note = data.truncated ? truncationNotice(returned, matched) : "";
  if (note) {
    content.push({ text: note, style: "warning", margin: [0, 2, 0, 0] });
  }

  return {
    ...pageFurniture(meta, "landscape"),
    styles: baseStyles(),
    content,
  };
}
