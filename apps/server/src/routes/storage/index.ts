import { pipeline } from "node:stream";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../../config/errors.js";
import { canEnterSurface } from "../../config/roles.js";
import {
  clientIp,
  createRateLimitBudget,
} from "../../lib/platform/rate-limit.js";
import { validateSessionInput } from "../../lib/storage/sessions.js";
import { storageSurfaceForRoute } from "../../lib/storage/storage.js";
import { requireSession, sessionUser } from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import {
  completeUpload,
  createSession,
  openContent,
  quotaBlock,
  uploadStatus,
} from "../../services/storage.js";

/**
 * `/api/v1` — direct-to-R2 uploads; every path needs a session.
 */
export const storageRouter = Router();

const sessionBudget = createRateLimitBudget({ windowMs: 60_000, max: 20 });

const sessionBody = z.object({
  route: z.enum(["evidenceImage", "mugshotCapture", "stampImage"]),
  stepCode: z.string().min(1).max(64).optional(),
  studentProfileId: z.string().min(1).optional(),
  mime: z.string().min(1).max(100),
  size: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
});

const completeBody = z.object({
  uploadId: z.string().min(1),
  stepCode: z.string().min(1).max(64).optional(),
});

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
  catchAsync(async (req, res) => {
    const input = parseBody(sessionBody, req);
    const caller = sessionUser(req);
    if (!canEnterSurface(caller.role, storageSurfaceForRoute(input.route))) {
      throw new ApiError("FORBIDDEN", { message: "Forbidden." });
    }
    const decision = sessionBudget.check(
      `user:${caller.id}|ip:${clientIp(req)}`,
    );
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      res.status(429).json({ error: "Too many upload requests — slow down." });
      return;
    }
    validateSessionInput(input);
    const blocked = await quotaBlock(input.size);
    if (blocked) {
      res.status(503).json(blocked);
      return;
    }
    okOne(res, await createSession(caller, input), 201);
  }),
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
  catchAsync(async (req, res) => {
    const input = parseBody(completeBody, req);
    okOne(res, await completeUpload(sessionUser(req), input));
  }),
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
  catchAsync(async (req, res) => {
    const { uploadId } = parseQuery(
      z.object({ uploadId: z.string().min(1) }),
      req,
    );
    okOne(res, await uploadStatus(sessionUser(req), uploadId));
  }),
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
  async (req, res, next) => {
    try {
      const { id } = parseQuery(z.object({ id: z.string().min(1) }), req);
      const file = await openContent(id, sessionUser(req), req.headers.range);
      if (!file) {
        next();
        return;
      }
      res.status(file.status);
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", "inline");
      if (file.contentLength) {
        res.setHeader("Content-Length", file.contentLength);
      }
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      if (file.contentRange) res.setHeader("Content-Range", file.contentRange);
      pipeline(file.stream, res, () => {});
    } catch (error) {
      next(error);
    }
  },
);
