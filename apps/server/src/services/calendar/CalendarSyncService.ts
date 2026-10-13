import { createHash } from "node:crypto";
import {
  SCHEDULE_TZ,
  clock,
  firstDateOnOrAfter,
  manilaDate,
} from "../../config/schedule.js";
import {
  CalendarAuthError,
  CalendarHttpError,
  accessToken,
  createCalendar,
  deleteEvent,
  listEvents,
  putEvent,
  type GoogleEvent,
  type ListedEvent,
} from "../../lib/google/calendar.js";
import { env } from "../../lib/platform/env.js";
import {
  integrationConfigured,
  integrationEnabled,
} from "../../lib/platform/integration-settings.js";
import { openToken } from "../../lib/platform/token-crypto.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import {
  AvailabilityWindowModel,
  type AvailabilityWindowRow,
} from "../../models/AvailabilityWindowModel.js";
import {
  CalendarConnectionModel,
  type CalendarConnectionRow,
} from "../../models/CalendarConnectionModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";

export type SyncState =
  | "NOT_CONNECTED"
  | "SYNCED"
  | "PENDING"
  | "NEEDS_RECONNECT"
  | "FAILED";

export const MAX_SYNC_ATTEMPTS = 8;

const BYDAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const inflight = new Set<string>();

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** attempts, 3_600_000);
}

function eventId(userId: string, row: AvailabilityWindowRow): string {
  return sha1(
    [
      userId,
      row.departmentId,
      row.academicYearId,
      row.kind,
      row.weekday ?? row.date,
      row.startMinute,
      row.endMinute,
    ].join("|"),
  );
}

function stamp(date: string, minute: number): string {
  return `${date}T${clock(minute)}:00`;
}

function buildEvents(
  userId: string,
  rows: AvailabilityWindowRow[],
  names: Map<string, string>,
  today: string,
): Map<string, GoogleEvent> {
  const cancelled = new Map<string, string[]>();
  for (const row of rows) {
    if (row.kind !== "CANCEL" || row.date! < today) continue;
    cancelled.set(row.departmentId, [
      ...(cancelled.get(row.departmentId) ?? []),
      row.date!,
    ]);
  }
  const link = env.PUBLIC_SITE_URL ? ` ${env.PUBLIC_SITE_URL}` : "";
  const events = new Map<string, GoogleEvent>();
  for (const row of rows) {
    if (row.kind === "CANCEL") continue;
    const weekly = row.kind === "WEEKLY";
    const date = weekly ? firstDateOnOrAfter(today, row.weekday!) : row.date!;
    const exdates = weekly
      ? (cancelled.get(row.departmentId) ?? []).sort()
      : [];
    const summary = `Enrollment advising – ${names.get(row.departmentId) ?? "Department"}`;
    const sig = sha1(
      JSON.stringify([
        summary,
        row.kind,
        row.weekday ?? row.date,
        row.startMinute,
        row.endMinute,
        exdates,
      ]),
    );
    const id = eventId(userId, row);
    events.set(id, {
      id,
      summary,
      description: `Office hours posted from ERPSYS.${link}`,
      start: {
        dateTime: stamp(date, row.startMinute!),
        timeZone: SCHEDULE_TZ,
      },
      end: { dateTime: stamp(date, row.endMinute!), timeZone: SCHEDULE_TZ },
      ...(weekly
        ? {
            recurrence: [
              `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[row.weekday!]}`,
              ...(exdates.length > 0
                ? [
                    `EXDATE;TZID=${SCHEDULE_TZ}:${exdates
                      .map(
                        (d) =>
                          `${d.replaceAll("-", "")}T${clock(row.startMinute!).replace(":", "")}00`,
                      )
                      .join(",")}`,
                  ]
                : []),
            ],
          }
        : {}),
      reminders: { useDefault: false },
      extendedProperties: { private: { erpsys: "1", sig } },
    });
  }
  return events;
}

async function reconcile(conn: CalendarConnectionRow): Promise<string> {
  const userId = conn.userId;
  const token = await accessToken(userId, openToken(conn.refreshTokenEnc!));
  let calendarId = conn.googleCalendarId ?? null;
  if (!calendarId) {
    calendarId = await createCalendar(userId, token);
    await CalendarConnectionModel.setCalendarId(userId, calendarId);
  }

  const year = await AcademicYearModel.findActive();
  const rows = year
    ? await AvailabilityWindowModel.listForAdviser(userId, String(year._id))
    : [];
  const departments = await DepartmentModel.findByIds([
    ...new Set(rows.map((row) => row.departmentId)),
  ]);
  const desired = buildEvents(
    userId,
    rows,
    new Map(departments.map((d) => [String(d._id), d.name])),
    manilaDate(Date.now()),
  );

  let existing: ListedEvent[];
  try {
    existing = await listEvents(userId, token, calendarId);
  } catch (error) {
    if (!(error instanceof CalendarHttpError) || error.status !== 404) {
      throw error;
    }
    calendarId = await createCalendar(userId, token);
    await CalendarConnectionModel.setCalendarId(userId, calendarId);
    existing = [];
  }
  const known = new Map(
    existing.map((e) => [e.id, e.extendedProperties?.private?.sig]),
  );
  for (const [id, event] of desired) {
    if (known.get(id) !== event.extendedProperties.private.sig) {
      await putEvent(userId, token, calendarId, event);
    }
  }
  for (const id of known.keys()) {
    if (!desired.has(id)) await deleteEvent(userId, token, calendarId, id);
  }
  return calendarId;
}

export class CalendarSyncService {
  static async available(): Promise<boolean> {
    return (
      (await integrationEnabled("googleCalendar")) &&
      integrationConfigured("googleCalendar")
    );
  }

  static stateOf(conn: CalendarConnectionRow | null): SyncState {
    if (!conn || conn.status === "PENDING") return "NOT_CONNECTED";
    if (conn.status === "NEEDS_RECONNECT") return "NEEDS_RECONNECT";
    if (conn.syncState === "FAILED") return "FAILED";
    return conn.syncState === "DIRTY" ? "PENDING" : "SYNCED";
  }

  static async afterScheduleChange(userId: string): Promise<SyncState> {
    await CalendarConnectionModel.markDirty(userId, new Date());
    return CalendarSyncService.run(userId);
  }

  static async run(userId: string): Promise<SyncState> {
    const conn = await CalendarConnectionModel.findByUser(userId);
    if (!(await CalendarSyncService.available())) return "NOT_CONNECTED";
    if (!conn?.refreshTokenEnc || conn.status !== "CONNECTED") {
      return CalendarSyncService.stateOf(conn);
    }
    if (inflight.has(userId)) return "PENDING";
    inflight.add(userId);
    try {
      const calendarId = await reconcile(conn);
      await CalendarConnectionModel.markSynced(userId, new Date(), calendarId);
      return "SYNCED";
    } catch (error) {
      if (error instanceof CalendarAuthError) {
        await CalendarConnectionModel.markReconnect(userId);
        await AdminActionLogModel.log(
          userId,
          "Google Calendar needs reconnect",
          `User:${userId}`,
        );
        return "NEEDS_RECONNECT";
      }
      const attempts = conn.attempts + 1;
      const failed = attempts >= MAX_SYNC_ATTEMPTS;
      await CalendarConnectionModel.markRetry(userId, {
        attempts,
        failed,
        nextAttemptAt: failed
          ? null
          : new Date(Date.now() + backoffMs(attempts)),
        error:
          error instanceof CalendarHttpError ? `http_${error.status}` : "error",
      });
      return failed ? "FAILED" : "PENDING";
    } finally {
      inflight.delete(userId);
    }
  }
}
