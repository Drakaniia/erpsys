import { Router } from "express";
import { queueSharesController } from "../../controllers/queue-shares/QueueSharesController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — shareable queue links minted by an assigned adviser.
 */
export const queueSharesRouter = Router();

/**
 * `POST /api/v1/queue-shares`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: mint a link for a department — body `{ departmentId }`.
 * Returns: `201` with `{ data: { token, url } }`.
 */
queueSharesRouter.post(
  "/queue-shares",
  requireSession,
  requireSurface("instructor"),
  queueSharesController.create,
);

/**
 * `GET /api/v1/queue-shares/:token`
 * Access: session + student surface.
 * Use: the landing payload behind a share link.
 * Returns: `{ data: share }`.
 */
queueSharesRouter.get(
  "/queue-shares/:token",
  requireSession,
  requireSurface("student"),
  queueSharesController.view,
);
