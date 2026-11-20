import { z } from "zod";
import {
  PRE_ENROLLMENT_STEP_CODES,
  findStepById,
  listStepsByCodes,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { escapeQueryRegex } from "../config/queue.js";
import { REPORT_ROW_CAP } from "../config/report.js";
import { evidenceUploadIds } from "../config/steps.js";
import { genId } from "../lib/db/ids.js";
import { isR2FileKey } from "../lib/storage/storage.js";
import type { AcademicYearRow } from "../models/AcademicYearModel.js";
import { NotificationModel } from "../models/NotificationModel.js";
import { ContentModel } from "../models/ContentModel.js";

import { StepVerificationModel } from "../models/StepVerificationModel.js";

import { UploadModel } from "../models/UploadModel.js";
import { UserModel } from "../models/UserModel.js";
import { activeYearOrThrow } from "./academic-years.js";

const iso = (date: Date | null | undefined) =>
  date ? new Date(date).toISOString() : null;

export const submissionListQuery = z.object({
  step: z.enum(PRE_ENROLLMENT_STEP_CODES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(["submittedAt", "studentName", "status"]).default("submittedAt"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(100).default(""),
  status: z
    .enum(["ALL", "PENDING", "SUBMITTED", "VERIFIED", "RETURNED"])
    .default("ALL"),
  evidence: z.enum(["ALL", "HAS", "NONE"]).default("ALL"),
  range: z.enum(["ALL", "today", "7d", "30d", "year"]).default("ALL"),
});

type SubmissionFilterInput = Omit<
  z.infer<typeof submissionListQuery>,
  "page" | "pageSize"
>;

type Person = { name?: string | null; email?: string | null };

export const displayName = (user: Person | undefined | null): string =>
  user?.name?.trim() || user?.email?.split("@")[0]?.trim() || "Unknown";

const displayImage = (
  user: { image?: string | null } | undefined,
): string | null => user?.image?.trim() || null;

const isoOf = (...dates: (Date | null | undefined)[]): string => {
  const found = dates.find((date) => date);
  return found ? new Date(found).toISOString() : "";
};

async function loadSubmissions(
  year: AcademicYearRow,
  stepIds: string[],
  input: SubmissionFilterInput,
  skip: number,
  limit: number,
  queue = false,
) {
  const where: Record<string, unknown> = {
    academicYearId: String(year._id),
    stepId: { $in: stepIds },
  };
  const text = input.q.trim();
  if (text) {
    const rx = { $regex: escapeQueryRegex(text), $options: "i" };
    const [byNumber, byName] = await Promise.all([
      UserModel.searchProfilesByStudentNumber(rx),
      UserModel.searchByName(rx),
    ]);
    const viaUser = await UserModel.listProfilesByUserIds(
      byName.map((user) => String(user._id)),
    );
    const ids = [
      ...new Set([...byNumber, ...viaUser].map((p) => String(p._id))),
    ];
    if (ids.length === 0) where["_id"] = "__no_match__";
    else where["studentProfileId"] = { $in: ids };
  }
  if (queue) {
    where["$and"] = [
      {
        $or: [
          { status: { $in: ["APPLIED", "SUBMITTED"] } },
          { status: "PENDING", appliedAt: { $gt: new Date(0) } },
        ],
      },
    ];
  } else if (input.status !== "ALL") where["status"] = input.status;
  if (input.range !== "ALL") {
    const now = Date.now();
    const from =
      input.range === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : input.range === "7d"
          ? new Date(now - 7 * 86_400_000)
          : input.range === "30d"
            ? new Date(now - 30 * 86_400_000)
            : year.createdAt;
    where["$or"] = [
      { appliedAt: { $gte: from } },
      { appliedAt: { $exists: false } },
    ];
  }
  if (input.evidence === "HAS") where["evidenceCount"] = { $gt: 0 };
  else if (input.evidence === "NONE") where["evidenceCount"] = 0;

  const direction = input.dir === "asc" ? 1 : -1;
  const sort: Record<string, 1 | -1> =
    input.sort === "studentName"
      ? { createdAt: direction }
      : input.sort === "status"
        ? { status: direction, createdAt: direction }
        : input.dir === "asc"
          ? queue
            ? { appliedAt: 1, createdAt: 1 }
            : { status: 1, createdAt: 1 }
          : queue
            ? { appliedAt: -1, createdAt: -1 }
            : { createdAt: -1 };
  const [total, rows] = await Promise.all([
    StepVerificationModel.countWhere(where),
    StepVerificationModel.search(where, sort, skip, limit),
  ]);
  const profiles = await UserModel.findProfilesByIds([
    ...new Set(rows.map((row) => String(row.studentProfileId))),
  ]);
  const users = await UserModel.findByIds(
    profiles.map((profile) => String(profile.userId)),
  );
  const profileById = new Map(profiles.map((p) => [String(p._id), p]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  return {
    total,
    rows: rows.map((row) => {
      const profile = profileById.get(String(row.studentProfileId));
      return {
        row,
        profile,
        user: profile ? userById.get(String(profile.userId)) : undefined,
      };
    }),
  };
}

function sortByName<T extends { student: { name: string } }>(
  items: T[],
  input: SubmissionFilterInput,
): T[] {
  if (input.sort !== "studentName") return items;
  return items.sort((a, b) => {
    const cmp = a.student.name.localeCompare(b.student.name, undefined, {
      numeric: true,
    });
    return input.dir === "asc" ? cmp : -cmp;
  });
}

export async function submissionRegister(
  input: SubmissionFilterInput,
  stepCode: string,
) {
  const year = await activeYearOrThrow();
  const [step] = listStepsByCodes([stepCode]);
  if (!step) {
    throw new ApiError("NOT_FOUND", { message: "Step not configured." });
  }
  const { total: matchedCount, rows } = await loadSubmissions(
    year,
    [String(step._id)],
    input,
    0,
    REPORT_ROW_CAP,
  );
  const verifiers = await UserModel.findByIds(
    rows.flatMap(({ row }) =>
      typeof row.verifiedById === "string" ? [row.verifiedById] : [],
    ),
  );
  const verifierById = new Map(verifiers.map((u) => [String(u._id), u]));
  const items = rows.map(({ row, profile, user }) => ({
    student: {
      studentProfileId: String(row.studentProfileId),
      name: displayName(user),
      studentNumber: profile?.studentNumber ?? null,
    },
    status: String(row.status),
    submittedAt: isoOf(row.appliedAt, row.createdAt),
    verifiedAt: row.verifiedAt ? new Date(row.verifiedAt).toISOString() : null,
    verifiedByName: row.verifiedById
      ? (verifierById.get(String(row.verifiedById))?.name ?? null)
      : null,
    evidenceCount: evidenceUploadIds(row.evidence).length,
    hasReply: Boolean(row.respondedAt ?? row.replyNote),
  }));
  return {
    year: {
      id: String(year._id),
      label: year.label,
      semesterLabel: year.semesterLabel,
    },
    step: { code: stepCode, name: step.name ?? "" },
    rows: sortByName(items, input),
    matchedCount,
    truncated: matchedCount > REPORT_ROW_CAP,
  };
}

export async function submissionPage(
  input: z.infer<typeof submissionListQuery>,
) {
  const year = await activeYearOrThrow();
  const steps = listStepsByCodes(
    input.step ? [input.step] : [...PRE_ENROLLMENT_STEP_CODES],
  );
  if (input.step && steps.length === 0) {
    throw new ApiError("NOT_FOUND", { message: "Step not configured." });
  }
  const { total, rows } = await loadSubmissions(
    year,
    steps.map((step) => String(step._id)),
    input,
    (input.page - 1) * input.pageSize,
    input.pageSize,
    true,
  );
  const uploads = await UploadModel.findByIds(
    rows.flatMap(({ row }) => evidenceUploadIds(row.evidence)),
  );
  const uploadById = new Map(uploads.map((u) => [String(u._id), u]));
  const stepById = new Map(steps.map((step) => [String(step._id), step]));
  const items = rows.map(({ row, profile, user }) => {
    const ids = evidenceUploadIds(row.evidence);
    const step = stepById.get(String(row.stepId));
    return {
      verificationId: String(row._id),
      student: {
        id: String(row.studentProfileId),
        name: displayName(user),
        studentNumber: profile?.studentNumber ?? null,
        image: displayImage(user),
      },
      status: String(row.status),
      submittedAt: isoOf(row.appliedAt, row.createdAt),
      verifiedAt: row.verifiedAt
        ? new Date(row.verifiedAt).toISOString()
        : null,
      evidence: ids
        .map((id) => {
          const upload = uploadById.get(id);
          return {
            id,
            fileUrl: upload?.fileUrl ?? "",
            fileKey: upload?.fileKey ?? null,
            mime: upload?.mimeType ?? null,
            name: null,
            kind: upload?.kind ?? "",
          };
        })
        .filter((entry) => entry.fileUrl || isR2FileKey(entry.fileKey)),
      evidenceCount: ids.length,
      hasGoogleFormsResponse:
        step?.code === "PROFILING" && Array.isArray(row.answers),
      hasReply: Boolean(row.respondedAt ?? row.replyNote),
      stepCode: step?.code ?? input.step ?? null,
      stepName: step?.name ?? "",
    };
  });
  return { data: sortByName(items, input), total };
}

async function currentCycle(verificationId: string) {
  const existing = await StepVerificationModel.findById(verificationId);
  if (!existing) {
    throw new ApiError("NOT_FOUND", { message: "Verification not found." });
  }
  const year = await activeYearOrThrow();
  if (String(existing.academicYearId) !== String(year._id)) {
    throw new ApiError("CONFLICT", {
      message: "This record belongs to an archived academic year.",
    });
  }
  return existing;
}

async function notify(
  verification: { studentProfileId: string; stepId: string },
  type: string,
  title: (name: string) => string,
  body: (name: string) => string,
): Promise<void> {
  const profile = await UserModel.findProfileById(
    String(verification.studentProfileId),
  );
  if (!profile) return;
  const step = findStepById(String(verification.stepId));
  const name = step?.name ?? "Step";
  await NotificationModel.insert({
    _id: genId("notification"),
    userId: String(profile.userId),
    type,
    title: title(name),
    body: body(name),
    createdAt: new Date(),
  });
}

export async function submissionDetail(verificationId: string) {
  const row = await StepVerificationModel.findById(verificationId);
  if (!row) {
    throw new ApiError("NOT_FOUND", { message: "Verification not found." });
  }
  const [step, profile, uploads] = await Promise.all([
    findStepById(String(row.stepId)),
    UserModel.findProfileById(String(row.studentProfileId)),
    UploadModel.findByIds(evidenceUploadIds(row.evidence)),
  ]);
  const code = step?.code ?? "ASSESSMENT";
  const requirements = (
    PRE_ENROLLMENT_STEP_CODES as readonly string[]
  ).includes(code)
    ? await ContentModel.listActive()
    : [];
  const users = await UserModel.findByIds(
    [
      row.verifiedById,
      row.revokedById,
      row.respondedById,
      profile?.userId,
    ].filter((id): id is string => typeof id === "string"),
  );
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const userOf = (id: string | null | undefined) =>
    id ? byId.get(String(id)) : undefined;
  const verifiedBy = userOf(row.verifiedById);
  const revokedBy = userOf(row.revokedById);
  const respondedBy = userOf(row.respondedById);
  const studentUser = userOf(profile?.userId);
  return {
    verificationId,
    step: { code, name: step?.name ?? "", order: step?.order ?? 0 },
    student: {
      id: String(row.studentProfileId),
      name: displayName(studentUser),
      studentNumber: profile?.studentNumber ?? null,
      email: studentUser?.email ?? null,
      image: displayImage(studentUser),
    },
    status: row.status,
    submittedAt: iso(row.appliedAt ?? row.createdAt) ?? "",
    appliedAt: iso(row.appliedAt),
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
            chips: Array.isArray(row.replyChips)
              ? row.replyChips.filter(
                  (chip): chip is string => typeof chip === "string",
                )
              : [],
            note: row.replyNote ?? null,
            respondedById: String(respondedBy._id),
            respondedByName: respondedBy.name ?? "",
            respondedAt: new Date(row.respondedAt).toISOString(),
          }
        : null,
  };
}

export async function verifySubmission(
  officerId: string,
  verificationId: string,
) {
  const existing = await currentCycle(verificationId);
  if (existing.status !== "VERIFIED") {
    await StepVerificationModel.updateById(existing._id, {
      status: "VERIFIED",
      verifiedById: officerId,
      verifiedAt: new Date(),
    });
    await notify(
      existing,
      "STEP_VERIFIED",
      (name) => `${name} verified`,
      (name) => `Your ${name} was verified by an SBO officer.`,
    );
  }
  return { verificationId, status: "VERIFIED" as const };
}

export async function revokeSubmission(
  officerId: string,
  verificationId: string,
) {
  const existing = await currentCycle(verificationId);
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
  await notify(
    existing,
    "STEP_REVOKED",
    (name) => `${name} stamp revoked`,
    (name) =>
      `An SBO officer revoked your ${name} stamp — apply again when you're ready.`,
  );
  return { verificationId, status: "PENDING" as const };
}

export async function replyToSubmission(
  officerId: string,
  verificationId: string,
  input: { chips: string[]; note?: string },
) {
  const existing = await currentCycle(verificationId);
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
  await notify(
    existing,
    "STEP_RETURNED",
    (name) => `${name} returned`,
    () =>
      input.note || input.chips.join(", ") || "Your submission needs changes.",
  );
  return { verificationId, status: "RETURNED" as const };
}

export async function captureMugshot(
  officerId: string,
  verificationId: string,
  input: { fileKey: string; fileUrl: string },
) {
  const existing = await currentCycle(verificationId);
  const step = findStepById(String(existing.stepId));
  if (step?.code !== "MUGSHOT") {
    throw new ApiError("CONFLICT", {
      message: "Mugshot capture is only for the Mugshot step.",
    });
  }
  if (existing.status === "VERIFIED") {
    throw new ApiError("CONFLICT", {
      message: "This step is already verified — revoke the stamp to recapture.",
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
  const ids = [...evidenceUploadIds(existing.evidence), uploadId];
  await StepVerificationModel.updateById(existing._id, {
    evidence: { uploadIds: ids },
    evidenceCount: ids.length,
    status: "VERIFIED",
    verifiedById: officerId,
    verifiedAt: now,
  });
  await notify(
    existing,
    "STEP_VERIFIED",
    () => "Mugshot verified",
    () => "Your Mugshot was verified by an SBO officer.",
  );
  return { verificationId, status: "VERIFIED" as const, uploadId };
}
