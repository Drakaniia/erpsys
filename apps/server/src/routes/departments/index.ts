import { Router } from "express";
import { departmentsController } from "../../controllers/departments/DepartmentsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — `/me/departments` in both verbs, then the instructor/admin
 * department CRUD and register.
 */
export const departmentsRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

/**
 * `GET /api/v1/me/departments`
 * Access: session + student surface.
 * Use: the student's department today, or null, with its posted office-hour
 * `schedule` (`{ current, next }`).
 * Returns: `{ data: department | null }`.
 */
departmentsRouter.get(
  "/me/departments",
  requireSession,
  requireSurface("student"),
  departmentsController.mine,
);

/**
 * `PUT /api/v1/me/departments`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: claim one department outright — body `{ departmentIds, yearLevels? }`.
 * Returns: `{ data: assignment }`.
 */
departmentsRouter.put(
  "/me/departments",
  instructor,
  departmentsController.saveMine,
);

/**
 * `GET /api/v1/departments`
 * Access: session + instructor surface.
 * Use: every department with who holds it; an admin sees all, an instructor
 * their own (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
departmentsRouter.get("/departments", instructor, departmentsController.list);

/**
 * `POST /api/v1/departments`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: create one — body `{ name }`; an instructor holding none takes it.
 * Returns: `201` with `{ data: department }`.
 */
departmentsRouter.post(
  "/departments",
  instructor,
  departmentsController.create,
);

/**
 * `PATCH /api/v1/departments/:id`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: rename, and (admins only) deactivate — body `{ name?, isActive? }`.
 * Returns: `{ data: department }`.
 */
departmentsRouter.patch(
  "/departments/:id",
  instructor,
  departmentsController.update,
);

/**
 * `PUT /api/v1/departments/:id/year-levels`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set the year levels it serves — body `{ yearLevels }`.
 * Returns: `{ data: department }`.
 */
departmentsRouter.put(
  "/departments/:id/year-levels",
  instructor,
  departmentsController.setYearLevels,
);

/**
 * `DELETE /api/v1/departments/:id`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete it, only when nothing is queued in it.
 * Returns: `{ data: department }`.
 */
departmentsRouter.delete(
  "/departments/:id",
  instructor,
  departmentsController.remove,
);

/**
 * `GET /api/v1/departments/:id/enrollments`
 * Access: session + instructor surface.
 * Use: completed-enrollment register (query `range`, `q`, `cursor`, `limit`);
 * the next cursor comes back in the `X-Next-Cursor` header.
 * Returns: `{ data, page: 1, pageSize: limit, total }`.
 */
departmentsRouter.get(
  "/departments/:id/enrollments",
  instructor,
  departmentsController.enrollments,
);
