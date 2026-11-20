import { relativeTime as format } from "../src/lib/officer/format";
export { absoluteTime, initials } from "../src/lib/officer/format";
export const campusNow = Date.parse("2026-08-17T01:20:00Z");
export const relativeTime = (iso: string) => format(iso, campusNow);
