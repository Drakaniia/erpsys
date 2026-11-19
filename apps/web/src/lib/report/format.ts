import { YEAR_LEVEL_LABELS } from "$lib/domain/constants";
import type { StudentStepState } from "../instructor/students";

/** The org line printed in the PDF header and footer. */
export const ORG_NAME = "College of Technology - Student Body Organization";

/**
 * The stand-in for an absent value. Hyphen-minus, never an em dash: the
 * standard PDF fonts are WinAnsi-encoded and U+2014 is not in the repertoire.
 */
export const EMPTY = "-";

const TYPOGRAPHIC_MAP: Record<string, string> = {
  "\u2019": "'",
  "\u2018": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2014": "-",
  "\u2013": "-",
  "\u2026": "...",
  "\u2022": "-",
  "\u00A0": " ",
};

/**
 * WinAnsi (cp1252) code points above U+00FF, plus the punctuation the
 * typographic map above would have folded anyway. Everything else outside
 * 0x20-0x7E and 0xA0-0xFF is outside the repertoire and becomes `?`.
 */
const WIN_ANSI_ABOVE_FF = new Set<number>([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6,
  0x02c7, 0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201e, 0x2020,
  0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

function isWinAnsi(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_ABOVE_FF.has(code);
}

/**
 * The single choke point for text safety (spec 5.7 / 7.1). Applied in the
 * row-mapping functions, never in the layout functions.
 */
export function toWinAnsi(value: string | null | undefined): string {
  if (!value) return "";

  let out = "";
  for (const char of value) {
    const mapped = TYPOGRAPHIC_MAP[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    out += isWinAnsi(code) ? char : "?";
  }
  return out;
}

const REPORT_TZ = "Asia/Manila";

const DATE_FORMAT = new Intl.DateTimeFormat("en-PH", {
  timeZone: REPORT_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-PH", {
  timeZone: REPORT_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partOf(
  formatter: Intl.DateTimeFormat,
  date: Date,
  type: string,
): string {
  return (
    formatter.formatToParts(date).find((part) => part.type === type)?.value ??
    ""
  );
}

/** `04 Mar 2026` — always in Asia/Manila, never the viewer's timezone. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  const day = partOf(DATE_FORMAT, date, "day");
  const month = partOf(DATE_FORMAT, date, "month");
  const year = partOf(DATE_FORMAT, date, "year");
  return `${day} ${month} ${year}`;
}

/** `04 Mar 2026, 14:32` — 24-hour, same pinned timezone as `formatDate`. */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return EMPTY;
  const day = partOf(DATE_TIME_FORMAT, date, "day");
  const month = partOf(DATE_TIME_FORMAT, date, "month");
  const year = partOf(DATE_TIME_FORMAT, date, "year");
  const hour = partOf(DATE_TIME_FORMAT, date, "hour");
  const minute = partOf(DATE_TIME_FORMAT, date, "minute");
  return `${day} ${month} ${year}, ${hour}:${minute}`;
}

const COUNT_FORMAT = new Intl.NumberFormat("en-PH");

/** `1,234` */
export function formatCount(n: number): string {
  return COUNT_FORMAT.format(n);
}

export function formatPercent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function orDash(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const trimmed = value.trim();
  return trimmed === "" ? EMPTY : trimmed;
}

/** `1st Year` -> `1st`, derived from the domain labels rather than restated. */
const SHORT_YEAR_LEVELS: Record<string, string> = Object.fromEntries(
  Object.entries(YEAR_LEVEL_LABELS).map(([level, label]) => [
    level,
    label.replace(/\s*Year$/, ""),
  ]),
);

export function shortYearLevel(level: string | null): string {
  if (!level) return EMPTY;
  return SHORT_YEAR_LEVELS[level] ?? EMPTY;
}

/**
 * Abbreviations of `STEP_STATE_LABELS` for the 52pt roster columns (spec
 * 15.6). Every short label is either identical to its long label or an
 * unambiguous truncation of it, so a reader who knows the long labels reads
 * the short ones without a legend. The long labels stay authoritative.
 */
export const SHORT_STATE_LABELS: Record<StudentStepState, string> = {
  MISSING: "Missing",
  PENDING: "Pending",
  SUBMITTED: "Review",
  VERIFIED: "Verified",
  RETURNED: "Returned",
};

/** Queue column, roster width: `-` / `Waiting` / `Serving` / `Done`. */
export const QUEUE_SHORT: Record<string, string> = {
  NONE: EMPTY,
  WAITING: "Waiting",
  IN_PROGRESS: "Serving",
  COMPLETED: "Done",
};

/** Queue column, record sheet width: the human-readable form. */
export const QUEUE_LABELS: Record<string, string> = {
  NONE: "Not in queue",
  WAITING: "Waiting",
  IN_PROGRESS: "Serving",
  COMPLETED: "Completed",
};
