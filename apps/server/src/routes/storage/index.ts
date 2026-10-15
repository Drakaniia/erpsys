import { Router } from "express";
import { storageController } from "../../controllers/storage/StorageController.js";
import { requireSession } from "../../middleware/auth.js";

/**
 * `/api/v1` — direct-to-R2 uploads; every path needs a session.
 */
export const storageRouter = Router();

/**
 * `POST /api/v1/storage/session`
 * Access: session.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: presigned PUT for a direct upload — body
 * `{ route, stepCode?, studentProfileId?, mime, size }`.
 * Returns: `201` with `{ data: session }`; `429` + `Retry-After` when
 * throttled, `503` when storage is blocked.
 */
storageRouter.post(
  "/storage/session",
  requireSession,
  storageController.session,
);

/**
 * `POST /api/v1/storage/complete`
 * Access: session.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: verify the landed bytes and finalize — body `{ uploadId, stepCode? }`.
 * Returns: `{ data: upload }`.
 */
storageRouter.post(
  "/storage/complete",
  requireSession,
  storageController.complete,
);

/**
 * `GET /api/v1/storage/session-status`
 * Access: session.
 * Use: poll a pending upload (query `uploadId`).
 * Returns: `{ data: status }`.
 */
storageRouter.get(
  "/storage/session-status",
  requireSession,
  storageController.status,
);

/**
 * `GET /api/v1/uploads/:id/content`
 * Access: session.
 * Use: raw bytes, `Range`-aware; immutable cache per upload id.
 * Returns: binary `200`/`206` stream, or falls through when the row is not an
 * R2 upload.
 */
storageRouter.get(
  "/uploads/:id/content",
  requireSession,
  storageController.content,
);
