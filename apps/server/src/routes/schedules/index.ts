import { Router } from "express";
import { schedulesController } from "../../controllers/schedules/SchedulesController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — an instructor's own office-hour schedule per department.
 */
export const schedulesRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

/**
 * `GET /api/v1/me/schedule`
 * Access: session + instructor surface.
 * Use: my windows for one department this academic year — query
 * `departmentId`.
 * Returns: `{ data: { departmentId, windows, sync } }`.
 */
schedulesRouter.get("/me/schedule", instructor, schedulesController.get);

/**
 * `PUT /api/v1/me/schedule`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace my whole schedule for one department — body
 * `{ departmentId, windows: [{ kind, weekday?, date?, startMinute?, endMinute? }] }`
 * (`WEEKLY`, one-off `EXTRA`, or a `CANCEL` of one date).
 * Returns: `{ data: { departmentId, windows, sync } }`; `409` on an overlap.
 */
schedulesRouter.put("/me/schedule", instructor, schedulesController.save);
