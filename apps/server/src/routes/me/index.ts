import { Router } from "express";
import { meController } from "../../controllers/me/MeController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — paths owned by no single resource: launch, overview, stamp, the
 * notification bell.
 */
export const meRouter = Router();

const officer = [requireSession, requireSurface("officer")];

/**
 * `GET /api/v1/me/launch`
 * Access: session.
 * Use: boot the landing surface in one call; sent
 * `Cache-Control: private, no-store`.
 * Returns: `{ data: launch bundle }`.
 */
meRouter.get("/me/launch", requireSession, meController.launch);

/**
 * `GET /api/v1/me/overview`
 * Access: session.
 * Use: the admin or officer console's first screen.
 * Returns: `{ data: overview }`.
 */
meRouter.get("/me/overview", requireSession, meController.overview);

/**
 * `GET /api/v1/me/stamp`
 * Access: session + officer surface.
 * Use: the signature stamp this officer's verifications render.
 * Returns: `{ data: stamp }`.
 */
meRouter.get("/me/stamp", officer, meController.stamp);

/**
 * `PATCH /api/v1/me/stamp`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: save it — body `{ name?, graphicUrl?, signatureUrl? }`.
 * Returns: `{ data: stamp }`.
 */
meRouter.patch("/me/stamp", officer, meController.saveStamp);

/**
 * `GET /api/v1/me/notifications`
 * Access: session.
 * Use: my notifications, newest first, capped at `NOTIFICATION_PAGE_SIZE`.
 * Returns: `{ data, page, pageSize, total }`.
 */
meRouter.get("/me/notifications", requireSession, meController.notifications);

/**
 * `POST /api/v1/me/notifications/read`
 * Access: session.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: mark every notification read.
 * Returns: `{ data: mark-all result }`.
 */
meRouter.post(
  "/me/notifications/read",
  requireSession,
  meController.markNotificationsRead,
);
