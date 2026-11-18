import { Router } from "express";
import { z } from "zod";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import * as queues from "../../services/queues.js";
import { myQueues } from "../../services/queue-listing.js";
import { myQueueStatus } from "../../services/queues.js";

/**
 * `/api/v1` — the student's own queue paths, then the instructor's serving and
 * entry operations.
 */
export const queuesRouter = Router();

const student = [requireSession, requireSurface("student")];
const instructor = [requireSession, requireSurface("instructor")];

const servingInput = z.object({
  departmentId: z.string().min(1),
  entryId: z.string().min(1),
});
const idParams = z.object({ id: z.string().min(1) });

/**
 * `GET /api/v1/me/queue`
 * Access: session + student surface.
 * Use: my place in line, null when I am not queued.
 * Returns: `{ data: queue state | null }`.
 */
queuesRouter.get(
  "/me/queue",
  student,
  catchAsync(async (req, res) => {
    okOne(res, await myQueueStatus(sessionUser(req).id));
  }),
);

/**
 * `POST /api/v1/me/queue`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: join the line — body `{ departmentId }`.
 * Returns: `201` with `{ data: entry }`.
 */
queuesRouter.post(
  "/me/queue",
  student,
  catchAsync(async (req, res) => {
    const { departmentId } = parseBody(
      z.object({ departmentId: z.string().min(1) }),
      req,
    );
    okOne(res, await queues.join(sessionUser(req), departmentId), 201);
  }),
);

/**
 * `DELETE /api/v1/me/queue`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: leave, unless an adviser is already serving me.
 * Returns: `{ data: queue state }`.
 */
queuesRouter.delete(
  "/me/queue",
  student,
  catchAsync(async (req, res) => {
    okOne(res, await queues.leave(sessionUser(req)));
  }),
);

/**
 * `GET /api/v1/queues`
 * Access: session + instructor surface.
 * Use: my departments, their lines and serving state.
 * Returns: `{ data: queues }`.
 */
queuesRouter.get(
  "/queues",
  instructor,
  catchAsync(async (req, res) => {
    okOne(res, await myQueues(sessionUser(req).id));
  }),
);

/**
 * `POST /api/v1/queues/serving`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: take the head of the line — body `{ departmentId, entryId }`.
 * Returns: `201` with `{ data: serving }`.
 */
queuesRouter.post(
  "/queues/serving",
  instructor,
  catchAsync(async (req, res) => {
    const input = parseBody(servingInput, req);
    okOne(res, await queues.serve(sessionUser(req).id, input), 201);
  }),
);

/**
 * `DELETE /api/v1/queues/serving`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: release the student back without enrolling — body
 * `{ departmentId, entryId }`.
 * Returns: `{ data: queue }`.
 */
queuesRouter.delete(
  "/queues/serving",
  instructor,
  catchAsync(async (req, res) => {
    const input = parseBody(servingInput, req);
    okOne(res, await queues.release(sessionUser(req).id, input));
  }),
);

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
  catchAsync(async (req, res) => {
    const input = parseBody(
      servingInput.extend({ to: z.enum(["end"]).optional() }),
      req,
    );
    okOne(res, await queues.moveToEnd(sessionUser(req).id, input));
  }),
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
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    okOne(res, await queues.removeEntry(sessionUser(req).id, id));
  }),
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
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const body = parseBody(
      z.object({
        departmentId: z.string().min(1),
        studentProfileId: z.string().min(1),
        academicYearId: z.string().min(1),
        joinedAt: z.string().min(1),
        studentName: z.string(),
        token: z.string().min(1),
      }),
      req,
    );
    okOne(res, await queues.restoreEntry(sessionUser(req).id, id, body));
  }),
);
