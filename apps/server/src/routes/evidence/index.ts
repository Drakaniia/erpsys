import { Router } from "express";
import { evidenceController } from "../../controllers/evidence/EvidenceController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the student's own evidence and step submissions.
 */
export const evidenceRouter = Router();

const student = [requireSession, requireSurface("student")];

/**
 * `POST /api/v1/evidence`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: attach an uploaded file to a step — body
 * `{ stepCode, fileKey, fileUrl }`.
 * Returns: `201` with `{ data: upload }`.
 */
evidenceRouter.post("/evidence", student, evidenceController.add);

/**
 * `DELETE /api/v1/evidence/:id`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: drop an upload I own.
 * Returns: `{ data: upload }`.
 */
evidenceRouter.delete("/evidence/:id", student, evidenceController.remove);

/**
 * `PUT /api/v1/me/evidence-link`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: save an external link as evidence — body `{ stepCode, url }`.
 * Returns: `{ data: verification }`.
 */
evidenceRouter.put("/me/evidence-link", student, evidenceController.saveLink);

/**
 * `DELETE /api/v1/me/evidence-link`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: remove that link — body `{ stepCode }`.
 * Returns: `{ data: verification }`.
 */
evidenceRouter.delete(
  "/me/evidence-link",
  student,
  evidenceController.removeLink,
);

/**
 * `POST /api/v1/me/steps/:code/submission`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: submit the step for review — uploads, or for PROFILING the caller's latest Google Form response (matched by verified email).
 * Returns: `201` with `{ data: verification }`.
 */
evidenceRouter.post(
  "/me/steps/:code/submission",
  student,
  evidenceController.submit,
);

/**
 * `DELETE /api/v1/me/steps/:code/submission`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: cancel a pending submission.
 * Returns: `{ data: verification }`.
 */
evidenceRouter.delete(
  "/me/steps/:code/submission",
  student,
  evidenceController.cancel,
);
