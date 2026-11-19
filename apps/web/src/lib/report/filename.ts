import type { ReportKind, ReportRole } from "./types";

const MANILA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Asia/Manila as `YYYY-MM-DD`. Never `toISOString()`, which is UTC. */
function manilaDate(date: Date | string): string {
  const instant = typeof date === "string" ? new Date(date) : date;
  const parts = MANILA_DATE.formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Lowercase, spaces to hyphens, everything outside `[a-z0-9-]` dropped. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `<role>-<report>-<discriminator>-<YYYY-MM-DD>.pdf`.
 *
 * The discriminator is the step code for the officer step register and the
 * slugified student name for the verification record. When it is absent or
 * reduces to nothing the segment collapses entirely, so there is never a double
 * hyphen.
 */
export function buildReportFilename(input: {
  role: ReportRole;
  reportId: ReportKind;
  discriminator?: string | null;
  date: Date | string;
}): string {
  const discriminator = input.discriminator ? slug(input.discriminator) : "";
  const segments = [
    slug(input.role),
    slug(input.reportId),
    ...(discriminator ? [discriminator] : []),
    manilaDate(input.date),
  ];
  return `${segments.join("-")}.pdf`;
}
