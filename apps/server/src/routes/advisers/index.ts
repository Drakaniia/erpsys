import { Router } from "express";
import { advisersController } from "../../controllers/advisers/AdvisersController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the adviser roster, plus an instructor's own availability switch.
 */
export const advisersRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const instructor = [requireSession, requireSurface("instructor")];

/**
 * `GET /api/v1/advisers`
 * Access: session + admin surface.
 * Use: every instructor with the departments it holds (query `page`,
 * `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
advisersRouter.get("/advisers", admin, advisersController.list);

/**
 * `PATCH /api/v1/advisers/:adviserId`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace the whole mapping — body
 * `{ assignments: [{ departmentId, yearLevels }] }`.
 * Returns: `{ data: adviser }`.
 */
advisersRouter.patch(
  "/advisers/:adviserId",
  admin,
  advisersController.saveAssignments,
);

/**
 * `PUT /api/v1/me/availability`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: open or close my department's queue — body `{ departmentId, isOpen }`.
 * Returns: `{ data: availability }`.
 */
advisersRouter.put(
  "/me/availability",
  instructor,
  advisersController.setAvailability,
);

/**
 * `POST /api/v1/me/availability/heartbeat`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: I am still serving; keeps the queue open.
 * Returns: `{ data: availability }`.
 */
advisersRouter.post(
  "/me/availability/heartbeat",
  instructor,
  advisersController.heartbeat,
);
