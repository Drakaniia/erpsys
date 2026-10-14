import { Router } from "express";
import { enrollmentsController } from "../../controllers/enrollments/EnrollmentsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the student's own enrollments, and the instructor's completion
 * and revert paths.
 */
export const enrollmentsRouter = Router();

const student = [requireSession, requireSurface("student")];
const instructor = [requireSession, requireSurface("instructor")];

/**
 * `GET /api/v1/me/enrollments`
 * Access: session + student surface.
 * Use: every year I am enrolled in.
 * Returns: `{ data, page: 1, pageSize, total }`.
 */
enrollmentsRouter.get("/me/enrollments", student, enrollmentsController.mine);

/**
 * `POST /api/v1/me/enrollments`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set or change the course for a year — body
 * `{ academicYearId, departmentId, yearLevel, studentNumber? }`.
 * Returns: `{ data: enrollment }`.
 */
enrollmentsRouter.post("/me/enrollments", student, enrollmentsController.save);

/**
 * `DELETE /api/v1/enrollments/completions`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: undo 1–50 completions — body
 * `{ departmentId, reason, enrollmentIds | ids }`; literal path, so it never
 * falls to `/:id`.
 * Returns: `{ data: revert result }`.
 */
enrollmentsRouter.delete(
  "/enrollments/completions",
  instructor,
  enrollmentsController.revertMany,
);

/**
 * `POST /api/v1/enrollments/:id/completion`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: complete a served student — body `{ departmentId }`.
 * Returns: `{ data: enrollment }`.
 */
enrollmentsRouter.post(
  "/enrollments/:id/completion",
  instructor,
  enrollmentsController.complete,
);

/**
 * `DELETE /api/v1/enrollments/:id/completion`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: undo one enrollment — body `{ departmentId, reason }`.
 * Returns: `{ data: enrollment }`.
 */
enrollmentsRouter.delete(
  "/enrollments/:id/completion",
  instructor,
  enrollmentsController.revert,
);
