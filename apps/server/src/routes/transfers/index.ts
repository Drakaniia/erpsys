import { Router } from "express";
import { transfersController } from "../../controllers/transfers/TransfersController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — department handover between instructors.
 */
export const transfersRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

/**
 * `GET /api/v1/transfers`
 * Access: session + instructor surface.
 * Use: incoming offers and my own requests; expired ones are resolved first.
 * Returns: `{ data: transfer list }`.
 */
transfersRouter.get("/transfers", instructor, transfersController.list);

/**
 * `POST /api/v1/transfers`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: ask for a department — body `{ departmentId, yearLevels? }`.
 * Returns: `201` with `{ data: transfer }`.
 */
transfersRouter.post("/transfers", instructor, transfersController.create);

/**
 * `PATCH /api/v1/transfers/:id`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: the owner accepts or declines — body `{ accept }`.
 * Returns: `{ data: transfer }`.
 */
transfersRouter.patch(
  "/transfers/:id",
  instructor,
  transfersController.respond,
);

/**
 * `DELETE /api/v1/transfers/:id`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: the requester withdraws.
 * Returns: `{ data: transfer }`.
 */
transfersRouter.delete(
  "/transfers/:id",
  instructor,
  transfersController.cancel,
);

/**
 * `POST /api/v1/departments/:id/takeover`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: claim a department nobody holds — body `{ yearLevels? }`.
 * Returns: `{ data: assignment }`.
 */
transfersRouter.post(
  "/departments/:id/takeover",
  instructor,
  transfersController.takeover,
);
