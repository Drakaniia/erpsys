import type { ScheduleSummary } from "$lib/domain/types";

const TZ = "Asia/Manila";
const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});
const weekday = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export function scheduleLine(
  schedule: ScheduleSummary | null | undefined,
  now: number = Date.now(),
): string {
  if (schedule?.current) {
    return `Office hours now until ${clock.format(new Date(schedule.current.endsAt))}`;
  }
  const next = schedule?.next;
  if (!next) return "No office hours posted";
  const start = new Date(next.startsAt);
  const day =
    dayKey.format(start) === dayKey.format(now)
      ? "Today"
      : weekday.format(start);
  return `Next office hours: ${day} ${clock.format(start)} – ${clock.format(new Date(next.endsAt))}`;
}
