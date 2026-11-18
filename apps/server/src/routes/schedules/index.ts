import { Router } from "express";
import { z } from "zod";
import {
  manilaDate,
  validateWindows,
  type ScheduleWindow,
} from "../../config/schedule.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { CalendarConnectionModel } from "../../models/CalendarConnectionModel.js";
import { activeYearOrThrow } from "../../services/academic-years.js";
import {
  syncAfterScheduleChange,
  syncStateOf,
} from "../../services/calendar.js";
import { assertDepartmentAssigned } from "../../services/queues.js";

/**
 * `/api/v1` — an instructor's own office-hour schedule per department.
 */
export const schedulesRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

const windowSchema = z.object({
  kind: z.enum(["WEEKLY", "EXTRA", "CANCEL"]),
  weekday: z.number().int().min(1).max(7).optional(),
  date: z.string().max(10).optional(),
  startMinute: z.number().int().min(0).max(1440).optional(),
  endMinute: z.number().int().min(0).max(1440).optional(),
});

function currentWindows(rows: ScheduleWindow[]): ScheduleWindow[] {
  const today = manilaDate(Date.now());
  return rows
    .map((row) => ({
      kind: row.kind,
      ...(row.weekday !== undefined && { weekday: row.weekday }),
      ...(row.date !== undefined && { date: row.date }),
      ...(row.startMinute !== undefined && { startMinute: row.startMinute }),
      ...(row.endMinute !== undefined && { endMinute: row.endMinute }),
    }))
    .filter((row) => row.kind === "WEEKLY" || row.date! >= today);
}

/**
 * `GET /api/v1/me/schedule`
 * Access: session + instructor surface.
 * Use: my windows for one department this academic year — query
 * `departmentId`.
 * Returns: `{ data: { departmentId, windows, sync } }`.
 */
schedulesRouter.get(
  "/me/schedule",
  instructor,
  catchAsync(async (req, res) => {
    const { departmentId } = parseQuery(
      z.object({ departmentId: z.string().min(1) }),
      req,
    );
    const year = await activeYearOrThrow();
    const rows = await AvailabilityWindowModel.listForAdviserDepartment(
      sessionUser(req).id,
      departmentId,
      String(year._id),
    );
    okOne(res, {
      departmentId,
      windows: currentWindows(rows),
      sync: syncStateOf(
        await CalendarConnectionModel.findByUser(sessionUser(req).id),
      ),
    });
  }),
);

/**
 * `PUT /api/v1/me/schedule`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace my whole schedule for one department — body
 * `{ departmentId, windows: [{ kind, weekday?, date?, startMinute?, endMinute? }] }`
 * (`WEEKLY`, one-off `EXTRA`, or a `CANCEL` of one date).
 * Returns: `{ data: { departmentId, windows, sync } }`; `409` on an overlap.
 */
schedulesRouter.put(
  "/me/schedule",
  instructor,
  catchAsync(async (req, res) => {
    const userId = sessionUser(req).id;
    const input = parseBody(
      z.object({
        departmentId: z.string().min(1),
        windows: z.array(windowSchema).max(100),
      }),
      req,
    );
    const year = await activeYearOrThrow();
    await assertDepartmentAssigned(userId, input.departmentId);
    const windows = currentWindows(input.windows);
    validateWindows(windows);
    await AvailabilityWindowModel.replace(
      userId,
      input.departmentId,
      String(year._id),
      windows,
    );
    okOne(res, {
      departmentId: input.departmentId,
      windows,
      sync: await syncAfterScheduleChange(userId),
    });
  }),
);
