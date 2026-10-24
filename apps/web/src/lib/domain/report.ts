/**
 * Copied from `apps/server/src/config/report.ts` when the web stopped importing
 * server code: the row-cap sentence must read identically on both sides.
 */

/** Reports stay printable: past this many rows the caller must narrow. */
export const REPORT_ROW_CAP = 1000;

export type CappedRows<T> = {
  rows: T[];
  matchedCount: number;
  truncated: boolean;
};

const countFormat = new Intl.NumberFormat("en-US");

export function capRows<T>(rows: T[]): CappedRows<T> {
  if (rows.length <= REPORT_ROW_CAP) {
    return { rows, matchedCount: rows.length, truncated: false };
  }
  return {
    rows: rows.slice(0, REPORT_ROW_CAP),
    matchedCount: rows.length,
    truncated: true,
  };
}

// Truncation is defined as `matched > REPORT_ROW_CAP`, matching capRows: a report that fills the cap
// exactly is complete and says nothing.
export function truncationNotice(returned: number, matched: number): string {
  if (matched <= REPORT_ROW_CAP) return "";
  return `Showing ${countFormat.format(returned)} of ${countFormat.format(matched)} rows - narrow your filters.`;
}
