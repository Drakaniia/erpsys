import { Router } from "express";
import { z } from "zod";
import { PRE_ENROLLMENT_STEP_CODES } from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { outsideTransaction } from "../../lib/db/timestamp-ordering.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { activeYearOrThrow } from "../../services/academic-years.js";
import {
  replyToSubmission,
  revokeSubmission,
  submissionDetail,
  submissionListQuery,
  submissionPage,
  verifySubmission,
} from "../../services/submissions.js";

/**
 * `/api/v1` — the SBO officer's review queue.
 */
export const submissionsRouter = Router();

const officer = [requireSession, requireSurface("officer")];

const replyBody = z.object({
  chips: z.array(z.string().min(1)).max(10).default([]),
  note: z.string().max(500).optional(),
});

/**
 * `GET /api/v1/submissions`
 * Access: session + officer surface.
 * Use: review queue (query `step?`, `page`, `pageSize`, `sort`, `dir`, `q`,
 * `status`, `evidence`, `range`).
 * Returns: `{ data, page, pageSize, total }`.
 */
submissionsRouter.get(
  "/submissions",
  officer,
  catchAsync(async (req, res) => {
    const input = parseQuery(submissionListQuery, req);
    const { data, total } = await submissionPage(input);
    okList(res, data, input.page, input.pageSize, total);
  }),
);

/**
 * `GET /api/v1/submissions/:verificationId`
 * Access: session + officer surface.
 * Use: one submission in full.
 * Returns: `{ data: submission }`.
 */
submissionsRouter.get(
  "/submissions/:verificationId",
  officer,
  catchAsync(async (req, res) => {
    okOne(res, await submissionDetail(String(req.params.verificationId)));
  }),
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
  catchAsync(async (req, res) => {
    okOne(
      res,
      await verifySubmission(sessionUser(req).id, String(req.params.id)),
    );
  }),
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
  catchAsync(async (req, res) => {
    okOne(
      res,
      await revokeSubmission(sessionUser(req).id, String(req.params.id)),
    );
  }),
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
  catchAsync(async (req, res) => {
    const userId = sessionUser(req).id;
    okOne(
      res,
      await replyToSubmission(
        userId,
        String(req.params.id),
        parseBody(replyBody, req),
      ),
    );
  }),
);

async function activeSubmissionEditors(
  id: string,
  editor?: { userId: string; name: string },
) {
  const [year, steps] = await Promise.all([
    activeYearOrThrow(),
    StepModel.listByCodes([...PRE_ENROLLMENT_STEP_CODES]),
  ]);
  const entries = await StepVerificationModel.reviewEditors(
    id,
    String(year._id),
    steps.map((step) => String(step._id)),
    editor,
  );
  if (!entries) {
    throw new ApiError("NOT_FOUND", { message: "Reviewable submission not found." });
  }
  return entries.map(({ userId, name }) => ({ userId, name }));
}

/**
 * `GET /api/v1/submissions/:id/active-editors`
 * Access: session + officer surface.
 * Use: list unexpired editors of an active-year review submission without joining them.
 * Returns: `{ data: [{ userId, name }] }`.
 */
submissionsRouter.get(
  "/submissions/:id/active-editors",
  officer,
  catchAsync((req, res) =>
    outsideTransaction(async () => {
      res.set("Cache-Control", "no-store");
      okOne(res, await activeSubmissionEditors(String(req.params.id)));
    }),
  ),
);

/**
 * `PUT /api/v1/submissions/:id/active-editors`
 * Access: session + officer surface.
 * Concurrency: one atomic presence update; does not participate in review timestamp ordering.
 * Use: renew the session user's 30-second lease on an active-year review submission (no body).
 * Returns: `{ data: [{ userId, name }] }`.
 */
submissionsRouter.put(
  "/submissions/:id/active-editors",
  officer,
  catchAsync((req, res) =>
    outsideTransaction(async () => {
      const user = sessionUser(req);
      res.set("Cache-Control", "no-store");
      okOne(
        res,
        await activeSubmissionEditors(String(req.params.id), {
          userId: user.id,
          name: user.name?.trim() || "Staff member",
        }),
      );
    }),
  ),
);
