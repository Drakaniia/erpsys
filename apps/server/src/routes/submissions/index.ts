import { Router } from "express";
import { submissionsController } from "../../controllers/submissions/SubmissionsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the SBO officer's review queue.
 */
export const submissionsRouter = Router();

const officer = [requireSession, requireSurface("officer")];

/**
 * `GET /api/v1/submissions`
 * Access: session + officer surface.
 * Use: review queue (query `step?`, `page`, `pageSize`, `sort`, `dir`, `q`,
 * `status`, `evidence`, `range`).
 * Returns: `{ data, page, pageSize, total }`.
 */
submissionsRouter.get("/submissions", officer, submissionsController.list);

/**
 * `GET /api/v1/submissions/:verificationId`
 * Access: session + officer surface.
 * Use: one submission in full.
 * Returns: `{ data: submission }`.
 */
submissionsRouter.get(
  "/submissions/:verificationId",
  officer,
  submissionsController.detail,
);

/**
 * `POST /api/v1/submissions/:id/verification`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: stamp the step.
 * Returns: `{ data: verification }`.
 */
submissionsRouter.post(
  "/submissions/:id/verification",
  officer,
  submissionsController.verify,
);

/**
 * `DELETE /api/v1/submissions/:id/verification`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: take the stamp back.
 * Returns: `{ data: verification }`.
 */
submissionsRouter.delete(
  "/submissions/:id/verification",
  officer,
  submissionsController.revoke,
);

/**
 * `POST /api/v1/submissions/:id/replies`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: return it to the student — body `{ chips?, note? }`.
 * Returns: `{ data: submission }`.
 */
submissionsRouter.post(
  "/submissions/:id/replies",
  officer,
  submissionsController.reply,
);
