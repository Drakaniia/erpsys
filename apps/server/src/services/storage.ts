import { randomUUID } from "node:crypto";
import { deriveStudentNumberFromEmail } from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { KIND_FOR_STEP } from "../config/steps.js";
import { getDbSync } from "../lib/db/db.js";
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
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { StepModel } from "../models/StepModel.js";
import { StepVerificationModel } from "../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../models/StudentProfileModel.js";
import { UploadModel, type UploadRow } from "../models/UploadModel.js";
import { UserModel } from "../models/UserModel.js";
import type { SessionUser } from "../middleware/auth.js";
import { requireStudentContext } from "./students.js";

const STUDENT_DOMAIN = "@student.buksu.edu.ph";

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
  const callerProfile = await StudentProfileModel.findByUserId(user.id);
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
      (await AdviserDepartmentModel.findLink(user.id, enrollment.departmentId))
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
      !email.endsWith(STUDENT_DOMAIN) ||
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
  const profile = await StudentProfileModel.findById(studentProfileId);
  if (!profile) {
    throw new ApiError("NOT_FOUND", { message: "Student not found." });
  }
  const ownerDoc = await UserModel.findById(profile.userId);
  const owner = String(ownerDoc?.email ?? "")
    .trim()
    .toLowerCase();
  if (!owner.endsWith(STUDENT_DOMAIN)) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "That student has no school email address.",
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
    const step = await StepModel.findByCode(input.stepCode);
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
    await deleteR2Object(client, { bucket, key });
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
