import { describe, expect, it } from "vitest";
import { scheduleLine } from "./schedule";

// Monday 2026-11-16, 10:00 Manila.
const now = Date.parse("2026-11-16T02:00:00Z");

describe("scheduleLine", () => {
  it("says so when nothing is posted", () => {
    expect(scheduleLine(null, now)).toBe("No office hours posted");
    expect(scheduleLine({ current: null, next: null }, now)).toBe(
      "No office hours posted",
    );
  });

  it("names when the current hours end, in Manila time", () => {
    expect(
      scheduleLine(
        {
          current: {
            startsAt: "2026-11-16T01:00:00.000Z",
            endsAt: "2026-11-16T04:00:00.000Z",
          },
          next: null,
        },
        now,
      ),
    ).toBe("Office hours now until 12:00 PM");
  });

  it("calls a later window today and names the weekday otherwise", () => {
    const today = {
      current: null,
      next: {
        startsAt: "2026-11-16T06:00:00.000Z",
        endsAt: "2026-11-16T08:00:00.000Z",
      },
    };
    expect(scheduleLine(today, now)).toBe(
      "Next office hours: Today 2:00 PM – 4:00 PM",
    );
    const later = {
      current: null,
      next: {
        startsAt: "2026-11-18T01:00:00.000Z",
        endsAt: "2026-11-18T04:00:00.000Z",
      },
    };
    expect(scheduleLine(later, now)).toBe(
      "Next office hours: Wed 9:00 AM – 12:00 PM",
    );
  });

  it("uses Manila's day even when UTC is still the day before", () => {
    // 20:00 UTC on the 15th is 04:00 on the 16th in Manila.
    const early = Date.parse("2026-11-15T20:00:00Z");
    expect(
      scheduleLine(
        {
          current: null,
          next: {
            startsAt: "2026-11-16T01:00:00.000Z",
            endsAt: "2026-11-16T04:00:00.000Z",
          },
        },
        early,
      ),
    ).toBe("Next office hours: Today 9:00 AM – 12:00 PM");
  });
});
