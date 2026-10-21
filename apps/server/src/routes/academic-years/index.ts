import { Router } from "express";
import { academicYearsController } from "../../controllers/academic-years/AcademicYearsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — academic-year CRUD, plus the activation preview and commit.
 */
export const academicYearsRouter = Router();

const admin = [requireSession, requireSurface("admin")];

/**
 * `GET /api/v1/academic-years`
 * Access: session + admin surface.
 * Use: list every academic year (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
academicYearsRouter.get("/academic-years", admin, academicYearsController.list);

/**
 * `POST /api/v1/academic-years`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: create a year — body `{ label, semesterLabel, activate? }`.
 * Returns: `201` with `{ data: year }`.
 */
academicYearsRouter.post(
  "/academic-years",
  admin,
  academicYearsController.create,
);

/**
 * `PATCH /api/v1/academic-years/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: rename a year — body `{ label, semesterLabel }`.
 * Returns: `{ data: year }`.
 */
academicYearsRouter.patch(
  "/academic-years/:id",
  admin,
  academicYearsController.update,
);

/**
 * `DELETE /api/v1/academic-years/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete a year.
 * Returns: `{ data: year }`.
 */
academicYearsRouter.delete(
  "/academic-years/:id",
  admin,
  academicYearsController.remove,
);

/**
 * `GET /api/v1/academic-years/:id/activation`
 * Access: session + admin surface.
 * Use: what activating this year would carry over.
 * Returns: `{ data: stats }`.
 */
academicYearsRouter.get(
  "/academic-years/:id/activation",
  admin,
  academicYearsController.activation,
);

/**
 * `POST /api/v1/academic-years/:id/activation`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: make this the active year.
 * Returns: `{ data: year }`.
 */
academicYearsRouter.post(
  "/academic-years/:id/activation",
  admin,
  academicYearsController.activate,
);
