import { ApiError } from "../../config/errors.js";
import { draftExpiresAt } from "../../config/evidence.js";
import { KIND_FOR_STEP, evidenceUploadIds } from "../../config/steps.js";
import { getDbSync } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import { configuredR2Client } from "../../lib/storage/configured-client.js";
import { addStoredBytes, monthKey } from "../../lib/storage/quota.js";
import { deleteR2FileKey } from "../../lib/storage/sweep.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { UploadModel, type UploadRow } from "../../models/UploadModel.js";
import {
  attachedEvidenceWire,
  draftEvidenceWire,
  type EvidenceWire,
} from "../../views/StudentStepView.js";
import { StudentProfileService } from "../students/StudentProfileService.js";

async function deleteStoredObject(
  upload: UploadRow,
  uploadId: string,
): Promise<void> {
  try {
    const client = configuredR2Client();
    if (client && (await deleteR2FileKey(client, upload.fileKey))) {
      await addStoredBytes(getDbSync(), monthKey(), -(upload.sizeBytes ?? 0));
    }
  } catch (error) {
    console.error(
      `[evidence] R2 delete failed for upload ${uploadId} — row already deleted`,
      error,
    );
  }
}

export class EvidenceService {
  static async add(
    user: { id: string; email: string },
    input: { stepCode: string; fileKey: string; fileUrl: string },
  ): Promise<{ evidence: EvidenceWire[] }> {
    const { profile, year } = await StudentProfileService.requireContext(user);
    const profileId = profile._id;

    const step = await StepModel.findByCode(input.stepCode);
    if (!step) {
      throw new ApiError("NOT_FOUND", { message: "Step not configured." });
    }

    const existing = await StepVerificationModel.findByStep({
      studentProfileId: profileId,
      stepId: String(step._id),
      academicYearId: String(year._id),
    });
    if (existing?.status === "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message: "This step is already verified.",
      });
    }

    const uploadId = genId("upload");
    const now = new Date();
    await UploadModel.insert({
      _id: uploadId,
      fileKey: input.fileKey,
      fileUrl: input.fileUrl,
      kind: KIND_FOR_STEP[input.stepCode],
      uploadedById: user.id,
      studentProfileId: profileId,
      createdAt: now,
      expiresAt: draftExpiresAt(now),
    });

    const ids = existing
      ? [...evidenceUploadIds(existing.evidence), uploadId]
      : [uploadId];

    if (existing) {
      const attached = await StepVerificationModel.updateEvidenceIfNotVerified(
        existing._id,
        ids,
        existing.status === "RETURNED" ? { status: "SUBMITTED" } : {},
      );
      if (!attached) {
        await UploadModel.deleteById(uploadId);
        throw new ApiError("CONFLICT", {
          message: "This step is already verified.",
        });
      }
    }

    const uploads = await UploadModel.findByIds(ids);
    return {
      evidence: uploads.map(
        existing
          ? attachedEvidenceWire
          : (upload) => draftEvidenceWire(upload, now.getTime()),
      ),
    };
  }

  static async remove(
    user: { id: string; email: string },
    uploadId: string,
  ): Promise<{ deleted: true }> {
    const { profile } = await StudentProfileService.requireContext(user);
    const upload = await UploadModel.findForProfile(uploadId, profile._id);
    if (!upload) {
      throw new ApiError("NOT_FOUND", { message: "Upload not found." });
    }

    await UploadModel.deleteById(uploadId);
    void deleteStoredObject(upload, uploadId);
    return { deleted: true };
  }
}
