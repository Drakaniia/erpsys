/**
 * One meaning per color across every panel on the officer overview:
 * navy is settled work, amber is the pile waiting on the officer, slate is
 * work sent back to students.
 */
export const VERIFIED = "var(--chart-1)";
export const AWAITING = "var(--chart-2)";
export const RETURNED = "var(--chart-3)";
/** Amber dark enough for text (≥4.5:1 on the panel); fills keep `AWAITING`. */
export const AWAITING_INK = "var(--color-warning)";

/** Navy ramp for the clearance rings: lighter at the outer, earlier steps. */
export function ringShade(index: number, count: number): string {
  const strength = count <= 1 ? 100 : Math.round(38 + (62 * index) / (count - 1));
  return `color-mix(in oklab, var(--chart-1) ${strength}%, var(--chart-scale-mix))`;
}

export const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
