import { ApiError } from "../../config/errors.js";
import { KIND_FOR_STEP, evidenceUploadIds } from "../../config/steps.js";
import { ProfilingFormModel } from "../../models/ProfilingFormModel.js";
import { StepModel } from "../../models/StepModel.js";
import type { StepVerificationRow } from "../../models/StepVerificationModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { UploadModel, externalLinkKey } from "../../models/UploadModel.js";
import {
  attachedEvidenceWire,
  draftEvidenceWire,
  type EvidenceWire,
} from "../../views/StudentStepView.js";
import { ProfilingFormService } from "../content/ProfilingFormService.js";
import { StudentProfileService } from "../students/StudentProfileService.js";
import { DraftEvidenceService } from "./DraftEvidenceService.js";

async function stepOrThrow(code: string) {
  const step = await StepModel.findByCode(code);
  if (!step) {
    throw new ApiError("NOT_FOUND", { message: "Step not configured." });
  }
  return step;
}

export class StepSubmissionService {
  static async saveLink(
    user: { id: string; email: string },
    input: { stepCode: string; url: string },
  ): Promise<{ evidence: EvidenceWire[] }> {
    const { profile } = await StudentProfileService.requireContext(user);
    await UploadModel.upsertExternalLink({
      studentProfileId: profile._id,
      fileKey: externalLinkKey(input.stepCode, input.url),
      fileUrl: input.url,
      uploadedById: user.id,
      now: new Date(),
    });
    const links = await UploadModel.listExternalLinks(profile._id);
    return { evidence: links.map(attachedEvidenceWire) };
  }

  static async removeLink(
    user: { id: string; email: string },
    stepCode: string,
  ): Promise<{ evidence: EvidenceWire[] }> {
    const { profile, year } = await StudentProfileService.requireContext(user);
    const step = await stepOrThrow(stepCode);
    const existing = await StepVerificationModel.findByStep({
      studentProfileId: profile._id,
      stepId: String(step._id),
      academicYearId: String(year._id),
    });
    if (existing?.status === "VERIFIED") {
      throw new ApiError("CONFLICT", { message: "Verified steps are locked." });
    }

    const now = Date.now();
    const attached = async (ids: string[]) =>
      (await UploadModel.findByIds(ids)).map(attachedEvidenceWire);
    const drafts = async (ids: string[]) =>
      (await UploadModel.findByIds(ids)).map((u) => draftEvidenceWire(u, now));

    if (existing) {
      const ids = evidenceUploadIds(existing.evidence);
      if (ids.length === 0) return { evidence: [] };

      const uploads = await UploadModel.findByIds(ids);
      const linkIds = uploads
        .filter((upload) => upload.kind === "EXTERNAL_LINK")
        .map((upload) => String(upload._id));
      if (linkIds.length === 0) return { evidence: await attached(ids) };

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
      return { evidence: await attached(remainingIds) };
    }

    const links = await UploadModel.listExternalLinksForStep(
      profile._id,
      stepCode,
    );
    await UploadModel.deleteByIds(links.map((link) => String(link._id)));

    const kind = KIND_FOR_STEP[stepCode];
    const remainingFiles = kind
      ? await UploadModel.listByProfileAndKind(profile._id, kind)
      : [];
    return {
      evidence: await drafts(
        remainingFiles.map((upload) => String(upload._id)),
      ),
    };
  }

  static async submit(
    user: { id: string; email: string },
    stepCode: string,
  ): Promise<{ status: "SUBMITTED"; evidence: EvidenceWire[] }> {
    const { profile, year } = await StudentProfileService.requireContext(user);
    const step = await stepOrThrow(stepCode);
    const key = {
      studentProfileId: profile._id,
      stepId: String(step._id),
      academicYearId: String(year._id),
    };

    const existing = await StepVerificationModel.findByStep(key);
    if (existing?.status === "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message: "This step is already verified.",
      });
    }

    if (stepCode === "PROFILING") {
      const form = await ProfilingFormModel.findByYear(String(year._id));
      if (!form?.formId) {
        throw new ApiError("PRECONDITION_FAILED", {
          message: "The profiling form isn't set up yet.",
        });
      }
      await StepVerificationModel.upsertSubmission(
        key,
        [],
        new Date(),
        await ProfilingFormService.responseRows(form.formId, user.email),
      );
      return { status: "SUBMITTED", evidence: [] };
    }

    const kind = KIND_FOR_STEP[stepCode];
    await DraftEvidenceService.sweep({
      studentProfileId: profile._id,
      userId: user.id,
    });

    const uploads = await UploadModel.listStepEvidence(
      profile._id,
      stepCode,
      kind,
    );
    if (uploads.length === 0) {
      const lapsed = await UploadModel.countStepEvidence(
        profile._id,
        stepCode,
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
    return {
      status: "SUBMITTED",
      evidence: uploads.map(attachedEvidenceWire),
    };
  }

  static async cancel(
    user: { id: string; email: string },
    stepCode: string,
  ): Promise<{ status: "PENDING" }> {
    const { profile, year } = await StudentProfileService.requireContext(user);
    const step = await stepOrThrow(stepCode);
    const existing: StepVerificationRow | null =
      await StepVerificationModel.findByStep({
        studentProfileId: profile._id,
        stepId: String(step._id),
        academicYearId: String(year._id),
      });

    if (!existing) {
      throw new ApiError("NOT_FOUND", {
        message: "No submission to cancel.",
      });
    }
    if (existing.status !== "SUBMITTED") {
      throw new ApiError("CONFLICT", {
        message: "Only submissions awaiting review can be cancelled.",
      });
    }

    await StepVerificationModel.deleteById(existing._id);
    await DraftEvidenceService.refreshExpiry(
      evidenceUploadIds(existing.evidence),
    );
    return { status: "PENDING" };
  }
}
