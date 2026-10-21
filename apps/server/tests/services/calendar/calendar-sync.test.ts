import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../../src/lib/db/db.js";
import { fakeDb, type Row } from "../../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  available: true,
}));
const google = vi.hoisted(() => ({
  accessToken: vi.fn(),
  createCalendar: vi.fn(),
  listEvents: vi.fn(),
  putEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("../../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../../src/lib/google/calendar.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/lib/google/calendar.js")
  >()),
  ...google,
}));
vi.mock("../../../src/lib/platform/token-crypto.js", () => ({
  sealToken: (plain: string) => `enc:${plain}`,
  openToken: (sealed: string) => sealed.replace(/^enc:/, ""),
}));
vi.mock("../../../src/lib/platform/integration-settings.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../src/lib/platform/integration-settings.js")
  >()),
  integrationEnabled: async () => holder.available,
  integrationConfigured: () => true,
}));

import {
  CalendarAuthError,
  CalendarHttpError,
  type GoogleEvent,
} from "../../../src/lib/google/calendar.js";
import { CalendarSweepService } from "../../../src/services/calendar/CalendarSweepService.js";
import {
  CalendarSyncService,
  MAX_SYNC_ATTEMPTS,
  backoffMs,
} from "../../../src/services/calendar/CalendarSyncService.js";

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.academicYear]: [
      { _id: "ay-1", label: "2026", semesterLabel: "First", isActive: true },
    ],
    [COLLECTIONS.department]: [
      { _id: "dept-1", name: "College of Technologies", isActive: true },
    ],
    [COLLECTIONS.calendarConnection]: [
      {
        _id: "cal-1",
        userId: "adv1",
        status: "CONNECTED",
        refreshTokenEnc: "enc:refresh",
        googleCalendarId: null,
        syncState: "DIRTY",
        attempts: 0,
        nextAttemptAt: new Date("2026-11-10"),
      },
    ],
    [COLLECTIONS.availabilityWindow]: [
      {
        _id: "w1",
        adviserId: "adv1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        kind: "WEEKLY",
        weekday: 1,
        startMinute: 540,
        endMinute: 720,
      },
      {
        _id: "w2",
        adviserId: "adv1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        kind: "CANCEL",
        date: "2026-11-23",
      },
      {
        _id: "w3",
        adviserId: "adv1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        kind: "EXTRA",
        date: "2026-11-21",
        startMinute: 600,
        endMinute: 660,
      },
    ],
    [COLLECTIONS.adminActionLog]: [],
  };
}

let context: ReturnType<typeof fakeDb>;
const connection = () => context.store[COLLECTIONS.calendarConnection][0]!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T02:00:00Z"));
  holder.available = true;
  context = fakeDb(seed());
  holder.db = context.db;
  google.accessToken.mockResolvedValue("access");
  google.createCalendar.mockResolvedValue("gcal-1");
  google.listEvents.mockResolvedValue([]);
  google.putEvent.mockResolvedValue(undefined);
  google.deleteEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Google Calendar sync", () => {
  it("creates the dedicated calendar and mirrors each window as an event", async () => {
    expect(await CalendarSyncService.run("adv1")).toBe("SYNCED");
    expect(google.createCalendar).toHaveBeenCalledTimes(1);
    expect(connection()).toMatchObject({
      googleCalendarId: "gcal-1",
      syncState: "CLEAN",
      attempts: 0,
    });
    const events = google.putEvent.mock.calls.map(
      (call) => call[3] as GoogleEvent,
    );
    expect(events).toHaveLength(2);
    const weekly = events.find((e) => e.recurrence)!;
    expect(weekly.start).toEqual({
      dateTime: "2026-11-16T09:00:00",
      timeZone: "Asia/Manila",
    });
    expect(weekly.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "EXDATE;TZID=Asia/Manila:20261123T090000",
    ]);
    const extra = events.find((e) => !e.recurrence)!;
    expect(extra.start.dateTime).toBe("2026-11-21T10:00:00");
  });

  it("keeps events generic: no attendees, no reminders, no person data", async () => {
    await CalendarSyncService.run("adv1");
    for (const [, , , event] of google.putEvent.mock.calls) {
      const body = JSON.stringify(event);
      expect(event.summary).toBe("Enrollment advising – College of Technologies");
      expect(event.reminders).toEqual({ useDefault: false });
      expect(body).not.toContain("attendees");
      expect(body).not.toContain("adv1");
    }
  });

  it("leaves unchanged events alone on the next run", async () => {
    await CalendarSyncService.run("adv1");
    const sent = google.putEvent.mock.calls.map((c) => c[3] as GoogleEvent);
    google.putEvent.mockClear();
    google.listEvents.mockResolvedValue(
      sent.map((e) => ({ id: e.id, extendedProperties: e.extendedProperties })),
    );
    await CalendarSyncService.run("adv1");
    expect(google.putEvent).not.toHaveBeenCalled();
    expect(google.deleteEvent).not.toHaveBeenCalled();
    expect(google.createCalendar).toHaveBeenCalledTimes(1);
  });

  it("deletes events that no longer belong to a window", async () => {
    google.listEvents.mockResolvedValue([
      { id: "stale", extendedProperties: { private: { erpsys: "1", sig: "x" } } },
    ]);
    await CalendarSyncService.run("adv1");
    expect(google.deleteEvent).toHaveBeenCalledWith(
      "adv1",
      "access",
      "gcal-1",
      "stale",
    );
  });

  it("recreates the calendar when the instructor deleted it in Google", async () => {
    connection().googleCalendarId = "gone";
    google.listEvents.mockRejectedValueOnce(new CalendarHttpError(404));
    google.createCalendar.mockResolvedValue("gcal-2");
    expect(await CalendarSyncService.run("adv1")).toBe("SYNCED");
    expect(connection().googleCalendarId).toBe("gcal-2");
  });

  it("asks for a reconnect when Google revokes the token, and stops retrying", async () => {
    google.accessToken.mockRejectedValue(new CalendarAuthError());
    expect(await CalendarSyncService.run("adv1")).toBe("NEEDS_RECONNECT");
    expect(connection()).toMatchObject({
      status: "NEEDS_RECONNECT",
      syncState: "CLEAN",
    });
    google.accessToken.mockClear();
    expect(await CalendarSyncService.run("adv1")).toBe("NEEDS_RECONNECT");
    expect(google.accessToken).not.toHaveBeenCalled();
  });

  it("backs off after a Google failure, then gives up as FAILED", async () => {
    google.listEvents.mockRejectedValue(new CalendarHttpError(500));
    expect(await CalendarSyncService.run("adv1")).toBe("PENDING");
    expect(connection()).toMatchObject({ syncState: "DIRTY", attempts: 1 });
    expect(new Date(connection().nextAttemptAt as Date).getTime()).toBe(
      Date.now() + backoffMs(1),
    );
    connection().attempts = MAX_SYNC_ATTEMPTS - 1;
    expect(await CalendarSyncService.run("adv1")).toBe("FAILED");
    expect(connection()).toMatchObject({
      syncState: "FAILED",
      nextAttemptAt: null,
    });
  });

  it("does nothing when the integration is off or nobody connected", async () => {
    holder.available = false;
    expect(await CalendarSyncService.run("adv1")).toBe("NOT_CONNECTED");
    holder.available = true;
    expect(await CalendarSyncService.run("nobody")).toBe("NOT_CONNECTED");
    expect(google.accessToken).not.toHaveBeenCalled();
  });

  it("caps the retry delay at one hour", () => {
    expect(backoffMs(20)).toBe(3_600_000);
  });
});

describe("calendar sweep", () => {
  it("retries a connection whose next attempt is due", async () => {
    await CalendarSweepService.run(new Date());
    expect(connection().syncState).toBe("CLEAN");
    expect(google.putEvent).toHaveBeenCalled();
  });

  it("skips a connection that is not due yet", async () => {
    connection().nextAttemptAt = new Date("2026-12-01");
    await CalendarSweepService.run(new Date());
    expect(google.accessToken).not.toHaveBeenCalled();
  });

  it("drops windows from a past academic year and resyncs that instructor", async () => {
    context.store[COLLECTIONS.availabilityWindow].push({
      _id: "old",
      adviserId: "adv1",
      departmentId: "dept-1",
      academicYearId: "ay-0",
      kind: "WEEKLY",
      weekday: 2,
      startMinute: 540,
      endMinute: 600,
    });
    connection().syncState = "CLEAN";
    connection().nextAttemptAt = null;
    await CalendarSweepService.run(new Date());
    expect(
      context.store[COLLECTIONS.availabilityWindow].map((w) => w._id),
    ).not.toContain("old");
    expect(google.listEvents).toHaveBeenCalled();
  });
});
