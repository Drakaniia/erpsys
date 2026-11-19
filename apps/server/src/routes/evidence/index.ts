import { Router, type Request } from "express";
import { z } from "zod";
import { draftExpiresAt, DRAFT_EVIDENCE_KINDS } from "../../config/evidence.js";
import { ApiError } from "../../config/errors.js";
import {
  KIND_FOR_STEP,
  evidenceUploadIds,
  uploadStepCodeSchema,
} from "../../config/steps.js";
import { getDbSync } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import { deleteR2Object } from "../../lib/storage/client.js";
import { configuredR2Client } from "../../lib/storage/configured-client.js";
import { addStoredBytes, monthKey } from "../../lib/storage/quota.js";
import { parseR2FileKey } from "../../lib/storage/storage.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { UploadModel, externalLinkKey } from "../../models/UploadModel.js";
import {
  attachedEvidence,
  draftEvidence,
  sweepDrafts,
} from "../../services/evidence.js";
import { profilingAnswers } from "../../services/content.js";
import { requireStudentContext } from "../../services/students.js";

/**
 * `/api/v1` — the student's own evidence and step submissions.
 */
export const evidenceRouter = Router();

const student = [requireSession, requireSurface("student")];

const stepCodeParams = z.object({ code: uploadStepCodeSchema });

async function stepContext(req: Request, code: string) {
  const { profile, year } = await requireStudentContext(sessionUser(req));
  const step = await StepModel.findByCode(code);
  if (!step) {
    throw new ApiError("NOT_FOUND", { message: "Step not configured." });
  }
  const key = {
    studentProfileId: profile._id,
    stepId: String(step._id),
    academicYearId: String(year._id),
  };
  return {
    profile,
    year,
    key,
    existing: await StepVerificationModel.findByStep(key),
  };
}

const evidenceOf = async (ids: string[]) =>
  (await UploadModel.findByIds(ids)).map(attachedEvidence);

/**
 * `POST /api/v1/evidence`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: attach an uploaded file to a step — body
 * `{ stepCode, fileKey, fileUrl }`.
 * Returns: `201` with `{ data: upload }`.
 */
evidenceRouter.post(
  "/evidence",
  student,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({
        stepCode: uploadStepCodeSchema,
        fileKey: z.string().min(1).max(500),
        fileUrl: z.string().url().max(1000),
      }),
      req,
    );
    const { profile, existing } = await stepContext(req, input.stepCode);
    const verified = () =>
      new ApiError("CONFLICT", { message: "This step is already verified." });
    if (existing?.status === "VERIFIED") throw verified();

    const uploadId = genId("upload");
    const now = new Date();
    await UploadModel.insert({
      _id: uploadId,
      fileKey: input.fileKey,
      fileUrl: input.fileUrl,
      kind: KIND_FOR_STEP[input.stepCode],
      uploadedById: sessionUser(req).id,
      studentProfileId: profile._id,
      createdAt: now,
      expiresAt: draftExpiresAt(now),
    });
    if (!existing) {
      const uploads = await UploadModel.findByIds([uploadId]);
      okOne(
        res,
        { evidence: uploads.map((u) => draftEvidence(u, now.getTime())) },
        201,
      );
      return;
    }
    const ids = [...evidenceUploadIds(existing.evidence), uploadId];
    const attached = await StepVerificationModel.updateEvidenceIfNotVerified(
      existing._id,
      ids,
      existing.status === "RETURNED" ? { status: "SUBMITTED" } : {},
    );
    if (!attached) {
      await UploadModel.deleteById(uploadId);
      throw verified();
    }
    okOne(res, { evidence: await evidenceOf(ids) }, 201);
  }),
);

/**
 * `DELETE /api/v1/evidence/:id`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: drop an upload I own.
 * Returns: `{ data: upload }`.
 */
evidenceRouter.delete(
  "/evidence/:id",
  student,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(z.object({ id: z.string().min(1) }), req);
    const { profile } = await requireStudentContext(sessionUser(req));
    const upload = await UploadModel.findForProfile(id, profile._id);
    if (!upload) {
      throw new ApiError("NOT_FOUND", { message: "Upload not found." });
    }
    const stepCode = Object.keys(KIND_FOR_STEP).find(
      (code) => KIND_FOR_STEP[code] === upload.kind,
    );
    if (stepCode) {
      const { existing } = await stepContext(req, stepCode);
      if (
        existing?.status === "VERIFIED" &&
        evidenceUploadIds(existing.evidence).includes(id)
      ) {
        throw new ApiError("CONFLICT", {
          message: "Verified steps are locked.",
        });
      }
    }
    await UploadModel.deleteById(id);
    if (upload.backend !== "r2") {
      okOne(res, { deleted: true });
      return;
    }
    void (async () => {
      const client = configuredR2Client();
      const parsed = parseR2FileKey(upload.fileKey);
      if (!client || !parsed) return;
      await deleteR2Object(client, parsed);
      await addStoredBytes(getDbSync(), monthKey(), -(upload.sizeBytes ?? 0));
    })().catch((error: unknown) =>
      console.error(
        `[evidence] R2 delete failed for upload ${id} — row already deleted`,
        error,
      ),
    );
    okOne(res, { deleted: true });
  }),
);

/**
 * `PUT /api/v1/me/evidence-link`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: save an external link as evidence — body `{ stepCode, url }`.
 * Returns: `{ data: verification }`.
 */
evidenceRouter.put(
  "/me/evidence-link",
  student,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({
        stepCode: uploadStepCodeSchema,
        url: z.string().url().max(1000),
      }),
      req,
    );
    const user = sessionUser(req);
    const { profile } = await requireStudentContext(user);
    await UploadModel.upsertExternalLink({
      studentProfileId: profile._id,
      fileKey: externalLinkKey(input.stepCode, input.url),
      fileUrl: input.url,
      uploadedById: user.id,
      now: new Date(),
    });
    const links = await UploadModel.listExternalLinks(profile._id);
    okOne(res, { evidence: links.map(attachedEvidence) });
  }),
);

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
  catchAsync(async (req, res) => {
    const { stepCode } = parseBody(
      z.object({ stepCode: uploadStepCodeSchema }),
      req,
    );
    const { profile, existing } = await stepContext(req, stepCode);
    if (existing?.status === "VERIFIED") {
      throw new ApiError("CONFLICT", { message: "Verified steps are locked." });
    }

    if (!existing) {
      const links = await UploadModel.listExternalLinksForStep(
        profile._id,
        stepCode,
      );
      await UploadModel.deleteByIds(links.map((link) => String(link._id)));
      const kind = KIND_FOR_STEP[stepCode];
      const files = kind
        ? await UploadModel.listByProfileAndKind(profile._id, kind)
        : [];
      const now = Date.now();
      const uploads = await UploadModel.findByIds(
        files.map((upload) => String(upload._id)),
      );
      okOne(res, { evidence: uploads.map((u) => draftEvidence(u, now)) });
      return;
    }

    const ids = evidenceUploadIds(existing.evidence);
    if (ids.length === 0) {
      okOne(res, { evidence: [] });
      return;
    }
    const linkIds = (await UploadModel.findByIds(ids))
      .filter((upload) => upload.kind === "EXTERNAL_LINK")
      .map((upload) => String(upload._id));
    if (linkIds.length === 0) {
      okOne(res, { evidence: await evidenceOf(ids) });
      return;
    }
    const remainingIds = ids.filter((id) => !linkIds.includes(id));
    if (remainingIds.length === 0) {
      await StepVerificationModel.deleteIfNotVerified(existing._id);
    } else {
      await StepVerificationModel.updateEvidenceIfNotVerified(
        existing._id,
        remainingIds,
      );
    }
    await UploadModel.deleteByIds(linkIds);
    okOne(res, { evidence: await evidenceOf(remainingIds) });
  }),
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
  catchAsync(async (req, res) => {
    const { code } = parseQuery(stepCodeParams, req);
    const { profile, year, key, existing } = await stepContext(req, code);
    if (existing?.status === "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message: "This step is already verified.",
      });
    }
    if (code === "PROFILING") {
      const form = await AcademicYearModel.profilingForm(String(year._id));
      if (!form?.formId) {
        throw new ApiError("PRECONDITION_FAILED", {
          message: "The profiling form isn't set up yet.",
        });
      }
      await StepVerificationModel.upsertSubmission(
        key,
        [],
        new Date(),
        await profilingAnswers(form.formId, sessionUser(req).email),
      );
      return okOne(res, { status: "SUBMITTED", evidence: [] }, 201);
    }
    const kind = KIND_FOR_STEP[code];
    await sweepDrafts(profile._id, sessionUser(req).id);
    const uploads = await UploadModel.listStepEvidence(profile._id, code, kind);
    if (uploads.length === 0) {
      const lapsed = await UploadModel.countStepEvidence(
        profile._id,
        code,
        kind,
        true,
      );
      throw new ApiError("PRECONDITION_FAILED", {
        message:
          lapsed > 0
            ? "Your upload expired 24 hours after upload — upload it again."
            : "Upload evidence first.",
      });
    }
    await StepVerificationModel.upsertSubmission(
      key,
      uploads.map((upload) => String(upload._id)),
      new Date(),
    );
    okOne(
      res,
      { status: "SUBMITTED", evidence: uploads.map(attachedEvidence) },
      201,
    );
  }),
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
  catchAsync(async (req, res) => {
    const { code } = parseQuery(stepCodeParams, req);
    const { existing } = await stepContext(req, code);
    if (!existing) {
      throw new ApiError("NOT_FOUND", { message: "No submission to cancel." });
    }
    if (existing.status !== "SUBMITTED") {
      throw new ApiError("CONFLICT", {
        message: "Only submissions awaiting review can be cancelled.",
      });
    }
    await StepVerificationModel.deleteById(existing._id);
    const ids = evidenceUploadIds(existing.evidence);
    if (ids.length > 0) {
      const drafts = (await UploadModel.findByIds(ids))
        .filter(
          (row) =>
            (DRAFT_EVIDENCE_KINDS as readonly string[]).includes(
              row.kind ?? "",
            ) && !row.filePurgedAt,
        )
        .map((row) => String(row._id));
      await UploadModel.updateManyByIds(drafts, {
        expiresAt: draftExpiresAt(new Date()),
        expiredAt: null,
      });
    }
    okOne(res, { status: "PENDING" });
  }),
);
