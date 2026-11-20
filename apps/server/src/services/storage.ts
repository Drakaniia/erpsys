import { randomUUID } from "node:crypto";
import {
  deriveStudentNumberFromEmail,
  findStepByCode,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { KIND_FOR_STEP } from "../config/steps.js";
import { getDbSync } from "../lib/db/db.js";
import { atomic } from "../lib/db/timestamp-ordering.js";
import { genId } from "../lib/db/ids.js";
import { env } from "../lib/platform/env.js";
import { integrationEnabled } from "../lib/platform/integration-settings.js";
import {
  deleteR2Object,
  getObjectStream,
  getR2Client,
  headObjectExists,
  presignedPutUrl,
} from "../lib/storage/client.js";
import {
  addStoredBytes,
  getUsage,
  incOps,
  monthKey,
  shouldBlockMint,
} from "../lib/storage/quota.js";
import {
  STORAGE_MIME_ALLOWLIST,
  STORAGE_ROUTE_CAPS,
  STORAGE_SESSION_TTL_MS,
  buildStorageFinalizeUpdate,
  buildStorageKey,
  resolveStorageKind,
  sessionFileName,
  storageRowStatus,
} from "../lib/storage/sessions.js";
import {
  isR2FileKey,
  parseR2FileKey,
  storageCategoryForRoute,
  storageSurfaceForRoute,
  type StorageRoute,
} from "../lib/storage/storage.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import { evidenceUploadIds } from "../config/steps.js";
import { StepVerificationModel } from "../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";

import { UploadModel, type UploadRow } from "../models/UploadModel.js";
import { UserModel } from "../models/UserModel.js";
import type { SessionUser } from "../middleware/auth.js";
import { requireStudentContext } from "./students.js";

const forbidden = () => new ApiError("FORBIDDEN", { message: "Forbidden." });

const r2Client = () =>
  getR2Client({
    endpoint: env.R2_ENDPOINT,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  });

const wire = (row: UploadRow) => ({
  id: String(row._id),
  fileKey: row.fileKey ?? null,
  fileUrl: row.fileUrl ?? null,
  kind: String(row.kind ?? ""),
  expiresAt:
    row.expiresAt instanceof Date
      ? row.expiresAt.toISOString()
      : (row.expiresAt ?? null),
  expired: false,
});

async function assertCanView(
  upload: UploadRow,
  user: SessionUser,
): Promise<void> {
  if (upload.uploadedById === user.id) return;
  const profileId =
    typeof upload.studentProfileId === "string" ? upload.studentProfileId : "";
  const callerProfile = await UserModel.findProfileByUserId(user.id);
  if (callerProfile && String(callerProfile._id) === profileId) return;
  if (user.role === "SBO_OFFICER" || user.role === "ADMIN") return;
  if (user.role === "ENROLLMENT_ADVISER") {
    const year = await AcademicYearModel.findActive();
    const enrollment =
      year &&
      (await StudentEnrollmentModel.findByProfileYear(
        profileId,
        String(year._id),
      ));
    if (year && !enrollment) return;
    if (
      enrollment &&
      (await DepartmentModel.findAdviserLink(user.id, enrollment.departmentId))
    ) {
      return;
    }
  }
  throw forbidden();
}

async function loadVisible(uploadId: string, user: SessionUser) {
  const row = await UploadModel.findById(uploadId);
  if (!row) throw new ApiError("NOT_FOUND", { message: "Upload not found." });
  await assertCanView(row, user);
  return row;
}

async function resolveOwner(
  route: StorageRoute,
  caller: SessionUser,
  studentProfileId?: string,
) {
  if (storageSurfaceForRoute(route) === "student") {
    if (studentProfileId) {
      throw new ApiError("BAD_REQUEST", {
        message: "studentProfileId is officer-surface only.",
      });
    }
    const { profile, year } = await requireStudentContext(caller);
    const email = caller.email.trim().toLowerCase();
    const local = deriveStudentNumberFromEmail(caller.email);
    if (
      String(profile.userId) !== caller.id ||
      (local &&
        profile.studentNumber &&
        local !== String(profile.studentNumber))
    ) {
      throw forbidden();
    }
    return { owner: email, profileId: String(profile._id), year };
  }

  if (!studentProfileId) {
    throw new ApiError("BAD_REQUEST", {
      message: "studentProfileId is required.",
    });
  }
  const profile = await UserModel.findProfileById(studentProfileId);
  if (!profile) {
    throw new ApiError("NOT_FOUND", { message: "Student not found." });
  }
  const ownerDoc = await UserModel.findById(profile.userId);
  const owner = String(ownerDoc?.email ?? "")
    .trim()
    .toLowerCase();
  if (!owner) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "That student has no email address.",
    });
  }
  const year = await AcademicYearModel.findActive();
  if (!year) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "No active academic year yet.",
    });
  }
  return { owner, profileId: String(profile._id), year };
}

export async function quotaBlock(size: number) {
  const usage = await getUsage(getDbSync(), monthKey());
  return shouldBlockMint({
    bytesStored: usage.bytesStored,
    sizeBytes: size,
    quotaBytes: env.R2_QUOTA_BYTES,
    classAOps: usage.classAOps,
    classBOps: usage.classBOps,
    uploadsEnabledValue:
      env.R2_UPLOADS_ENABLED && (await integrationEnabled("r2")),
    message:
      env.R2_MAINTENANCE_MESSAGE.trim() ||
      "File uploads are temporarily paused for maintenance.",
  });
}

export async function createSession(
  caller: SessionUser,
  input: {
    route: StorageRoute;
    stepCode?: string;
    studentProfileId?: string;
    mime: string;
    size: number;
  },
) {
  const { owner, profileId, year } = await resolveOwner(
    input.route,
    caller,
    input.studentProfileId,
  );
  const kind = resolveStorageKind({
    route: input.route,
    stepCode: input.stepCode,
    kindForStep: KIND_FOR_STEP,
  });
  if (input.route === "evidenceImage" && input.stepCode) {
    const step = findStepByCode(input.stepCode);
    if (!step) {
      throw new ApiError("NOT_FOUND", { message: "Step not configured." });
    }
    const verification = await StepVerificationModel.findByStep({
      studentProfileId: profileId,
      stepId: String(step._id),
      academicYearId: String(year._id),
    });
    if (verification?.status === "VERIFIED") {
      throw new ApiError("CONFLICT", {
        message: "This step is already verified.",
      });
    }
  }

  const bucket = env.R2_BUCKET;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STORAGE_SESSION_TTL_MS);
  const uploadId = genId("upload");
  const key = buildStorageKey({
    academicYear: year.label,
    category: storageCategoryForRoute(input.route),
    stepCode: input.route === "evidenceImage" ? input.stepCode : undefined,
    ownerPart: owner,
    uploadId,
    fileName: sessionFileName(input.route, uploadId, input.mime),
  });
  await UploadModel.insert({
    _id: uploadId,
    backend: "r2",
    r2Status: "pending",
    r2Bucket: bucket,
    r2Key: key,
    r2Route: input.route,
    stepCode: input.stepCode ?? null,
    mimeType: input.mime,
    sizeBytes: input.size,
    kind,
    studentProfileId: profileId,
    uploadedById: caller.id,
    fileKey: null,
    fileUrl: null,
    idempotencyKey: randomUUID(),
    sessionExpiresAt: expiresAt,
    createdAt: now,
    expiresAt,
    expiredAt: null,
    filePurgedAt: null,
    deletionRequestedAt: null,
  });

  let uploadUrl: string;
  try {
    uploadUrl = await presignedPutUrl(r2Client(), {
      bucket,
      key,
      contentType: input.mime,
      contentLength: input.size,
    });
  } catch (error) {
    await UploadModel.updateById(uploadId, { r2Status: "abandoned" });
    throw new ApiError("BAD_GATEWAY", {
      message: "Storage session mint failed — retry.",
      cause: error,
    });
  }
  console.log(
    `[storage] session minted bucket=${bucket} key=${key} uploadId=${uploadId}`,
  );
  return { uploadId, uploadUrl, sessionExpiresAt: expiresAt.toISOString() };
}

export async function completeUpload(
  user: SessionUser,
  input: { uploadId: string; stepCode?: string },
) {
  const row = await loadVisible(input.uploadId, user);
  if (row.filePurgedAt || row.deletionRequestedAt) {
    throw new ApiError("CONFLICT", { message: "This upload is being deleted." });
  }
  if (row.r2Status === "complete") return wire(row);
  if (row.fileKey && !isR2FileKey(row.fileKey)) {
    throw new ApiError("CONFLICT", {
      message: "This upload was already finalized by another backend.",
    });
  }
  const bucket = String(row.r2Bucket ?? "");
  const key = String(row.r2Key ?? "");
  if (!bucket || !key || row.backend !== "r2") {
    throw new ApiError("CONFLICT", {
      message: "This upload is not a storage upload.",
    });
  }
  if (input.stepCode && row.stepCode && input.stepCode !== row.stepCode) {
    throw new ApiError("BAD_REQUEST", { message: "stepCode does not match." });
  }

  const client = r2Client();
  const meta = await headObjectExists(client, { bucket, key });
  if (!meta) {
    await abandonUpload(row._id);
    throw new ApiError("NOT_FOUND", { message: "Upload bytes not found yet." });
  }
  const route = (row.r2Route ?? "evidenceImage") as StorageRoute;
  const { contentType, sizeBytes } = meta;
  if (
    !contentType ||
    !(STORAGE_MIME_ALLOWLIST as readonly string[]).includes(contentType) ||
    (row.mimeType != null && contentType !== row.mimeType) ||
    sizeBytes === null ||
    sizeBytes > (STORAGE_ROUTE_CAPS[route] ?? 0) ||
    (row.sizeBytes != null && sizeBytes !== row.sizeBytes)
  ) {
    await abandonUpload(row._id);
    throw new ApiError("UNPROCESSABLE_CONTENT", {
      message: "Stored bytes do not match the validated upload.",
    });
  }

  const kind =
    route === "evidenceImage"
      ? resolveStorageKind({
          route,
          stepCode: input.stepCode ?? row.stepCode ?? undefined,
          kindForStep: KIND_FOR_STEP,
        })
      : String(row.kind ?? resolveStorageKind({ route }));
  const finalized = buildStorageFinalizeUpdate({
    bucket,
    key,
    kind,
    mimeType: contentType,
    sizeBytes,
  });
  await UploadModel.updateById(row._id, finalized.update);
  const db = getDbSync();
  const month = monthKey();
  await addStoredBytes(db, month, sizeBytes);
  await incOps(db, month, { classA: 1, classB: 1 });
  console.log(`[storage] complete bucket=${bucket} key=${key}`);

  const fresh = await UploadModel.findById(row._id);
  return wire(
    fresh ?? { ...row, ...finalized.update, fileKey: finalized.fileKey },
  );
}

function storageTarget(row: UploadRow) {
  const bucket = String(row.r2Bucket ?? "");
  const key = String(row.r2Key ?? "");
  if (
    row.backend !== "r2" ||
    bucket !== env.R2_BUCKET ||
    !key.startsWith("erpsys/") ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new ApiError("CONFLICT", { message: "Upload has no safe storage target." });
  }
  return { bucket, key };
}

async function deleteStoredUpload(row: UploadRow): Promise<void> {
  const target = storageTarget(row);
  await deleteR2Object(r2Client(), target);
  const now = new Date();
  await atomic(getDbSync(), async () => {
    if (row.r2Status === "complete" && row.sizeBytes) {
      await addStoredBytes(getDbSync(), monthKey(), -row.sizeBytes);
    }
    if (row.deletionRequestedAt) {
      await UploadModel.deleteById(row._id);
      return;
    }
    await UploadModel.updateById(row._id, {
      r2Status: "abandoned",
      filePurgedAt: now,
      expiredAt: now,
    });
  });
}

export async function abandonUpload(uploadId: string): Promise<void> {
  const row = await UploadModel.findById(uploadId);
  if (!row || row.filePurgedAt || row.backend !== "r2") return;
  await UploadModel.updateById(uploadId, {
    r2Status: "abandoned",
    deletionRequestedAt: new Date(),
  });
  await deleteStoredUpload({ ...row, r2Status: "abandoned", deletionRequestedAt: new Date() });
}

export async function attachStamp(user: SessionUser, uploadId: string) {
  const row = await loadVisible(uploadId, user);
  if (row.uploadedById !== user.id) throw forbidden();
  if (row.kind !== "STAMP" || row.r2Status !== "complete" || row.filePurgedAt) {
    throw new ApiError("CONFLICT", { message: "Stamp upload is not ready." });
  }
  await UploadModel.updateById(uploadId, {
    expiresAt: null,
    expiredAt: null,
    deletionRequestedAt: null,
  });
}

export async function deleteUpload(user: SessionUser, uploadId: string) {
  const row = await UploadModel.findById(uploadId);
  if (!row) throw new ApiError("NOT_FOUND", { message: "Upload not found." });
  if (row.filePurgedAt) {
    await UploadModel.deleteById(uploadId);
    return { deleted: true };
  }
  await assertCanView(row, user);
  if (row.kind === "STAMP") {
    const owner = await UserModel.findByIds([String(row.uploadedById ?? "")]);
    if (owner.some((entry) => entry.stampSignatureUploadId === uploadId)) {
      throw new ApiError("CONFLICT", { message: "The saved stamp cannot be deleted." });
    }
  } else if (row.r2Status === "complete") {
    const verifications = await StepVerificationModel.listEvidenceByProfile(
      String(row.studentProfileId ?? ""),
    );
    const referenced = verifications.some((verification) =>
      evidenceUploadIds(verification.evidence).includes(uploadId),
    );
    if (referenced) {
      throw new ApiError("CONFLICT", {
        message: "This attachment belongs to a submission and cannot be deleted here.",
      });
    }
  }
  if (row.backend !== "r2") {
    await UploadModel.deleteById(uploadId);
    return { deleted: true };
  }
  await UploadModel.updateById(uploadId, { deletionRequestedAt: new Date() });
  try {
    await deleteStoredUpload({ ...row, deletionRequestedAt: new Date() });
  } catch (error) {
    throw new ApiError("BAD_GATEWAY", {
      message: "Could not finish deleting the stored file. Retry removal if it is still listed.",
      cause: error,
    });
  }
  return { deleted: true };
}

export async function sweepOrphanedUploads(): Promise<void> {
  const now = new Date();
  await UploadModel.updateExpiredSessions(now);
  const referenced = new Set<string>();
  for (const verification of await StepVerificationModel.listAllEvidence()) {
    for (const id of evidenceUploadIds(verification.evidence)) referenced.add(id);
  }
  const stamps = await UserModel.listStampUploadIds();
  for (const id of stamps) referenced.add(id);
  for (const row of await UploadModel.listPendingDeletion()) {
    try {
      if (referenced.has(row._id)) {
        await UploadModel.updateById(row._id, { expiresAt: null, expiredAt: null });
        continue;
      }
      await deleteStoredUpload(row);
    } catch (error) {
      console.error(`[storage] delete retry failed for upload ${row._id}`, error);
    }
  }
}

export async function uploadStatus(user: SessionUser, uploadId: string) {
  const row = await loadVisible(uploadId, user);
  const status = storageRowStatus(row);
  if (status === "complete") {
    return row.r2Key ? { status, r2Key: row.r2Key } : { status };
  }
  if (status !== "pending") return { status };
  const bytesReceived = await headObjectExists(r2Client(), {
    bucket: String(row.r2Bucket ?? ""),
    key: String(row.r2Key ?? ""),
  }).then(
    (meta) => meta?.sizeBytes ?? undefined,
    () => undefined,
  );
  return bytesReceived === undefined ? { status } : { status, bytesReceived };
}

export async function openContent(
  uploadId: string,
  user: SessionUser,
  range?: string,
) {
  const row = await UploadModel.findById(uploadId);
  const parsed = parseR2FileKey(row?.fileKey);
  if (!row || !parsed || row.backend !== "r2") return null;
  await assertCanView(row, user);
  return getObjectStream(r2Client(), {
    bucket: parsed.bucket,
    key: parsed.key,
    ...(range ? { range } : {}),
  });
}
