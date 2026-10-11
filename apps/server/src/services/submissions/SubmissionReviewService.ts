import { ApiError } from "../../config/errors.js";
import { PRE_ENROLLMENT_STEP_CODES } from "../../config/constants.js";
import { genId } from "../../lib/db/ids.js";
import { isR2FileKey } from "../../lib/storage/storage.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { RequirementModel } from "../../models/RequirementModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UploadModel } from "../../models/UploadModel.js";
import { UserModel } from "../../models/UserModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import type { UserRow } from "../../models/UserModel.js";

function displayNameOf(user: UserRow | undefined): string {
  const name = user?.name?.trim() ?? "";
  if (name) return name;
  const local = user?.email?.split("@")[0]?.trim() ?? "";
  return local || "Unknown";
}

function displayImageOf(user: UserRow | undefined): string | null {
  const image = user?.image?.trim() ?? "";
  return image || null;
}

function evidenceIds(evidence: unknown): string[] {
  const ids = (evidence as { uploadIds?: unknown } | null)?.uploadIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

function isoOf(...dates: (Date | null | undefined)[]): string {
  const found = dates.find((date) => date);
  return found ? new Date(found).toISOString() : "";
}

export class SubmissionReviewService {
  private static async currentCycle(verificationId: string) {
    const existing = await StepVerificationModel.findById(verificationId);
    if (!existing) {
      throw new ApiError("NOT_FOUND", { message: "Verification not found." });
    }
    const year = await AcademicYearService.activeOrThrow();
    if (String(existing.academicYearId) !== String(year._id)) {
      throw new ApiError("CONFLICT", {
        message: "This record belongs to an archived academic year.",
      });
    }
    return existing;
  }

  private static async stepName(stepId: string): Promise<string> {
    const step = await StepModel.findById(stepId);
    return step?.name ?? "Step";
  }

  private static async notify(
    studentProfileId: string,
    stepId: string,
    type: string,
    title: (name: string) => string,
    body: (name: string) => string,
  ): Promise<void> {
    const profile = await StudentProfileModel.findById(studentProfileId);
    if (!profile) return;
    const name = await SubmissionReviewService.stepName(stepId);
    await NotificationModel.insert({
      _id: genId("notification"),
      userId: String(profile.userId),
      type,
      title: title(name),
      body: body(name),
      createdAt: new Date(),
    });
    publishToUser(String(profile.userId), "notifications");
  }

  static async detail(verificationId: string) {
    const row = await StepVerificationModel.findById(verificationId);
    if (!row) {
      throw new ApiError("NOT_FOUND", { message: "Verification not found." });
    }
    const [step, profile, uploads] = await Promise.all([
      StepModel.findById(String(row.stepId)),
      StudentProfileModel.findById(String(row.studentProfileId)),
      UploadModel.findByIds(evidenceIds(row.evidence)),
    ]);
    const code = (step?.code ?? "ASSESSMENT") as string;
    const isOfficerStep = (
      PRE_ENROLLMENT_STEP_CODES as readonly string[]
    ).includes(code);
    const requirements = isOfficerStep
      ? await RequirementModel.listActive()
      : [];
    const userIds = [
      row.verifiedById,
      row.revokedById,
      row.respondedById,
      profile?.userId,
    ].filter((id): id is string => typeof id === "string");
    const users = await UserModel.findByIds(userIds);
    const byId = new Map(users.map((user) => [String(user._id), user]));
    const verifiedBy = row.verifiedById
      ? byId.get(String(row.verifiedById))
      : undefined;
    const revokedBy = row.revokedById
      ? byId.get(String(row.revokedById))
      : undefined;
    const respondedBy = row.respondedById
      ? byId.get(String(row.respondedById))
      : undefined;
    const studentUser = profile ? byId.get(String(profile.userId)) : undefined;
    const chips = Array.isArray(row.replyChips)
      ? row.replyChips.filter(
          (chip): chip is string => typeof chip === "string",
        )
      : [];
    return {
      verificationId,
      step: { code, name: step?.name ?? "", order: step?.order ?? 0 },
      student: {
        id: String(row.studentProfileId),
        name: displayNameOf(studentUser),
        studentNumber: profile?.studentNumber ?? null,
        email: studentUser?.email ?? null,
        image: displayImageOf(studentUser),
      },
      status: row.status,
      submittedAt: isoOf(row.appliedAt ?? row.createdAt),
      appliedAt: row.appliedAt ? new Date(row.appliedAt).toISOString() : null,
      answers: row.answers ?? [],
      evidence: uploads
        .filter(
          (upload) =>
            typeof upload.fileUrl === "string" ||
            (typeof upload.fileKey === "string" && isR2FileKey(upload.fileKey)),
        )
        .map((upload) => ({
          id: String(upload._id),
          fileKey: upload.fileKey ?? null,
          fileUrl: upload.fileUrl ?? "",
          mime: upload.mimeType ?? null,
          name: null,
          kind: upload.kind ?? "",
        })),
      requirements: requirements.map((item) => ({
        id: String(item._id),
        label: item.label,
      })),
      stamp:
        row.verifiedAt && verifiedBy
          ? {
              verifiedById: String(verifiedBy._id),
              verifiedByName: verifiedBy.name ?? "",
              verifiedAt: new Date(row.verifiedAt).toISOString(),
              stampName: verifiedBy.stampName ?? verifiedBy.name ?? "",
              stampGraphicUrl: verifiedBy.stampGraphicUrl ?? null,
              stampSignatureUrl: verifiedBy.stampSignatureUrl ?? null,
            }
          : null,
      revocation:
        row.revokedAt && revokedBy
          ? {
              revokedById: String(revokedBy._id),
              revokedByName: revokedBy.name ?? "",
              revokedAt: new Date(row.revokedAt).toISOString(),
            }
          : null,
      reply:
        row.respondedAt && respondedBy
          ? {
              chips,
              note: row.replyNote ?? null,
              respondedById: String(respondedBy._id),
              respondedByName: respondedBy.name ?? "",
              respondedAt: new Date(row.respondedAt).toISOString(),
            }
          : null,
    };
  }

  static async verify(officerId: string, verificationId: string) {
    const existing = await SubmissionReviewService.currentCycle(verificationId);
    if (existing.status === "VERIFIED") {
      return { verificationId, status: "VERIFIED" as const };
    }
    await StepVerificationModel.updateById(existing._id, {
      status: "VERIFIED",
      verifiedById: officerId,
      verifiedAt: new Date(),
    });
    await SubmissionReviewService.notify(
      String(existing.studentProfileId),
      String(existing.stepId),
      "STEP_VERIFIED",
      (name) => `${name} verified`,
      (name) => `Your ${name} was verified by an SBO officer.`,
    );
    return { verificationId, status: "VERIFIED" as const };
  }

  static async revoke(officerId: string, verificationId: string) {
    const existing = await SubmissionReviewService.currentCycle(verificationId);
    if (existing.status !== "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message: "Only verified steps can be revoked.",
      });
    }
    await StepVerificationModel.revoke(
      String(existing.studentProfileId),
      String(existing.stepId),
      String(existing.academicYearId),
      officerId,
      new Date(),
      true,
    );
    await SubmissionReviewService.notify(
      String(existing.studentProfileId),
      String(existing.stepId),
      "STEP_REVOKED",
      (name) => `${name} stamp revoked`,
      (name) =>
        `An SBO officer revoked your ${name} stamp — apply again when you're ready.`,
    );
    return { verificationId, status: "PENDING" as const };
  }

  static async captureMugshot(
    officerId: string,
    verificationId: string,
    input: { fileKey: string; fileUrl: string },
  ) {
    const existing = await SubmissionReviewService.currentCycle(verificationId);
    const step = await StepModel.findById(String(existing.stepId));
    if (step?.code !== "MUGSHOT") {
      throw new ApiError("CONFLICT", {
        message: "Mugshot capture is only for the Mugshot step.",
      });
    }
    if (existing.status === "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message:
          "This step is already verified — revoke the stamp to recapture.",
      });
    }
    const now = new Date();
    const uploadId = genId("upload");
    await UploadModel.insert({
      _id: uploadId,
      fileKey: input.fileKey,
      fileUrl: input.fileUrl,
      kind: "MUGSHOT",
      uploadedById: officerId,
      studentProfileId: String(existing.studentProfileId),
      createdAt: now,
    });
    const ids = [...evidenceIds(existing.evidence), uploadId];
    await StepVerificationModel.updateById(existing._id, {
      evidence: { uploadIds: ids },
      evidenceCount: ids.length,
      status: "VERIFIED",
      verifiedById: officerId,
      verifiedAt: now,
    });
    await SubmissionReviewService.notify(
      String(existing.studentProfileId),
      String(existing.stepId),
      "STEP_VERIFIED",
      () => "Mugshot verified",
      () => "Your Mugshot was verified by an SBO officer.",
    );
    return { verificationId, status: "VERIFIED" as const, uploadId };
  }

  static async reply(
    officerId: string,
    verificationId: string,
    input: { chips: string[]; note?: string },
  ) {
    const existing = await SubmissionReviewService.currentCycle(verificationId);
    if (existing.status === "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message: "Cannot return a verified step — revoke the stamp first.",
      });
    }
    await StepVerificationModel.updateById(existing._id, {
      status: "RETURNED",
      replyChips: input.chips,
      replyNote: input.note ?? null,
      respondedById: officerId,
      respondedAt: new Date(),
    });
    await SubmissionReviewService.notify(
      String(existing.studentProfileId),
      String(existing.stepId),
      "STEP_RETURNED",
      (name) => `${name} returned`,
      () =>
        input.note ||
        input.chips.join(", ") ||
        "Your submission needs changes.",
    );
    return { verificationId, status: "RETURNED" as const };
  }
}
