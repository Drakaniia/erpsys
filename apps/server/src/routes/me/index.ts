import { Router } from "express";
import { z } from "zod";
import { NOTIFICATION_PAGE_SIZE } from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody } from "../../middleware/http.js";

import { UserModel } from "../../models/UserModel.js";
import {
  launch,
  listNotifications,
  overview,
  stamp,
} from "../../services/me.js";

/**
 * `/api/v1` — paths owned by no single resource: launch, overview, stamp, the
 * notification bell.
 */
export const meRouter = Router();

const officer = [requireSession, requireSurface("officer")];

const stampBody = z.object({
  name: z.string().max(80).optional(),
  graphicUrl: z.string().url().max(1000).nullable().optional(),
  signatureUrl: z.string().url().max(1000).nullable().optional(),
});

/**
 * `GET /api/v1/me/launch`
 * Access: session.
 * Use: boot the landing surface in one call; sent
 * `Cache-Control: private, no-store`.
 * Returns: `{ data: launch bundle }`.
 */
meRouter.get(
  "/me/launch",
  requireSession,
  catchAsync(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    okOne(res, await launch(sessionUser(req)));
  }),
);

/**
 * `GET /api/v1/me/overview`
 * Access: session.
 * Use: the admin or officer console's first screen.
 * Returns: `{ data: overview }`.
 */
meRouter.get(
  "/me/overview",
  requireSession,
  catchAsync(async (req, res) => {
    okOne(res, await overview(sessionUser(req).role));
  }),
);

/**
 * `GET /api/v1/me/stamp`
 * Access: session + officer surface.
 * Use: the signature stamp this officer's verifications render.
 * Returns: `{ data: stamp }`.
 */
meRouter.get(
  "/me/stamp",
  officer,
  catchAsync(async (req, res) => {
    okOne(res, await stamp(sessionUser(req).id));
  }),
);

/**
 * `PATCH /api/v1/me/stamp`
 * Access: session + officer surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: save it — body `{ name?, graphicUrl?, signatureUrl? }`.
 * Returns: `{ data: stamp }`.
 */
meRouter.patch(
  "/me/stamp",
  officer,
  catchAsync(async (req, res) => {
    const userId = sessionUser(req).id;
    const input = parseBody(stampBody, req);
    const patch: Record<string, string | null> = {};
    if (input.name !== undefined) patch["stampName"] = input.name;
    if (input.graphicUrl !== undefined) {
      patch["stampGraphicUrl"] = input.graphicUrl;
    }
    if (input.signatureUrl !== undefined) {
      patch["stampSignatureUrl"] = input.signatureUrl;
    }
    if (
      Object.keys(patch).length > 0 &&
      !(await UserModel.patchById(userId, patch))
    ) {
      throw new ApiError("NOT_FOUND", { message: "User not found." });
    }
    okOne(res, await stamp(userId));
  }),
);

/**
 * `GET /api/v1/me/notifications`
 * Access: session.
 * Use: my notifications, newest first, capped at `NOTIFICATION_PAGE_SIZE`.
 * Returns: `{ data, page, pageSize, total }`.
 */
meRouter.get(
  "/me/notifications",
  requireSession,
  catchAsync(async (req, res) => {
    const rows = await listNotifications(sessionUser(req).id);
    okList(res, rows, 1, NOTIFICATION_PAGE_SIZE, rows.length);
  }),
);
