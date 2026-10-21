import { Router } from "express";
import { queuesController } from "../../controllers/queues/QueuesController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the student's own queue paths, then the instructor's serving and
 * entry operations.
 */
export const queuesRouter = Router();

const student = [requireSession, requireSurface("student")];
const instructor = [requireSession, requireSurface("instructor")];

/**
 * `GET /api/v1/me/queue`
 * Access: session + student surface.
 * Use: my place in line, null when I am not queued.
 * Returns: `{ data: queue state | null }`.
 */
queuesRouter.get("/me/queue", student, queuesController.myQueue);

/**
 * `POST /api/v1/me/queue`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: join the line — body `{ departmentId }`.
 * Returns: `201` with `{ data: entry }`.
 */
queuesRouter.post("/me/queue", student, queuesController.join);

/**
 * `DELETE /api/v1/me/queue`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: leave, unless an adviser is already serving me.
 * Returns: `{ data: queue state }`.
 */
queuesRouter.delete("/me/queue", student, queuesController.leave);

/**
 * `GET /api/v1/queues`
 * Access: session + instructor surface.
 * Use: my departments, their lines and serving state.
 * Returns: `{ data: queues }`.
 */
queuesRouter.get("/queues", instructor, queuesController.myQueues);

/**
 * `POST /api/v1/queues/serving`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: take the head of the line — body `{ departmentId, entryId }`.
 * Returns: `201` with `{ data: serving }`.
 */
queuesRouter.post("/queues/serving", instructor, queuesController.serve);

/**
 * `DELETE /api/v1/queues/serving`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: release the student back without enrolling — body
 * `{ departmentId, entryId }`.
 * Returns: `{ data: queue }`.
 */
queuesRouter.delete("/queues/serving", instructor, queuesController.release);

/**
 * `POST /api/v1/queues/serving/position`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: send the served student back to the end — body
 * `{ departmentId, entryId }`.
 * Returns: `{ data: queue }`.
 */
queuesRouter.post(
  "/queues/serving/position",
  instructor,
  queuesController.moveToEnd,
);

/**
 * `POST /api/v1/queue-entries/:id/removal`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: take a waiting student out of line.
 * Returns: `{ data: entry }`.
 */
queuesRouter.post(
  "/queue-entries/:id/removal",
  instructor,
  queuesController.removeEntry,
);

/**
 * `POST /api/v1/queue-entries/:id/restoration`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: undo a removal — body
 * `{ departmentId, studentProfileId, academicYearId, joinedAt, studentName }`.
 * Returns: `{ data: entry }`.
 */
queuesRouter.post(
  "/queue-entries/:id/restoration",
  instructor,
  queuesController.restoreEntry,
);
