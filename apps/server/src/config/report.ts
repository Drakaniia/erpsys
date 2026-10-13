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

export function truncationNotice(returned: number, matched: number): string {
  if (matched <= REPORT_ROW_CAP) return "";
  return `Showing ${countFormat.format(returned)} of ${countFormat.format(matched)} rows - narrow your filters.`;
}
