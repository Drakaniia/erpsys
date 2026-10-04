import { ApiError } from "./errors.js";

export const SCHEDULE_TZ = "Asia/Manila";
export const SLOT_MINUTES = 30;
export const MAX_WINDOWS_PER_DEPARTMENT = 30;
export const SCHEDULE_HORIZON_DAYS = 14;

const OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type WindowKind = "WEEKLY" | "EXTRA" | "CANCEL";

export type ScheduleWindow = {
  kind: WindowKind;
  weekday?: number;
  date?: string;
  startMinute?: number;
  endMinute?: number;
};

export type OwnedWindow = ScheduleWindow & { adviserId: string };

export type Interval = { startMs: number; endMs: number };

export type ScheduleSummary = {
  current: { startsAt: string; endsAt: string } | null;
  next: { startsAt: string; endsAt: string } | null;
};

export function manilaDate(ms: number): string {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function dateAtMinute(date: string, minute: number): number {
  return Date.parse(`${date}T00:00:00Z`) + minute * 60_000 - OFFSET_MS;
}

export function firstDateOnOrAfter(date: string, weekday: number): string {
  return addDays(date, (weekday - isoWeekday(date) + 7) % 7);
}

export function clock(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function validDate(date: string | undefined): date is string {
  return (
    typeof date === "string" &&
    DATE_RE.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    addDays(date, 0) === date
  );
}

function sameDay(a: ScheduleWindow, b: ScheduleWindow, cancelled: Set<string>) {
  if (a.kind === b.kind) {
    return a.kind === "WEEKLY"
      ? a.weekday === b.weekday
      : a.date === b.date;
  }
  const weekly = a.kind === "WEEKLY" ? a : b;
  const extra = a.kind === "WEEKLY" ? b : a;
  return (
    isoWeekday(extra.date!) === weekly.weekday && !cancelled.has(extra.date!)
  );
}

export function validateWindows(rows: ScheduleWindow[]): void {
  if (rows.length > MAX_WINDOWS_PER_DEPARTMENT) {
    throw new ApiError("BAD_REQUEST", {
      message: `A department can hold at most ${MAX_WINDOWS_PER_DEPARTMENT} schedule entries.`,
    });
  }
  const timed: ScheduleWindow[] = [];
  for (const row of rows) {
    if (row.kind === "CANCEL") {
      if (!validDate(row.date)) {
        throw new ApiError("BAD_REQUEST", { message: "Pick a valid date." });
      }
      continue;
    }
    const { startMinute: s, endMinute: e } = row;
    if (
      s === undefined ||
      e === undefined ||
      !Number.isInteger(s) ||
      !Number.isInteger(e) ||
      s < 0 ||
      e > 1440 ||
      s % SLOT_MINUTES !== 0 ||
      e % SLOT_MINUTES !== 0 ||
      e - s < SLOT_MINUTES
    ) {
      throw new ApiError("BAD_REQUEST", {
        message: `Times must be on a ${SLOT_MINUTES}-minute grid and last at least ${SLOT_MINUTES} minutes.`,
      });
    }
    if (
      row.kind === "WEEKLY" &&
      !(Number.isInteger(row.weekday) && row.weekday! >= 1 && row.weekday! <= 7)
    ) {
      throw new ApiError("BAD_REQUEST", { message: "Pick a weekday." });
    }
    if (row.kind === "EXTRA" && !validDate(row.date)) {
      throw new ApiError("BAD_REQUEST", { message: "Pick a valid date." });
    }
    timed.push(row);
  }
  const cancelled = new Set(
    rows.filter((r) => r.kind === "CANCEL").map((r) => r.date!),
  );
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]!;
      const b = timed[j]!;
      if (
        sameDay(a, b, cancelled) &&
        a.startMinute! < b.endMinute! &&
        b.startMinute! < a.endMinute!
      ) {
        throw new ApiError("CONFLICT", {
          message: `Overlaps another window (${clock(b.startMinute!)}–${clock(b.endMinute!)}).`,
        });
      }
    }
  }
}

export function upcomingIntervals(
  rows: OwnedWindow[],
  nowMs: number,
  days = SCHEDULE_HORIZON_DAYS,
): Interval[] {
  const today = manilaDate(nowMs);
  const cancelled = new Set(
    rows.filter((r) => r.kind === "CANCEL").map((r) => `${r.adviserId}|${r.date}`),
  );
  const out: Interval[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const weekday = isoWeekday(date);
    for (const row of rows) {
      if (row.kind === "CANCEL") continue;
      const applies =
        row.kind === "EXTRA"
          ? row.date === date
          : row.weekday === weekday &&
            !cancelled.has(`${row.adviserId}|${date}`);
      if (!applies) continue;
      const endMs = dateAtMinute(date, row.endMinute!);
      if (endMs > nowMs) {
        out.push({ startMs: dateAtMinute(date, row.startMinute!), endMs });
      }
    }
  }
  out.sort((a, b) => a.startMs - b.startMs);
  const merged: Interval[] = [];
  for (const it of out) {
    const last = merged[merged.length - 1];
    if (last && it.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, it.endMs);
    } else {
      merged.push({ ...it });
    }
  }
  return merged;
}

export function summarize(
  rows: OwnedWindow[],
  nowMs: number = Date.now(),
): ScheduleSummary {
  const intervals = upcomingIntervals(rows, nowMs);
  const iso = (it: Interval | undefined) =>
    it
      ? {
          startsAt: new Date(it.startMs).toISOString(),
          endsAt: new Date(it.endMs).toISOString(),
        }
      : null;
  return {
    current: iso(intervals.find((it) => it.startMs <= nowMs)),
    next: iso(intervals.find((it) => it.startMs > nowMs)),
  };
}
