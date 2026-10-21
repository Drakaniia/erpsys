import { describe, expect, it } from "vitest";
import {
  dateAtMinute,
  firstDateOnOrAfter,
  isoWeekday,
  manilaDate,
  summarize,
  upcomingIntervals,
  validateWindows,
  type OwnedWindow,
} from "../../src/config/schedule.js";

const weekly = (weekday: number, startMinute: number, endMinute: number) =>
  ({ kind: "WEEKLY", weekday, startMinute, endMinute }) as const;

describe("Manila date helpers", () => {
  it("rolls the date at Manila midnight, not UTC midnight", () => {
    // 16:30 UTC on 1 Jan is already 00:30 on 2 Jan in Manila.
    expect(manilaDate(Date.parse("2026-01-01T16:30:00Z"))).toBe("2026-01-02");
    expect(manilaDate(Date.parse("2026-01-01T15:30:00Z"))).toBe("2026-01-01");
  });

  it("numbers weekdays ISO style with Monday as 1", () => {
    expect(isoWeekday("2026-11-16")).toBe(1);
    expect(isoWeekday("2026-11-22")).toBe(7);
  });

  it("finds the first matching weekday on or after a date", () => {
    expect(firstDateOnOrAfter("2026-11-16", 1)).toBe("2026-11-16");
    expect(firstDateOnOrAfter("2026-11-16", 3)).toBe("2026-11-18");
    expect(firstDateOnOrAfter("2026-11-18", 1)).toBe("2026-11-23");
  });

  it("converts a Manila clock time to an instant", () => {
    expect(new Date(dateAtMinute("2026-11-16", 9 * 60)).toISOString()).toBe(
      "2026-11-16T01:00:00.000Z",
    );
  });
});

describe("validateWindows", () => {
  it("accepts a clean schedule", () => {
    expect(() =>
      validateWindows([weekly(1, 540, 720), weekly(2, 540, 720)]),
    ).not.toThrow();
  });

  it("rejects times off the 30-minute grid or shorter than a slot", () => {
    expect(() => validateWindows([weekly(1, 545, 720)])).toThrow(/grid/);
    expect(() => validateWindows([weekly(1, 540, 540)])).toThrow(/grid/);
    expect(() => validateWindows([weekly(1, 540, 1470)])).toThrow(/grid/);
  });

  it("rejects overlapping weekly windows but allows touching ones", () => {
    expect(() =>
      validateWindows([weekly(1, 540, 720), weekly(1, 660, 780)]),
    ).toThrow(/Overlaps/);
    expect(() =>
      validateWindows([weekly(1, 540, 720), weekly(1, 720, 780)]),
    ).not.toThrow();
  });

  it("rejects an extra day that overlaps that weekday's weekly window", () => {
    const extra = {
      kind: "EXTRA",
      date: "2026-11-16",
      startMinute: 600,
      endMinute: 660,
    } as const;
    expect(() => validateWindows([weekly(1, 540, 720), extra])).toThrow(
      /Overlaps/,
    );
  });

  it("lets an extra day replace a weekly window that is skipped that date", () => {
    const extra = {
      kind: "EXTRA",
      date: "2026-11-16",
      startMinute: 600,
      endMinute: 660,
    } as const;
    expect(() =>
      validateWindows([
        weekly(1, 540, 720),
        { kind: "CANCEL", date: "2026-11-16" },
        extra,
      ]),
    ).not.toThrow();
  });

  it("rejects an impossible calendar date", () => {
    expect(() =>
      validateWindows([{ kind: "CANCEL", date: "2026-02-31" }]),
    ).toThrow(/valid date/);
  });

  it("caps how many entries one department can hold", () => {
    const many = Array.from({ length: 31 }, (_, i) =>
      weekly((i % 7) + 1, 0, 30),
    );
    expect(() => validateWindows(many)).toThrow(/at most/);
  });
});

describe("upcomingIntervals and summarize", () => {
  // Monday 2026-11-16, 08:00 Manila.
  const now = Date.parse("2026-11-16T00:00:00Z");
  const own = (w: ReturnType<typeof weekly>, adviserId = "a"): OwnedWindow => ({
    ...w,
    adviserId,
  });

  it("reports the window in progress and the next one", () => {
    const rows = [own(weekly(1, 540, 720))];
    const atTen = Date.parse("2026-11-16T02:00:00Z");
    const summary = summarize(rows, atTen);
    expect(summary.current?.endsAt).toBe("2026-11-16T04:00:00.000Z");
    expect(summary.next?.startsAt).toBe("2026-11-23T01:00:00.000Z");
  });

  it("has no current window before it opens", () => {
    const summary = summarize([own(weekly(1, 540, 720))], now);
    expect(summary.current).toBeNull();
    expect(summary.next?.startsAt).toBe("2026-11-16T01:00:00.000Z");
  });

  it("drops a skipped date for the same instructor only", () => {
    const cancel: OwnedWindow = {
      kind: "CANCEL",
      date: "2026-11-16",
      adviserId: "a",
    };
    const rows = [own(weekly(1, 540, 720), "a"), own(weekly(1, 540, 720), "b"), cancel];
    const hours = upcomingIntervals(rows, now);
    expect(hours[0]).toEqual({
      startMs: Date.parse("2026-11-16T01:00:00Z"),
      endMs: Date.parse("2026-11-16T04:00:00Z"),
    });
    const alone = upcomingIntervals([own(weekly(1, 540, 720), "a"), cancel], now);
    expect(alone[0]!.startMs).toBe(Date.parse("2026-11-23T01:00:00Z"));
  });

  it("merges overlapping hours from two instructors into one", () => {
    const rows = [
      own(weekly(1, 540, 660), "a"),
      own(weekly(1, 600, 720), "b"),
    ];
    const [first] = upcomingIntervals(rows, now);
    expect(first).toEqual({
      startMs: Date.parse("2026-11-16T01:00:00Z"),
      endMs: Date.parse("2026-11-16T04:00:00Z"),
    });
  });

  it("returns nothing when nothing is scheduled", () => {
    expect(summarize([], now)).toEqual({ current: null, next: null });
  });
});
