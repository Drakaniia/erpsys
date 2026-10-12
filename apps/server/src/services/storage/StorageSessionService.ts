import { randomUUID } from "node:crypto";
import { deriveStudentNumberFromEmail } from "../../config/constants.js";
import { KIND_FOR_STEP } from "../../config/steps.js";
import { ApiError } from "../../config/errors.js";
import { canEnterSurface } from "../../config/roles.js";
import { getDbSync } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import { env } from "../../lib/platform/env.js";
import { integrationEnabled } from "../../lib/platform/integration-settings.js";
import { createRateLimitBudget } from "../../lib/platform/rate-limit.js";
import {
  deleteR2Object,
  getR2Client,
  headObjectExists,
  presignedPutUrl,
} from "../../lib/storage/client.js";
import {
  addStoredBytes,
  getUsage,
  incOps,
  monthKey,
  shouldBlockMint,
} from "../../lib/storage/quota.js";
import {
  STORAGE_MIME_ALLOWLIST,
  STORAGE_ROUTE_CAPS,
  STORAGE_SESSION_TTL_MS,
  buildStorageFinalizeUpdate,
  buildStorageKey,
  resolveStorageKind,
  sessionFileName,
  storageRowStatus,
  validateSessionInput,
} from "../../lib/storage/sessions.js";
import {
  isR2FileKey,
  storageCategoryForRoute,
  storageSurfaceForRoute,
  type StorageRoute,
} from "../../lib/storage/storage.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UploadModel, type UploadRow } from "../../models/UploadModel.js";
import { UserModel } from "../../models/UserModel.js";
import {
  storageUploadWire,
  type StorageUploadWire,
} from "../../views/StorageView.js";
import { StudentProfileService } from "../students/StudentProfileService.js";
import { UploadAccessService } from "./UploadAccessService.js";

const STUDENT_DOMAIN = "@student.buksu.edu.ph";

export const storageSessionBudget = createRateLimitBudget({
  windowMs: 60_000,
  max: 20,
});

export type StorageSessionInput = {
  route: StorageRoute;
  stepCode?: string;
  studentProfileId?: string;
  mime: string;
  size: number;
};

export type SessionUser = { id: string; email: string; role?: string };

export type MintResult =
  | {
      kind: "ok";
      session: {
        uploadId: string;
        uploadUrl: string;
        sessionExpiresAt: string;
      };
    }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "blocked"; body: unknown };

function r2Client() {
  return getR2Client({
    endpoint: env.R2_ENDPOINT,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
  });
}

function quotaMessage(): string {
  const custom = env.R2_MAINTENANCE_MESSAGE.trim();
  return custom === ""
    ? "File uploads are temporarily paused for maintenance."
    : custom;
}

function assertStudentOwner(
  email: string,
  profile: {
    _id: string;
    userId: string;
    studentNumber?: string | null;
  },
  callerId: string,
): void {
  if (!email.trim().toLowerCase().endsWith(STUDENT_DOMAIN)) {
    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }
  if (String(profile.userId) !== callerId) {
    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }
  const local = deriveStudentNumberFromEmail(email);
  if (
    local &&
    profile.studentNumber &&
    local !== String(profile.studentNumber)
  ) {
    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }
}

async function resolveOwner(args: {
  route: StorageRoute;
  caller: SessionUser;
  studentProfileId?: string;
}): Promise<{
  owner: string;
  profileId: string;
  yearLabel: string;
  yearId: string;
}> {
  if (storageSurfaceForRoute(args.route) === "student") {
    if (args.studentProfileId) {
      throw new ApiError("BAD_REQUEST", {
        message: "studentProfileId is officer-surface only.",
      });
    }
    const { profile, year } = await StudentProfileService.requireContext(
      args.caller,
    );
    assertStudentOwner(args.caller.email, profile, args.caller.id);
    return {
      owner: args.caller.email.trim().toLowerCase(),
      profileId: String(profile._id),
      yearLabel: year.label,
      yearId: String(year._id),
    };
  }

  if (!args.studentProfileId) {
    throw new ApiError("BAD_REQUEST", {
      message: "studentProfileId is required.",
    });
  }
  const profile = await StudentProfileModel.findById(args.studentProfileId);
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
  return {
    owner,
    profileId: String(profile._id),
    yearLabel: year.label,
    yearId: String(year._id),
  };
}

async function stepKindOrThrow(args: {
  route: StorageRoute;
  stepCode: string | undefined;
  ownerProfileId: string;
  yearId: string;
}): Promise<string> {
  const kind = resolveStorageKind({
    route: args.route,
    stepCode: args.stepCode,
    kindForStep: KIND_FOR_STEP,
  });
  if (args.route !== "evidenceImage" || !args.stepCode) return kind;

  const step = await StepModel.findByCode(args.stepCode);
  if (!step) {
    throw new ApiError("NOT_FOUND", { message: "Step not configured." });
  }
  const verified = await StepVerificationModel.findByStep({
    studentProfileId: args.ownerProfileId,
    stepId: String(step._id),
    academicYearId: args.yearId,
  });
  if (verified?.status === "VERIFIED") {
    throw new ApiError("CONFLICT", {
      message: "This step is already verified.",
    });
  }
  return kind;
}

async function loadOwnOrVisible(
  uploadId: string,
  user: SessionUser,
): Promise<UploadRow> {
  const row = await UploadModel.findById(uploadId);
  if (!row) {
    throw new ApiError("NOT_FOUND", { message: "Upload not found." });
  }
  if (row.uploadedById !== user.id) {
    await UploadAccessService.assertCanView(row, user);
  }
  return row;
}

export class StorageSessionService {
  static async mint(args: {
    input: StorageSessionInput;
    caller: SessionUser;
    ip: string;
  }): Promise<MintResult> {
    const { input, caller } = args;
    if (!canEnterSurface(caller.role, storageSurfaceForRoute(input.route))) {
      throw new ApiError("FORBIDDEN", { message: "Forbidden." });
    }

    const decision = storageSessionBudget.check(
      `user:${caller.id}|ip:${args.ip}`,
    );
    if (!decision.allowed) {
      return {
        kind: "rate-limited",
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }
    validateSessionInput(input);

    const db = getDbSync();
    const month = monthKey();
    const usage = await getUsage(db, month);
    const blocked = shouldBlockMint({
      bytesStored: usage.bytesStored,
      sizeBytes: input.size,
      quotaBytes: env.R2_QUOTA_BYTES,
      classAOps: usage.classAOps,
      classBOps: usage.classBOps,
      uploadsEnabledValue:
        env.R2_UPLOADS_ENABLED && (await integrationEnabled("r2")),
      message: quotaMessage(),
    });
    if (blocked) return { kind: "blocked", body: blocked };

    const { owner, profileId, yearLabel, yearId } = await resolveOwner({
      route: input.route,
      caller,
      studentProfileId: input.studentProfileId,
    });
    const kind = await stepKindOrThrow({
      route: input.route,
      stepCode: input.stepCode,
      ownerProfileId: profileId,
      yearId,
    });

    const bucket = env.R2_BUCKET;
    const now = new Date();
    const uploadId = genId("upload");
    const key = buildStorageKey({
      academicYear: yearLabel,
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
      sessionExpiresAt: new Date(now.getTime() + STORAGE_SESSION_TTL_MS),
      createdAt: now,
      expiresAt: new Date(now.getTime() + STORAGE_SESSION_TTL_MS),
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
    return {
      kind: "ok",
      session: {
        uploadId,
        uploadUrl,
        sessionExpiresAt: new Date(
          now.getTime() + STORAGE_SESSION_TTL_MS,
        ).toISOString(),
      },
    };
  }

  static async complete(
    user: SessionUser,
    input: { uploadId: string; stepCode?: string },
  ): Promise<StorageUploadWire> {
    const row = await loadOwnOrVisible(input.uploadId, user);

    if (row.r2Status === "complete") return storageUploadWire(row);
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
      throw new ApiError("BAD_REQUEST", {
        message: "stepCode does not match.",
      });
    }

    const client = r2Client();
    const meta = await headObjectExists(client, { bucket, key });
    if (!meta) {
      throw new ApiError("NOT_FOUND", {
        message: "Upload bytes not found yet.",
      });
    }

    const route = (row.r2Route ?? "evidenceImage") as StorageRoute;
    const cap = STORAGE_ROUTE_CAPS[route] ?? 0;
    const mismatch =
      !meta.contentType ||
      !(STORAGE_MIME_ALLOWLIST as readonly string[]).includes(
        meta.contentType,
      ) ||
      (row.mimeType != null && meta.contentType !== row.mimeType) ||
      meta.sizeBytes === null ||
      meta.sizeBytes > cap ||
      (row.sizeBytes != null && meta.sizeBytes !== row.sizeBytes);
    if (mismatch) {
      await deleteR2Object(client, { bucket, key });
      throw new ApiError("UNPROCESSABLE_CONTENT", {
        message: "Stored bytes do not match the validated upload.",
      });
    }

    const kind =
      route === "evidenceImage"
        ? resolveStorageKind({
            route: "evidenceImage",
            stepCode: input.stepCode ?? row.stepCode ?? undefined,
            kindForStep: KIND_FOR_STEP,
          })
        : String(row.kind ?? resolveStorageKind({ route }));
    const finalized = buildStorageFinalizeUpdate({
      bucket,
      key,
      kind,
      mimeType: meta.contentType as string,
      sizeBytes: meta.sizeBytes as number,
    });
    await UploadModel.updateById(row._id, finalized.update);

    const db = getDbSync();
    const month = monthKey();
    await addStoredBytes(db, month, meta.sizeBytes as number);
    await incOps(db, month, { classA: 1, classB: 1 });
    console.log(`[storage] complete bucket=${bucket} key=${key}`);

    const fresh = await UploadModel.findById(row._id);
    return storageUploadWire(
      fresh ?? { ...row, ...finalized.update, fileKey: finalized.fileKey },
    );
  }

  static async status(
    user: SessionUser,
    uploadId: string,
  ): Promise<{ status: string; r2Key?: string; bytesReceived?: number }> {
    const row = await loadOwnOrVisible(uploadId, user);
    const status = storageRowStatus(row);
    if (status === "complete") {
      return row.r2Key ? { status, r2Key: row.r2Key } : { status };
    }
    if (status !== "pending") return { status };

    let bytesReceived: number | undefined;
    try {
      const meta = await headObjectExists(r2Client(), {
        bucket: String(row.r2Bucket ?? ""),
        key: String(row.r2Key ?? ""),
      });
      bytesReceived = meta?.sizeBytes ?? undefined;
    } catch {
      bytesReceived = undefined;
    }
    return bytesReceived === undefined ? { status } : { status, bytesReceived };
  }
}
