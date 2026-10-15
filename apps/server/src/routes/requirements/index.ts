import { Router } from "express";
import { requirementsController } from "../../controllers/requirements/RequirementsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the enrollment requirement list; admin-only.
 */
export const requirementsRouter = Router();

const admin = [requireSession, requireSurface("admin")];

/**
 * `GET /api/v1/requirements`
 * Access: session + admin surface.
 * Use: list requirement rows (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
requirementsRouter.get("/requirements", admin, requirementsController.list);

/**
 * `POST /api/v1/requirements`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: add one — body `{ label }`.
 * Returns: `201` with `{ data: row }`.
 */
requirementsRouter.post("/requirements", admin, requirementsController.create);

/**
 * `PUT /api/v1/requirements/order`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: reorder — body `{ orderedIds }`; literal path, so it never falls to
 * `/:id`.
 * Returns: `{ data: rows }` in the new order.
 */
requirementsRouter.put(
  "/requirements/order",
  admin,
  requirementsController.reorder,
);

/**
 * `PATCH /api/v1/requirements/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: rename or toggle — body `{ label?, isActive? }`.
 * Returns: `{ data: row }`.
 */
requirementsRouter.patch(
  "/requirements/:id",
  admin,
  requirementsController.update,
);

/**
 * `DELETE /api/v1/requirements/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete one.
 * Returns: `{ data: row }`.
 */
requirementsRouter.delete(
  "/requirements/:id",
  admin,
  requirementsController.remove,
);
