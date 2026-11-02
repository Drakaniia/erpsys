import { describe, expect, it } from "vitest";
import {
  minuteToTime,
  newRow,
  rowsToWindows,
  timeToMinute,
  windowsToRows,
} from "./schedule";

describe("schedule form helpers", () => {
  it("round-trips minutes and clock times", () => {
    expect(minuteToTime(0)).toBe("00:00");
    expect(minuteToTime(570)).toBe("09:30");
    expect(timeToMinute("09:30")).toBe(570);
    expect(timeToMinute(minuteToTime(1230))).toBe(1230);
  });

  it("turns server windows into editable rows and back without loss", () => {
    const windows = [
      { kind: "WEEKLY" as const, weekday: 3, startMinute: 540, endMinute: 720 },
      {
        kind: "EXTRA" as const,
        date: "2026-12-05",
        startMinute: 600,
        endMinute: 660,
      },
      { kind: "CANCEL" as const, date: "2026-12-07" },
    ];
    expect(rowsToWindows(windowsToRows(windows))).toEqual(windows);
  });

  it("sends only the fields each kind needs", () => {
    const [weekly] = rowsToWindows([newRow("WEEKLY")]);
    expect(weekly).toEqual({
      kind: "WEEKLY",
      weekday: 1,
      startMinute: 540,
      endMinute: 720,
    });
    const [cancel] = rowsToWindows([{ ...newRow("CANCEL"), date: "2026-12-07" }]);
    expect(cancel).toEqual({ kind: "CANCEL", date: "2026-12-07" });
  });

  it("gives every new row its own key", () => {
    expect(newRow().key).not.toBe(newRow().key);
  });
});
