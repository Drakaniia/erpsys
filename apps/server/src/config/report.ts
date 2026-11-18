export const REPORT_ROW_CAP = 1000;

type CappedRows<T> = {
  rows: T[];
  matchedCount: number;
  truncated: boolean;
};


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

