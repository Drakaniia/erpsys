import { draftExpiresAt } from "../../config/evidence.js";
import { ApiError } from "../../config/errors.js";
import {
  buildR2FileKey,
  type StorageCategory,
  type StorageRoute,
} from "./storage.js";

export const STORAGE_MB = 1024 * 1024;

export const STORAGE_ROUTE_CAPS: Record<StorageRoute, number> = {
  evidenceImage: 10 * STORAGE_MB,
  mugshotCapture: 10 * STORAGE_MB,
  stampImage: 5 * STORAGE_MB,
};

export const STORAGE_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const STORAGE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const STORAGE_STAMP_KIND = "STAMP";

export function validateSessionInput(args: {
  route: StorageRoute;
  mime: string;
  size: number;
}): void {
  const cap = STORAGE_ROUTE_CAPS[args.route];
  if (cap === undefined) {
    throw new ApiError("BAD_REQUEST", { message: "Unknown upload route." });
  }
  if (!(STORAGE_MIME_ALLOWLIST as readonly string[]).includes(args.mime)) {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", {
      message: "Only JPEG, PNG, WebP, or PDF files are accepted.",
    });
  }
  if (!Number.isInteger(args.size) || args.size <= 0) {
    throw new ApiError("BAD_REQUEST", { message: "Size must be positive." });
  }
  if (args.size > cap) {
    throw new ApiError("PAYLOAD_TOO_LARGE", {
      message: `Files on this route are capped at ${cap / STORAGE_MB}MB.`,
    });
  }
}

export function resolveStorageKind(args: {
  route: StorageRoute;
  stepCode?: string;
  kindForStep?: Record<string, string>;
}): string {
  if (args.route === "mugshotCapture") return "MUGSHOT";
  if (args.route === "stampImage") return STORAGE_STAMP_KIND;
  const kind = args.stepCode ? args.kindForStep?.[args.stepCode] : undefined;
  if (!kind) {
    throw new ApiError("BAD_REQUEST", {
      message: "A known stepCode is required for evidence uploads.",
    });
  }
  return kind;
}

const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function extForMime(mime: string): string {
  return EXT_FOR_MIME[mime] ?? "bin";
}

export function sessionFileName(
  route: StorageRoute,
  uploadId: string,
  mime: string,
): string {
  return `${route}-${uploadId}.${extForMime(mime)}`;
}

const SAFE_SEGMENT = /[^A-Za-z0-9._-]+/g;

function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = raw.replace(SAFE_SEGMENT, "").replace(/^\.+/, "");
  if (cleaned === "" || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

export function buildStorageKey(args: {
  academicYear: string;
  category: StorageCategory;
  stepCode?: string;
  ownerPart: string;
  uploadId: string;
  fileName: string;
}): string {
  const year = sanitizeSegment(args.academicYear, "unknown-year");
  const owner = sanitizeSegment(args.ownerPart, "unknown-owner");
  const upload = sanitizeSegment(args.uploadId, "unknown-upload");
  const name = sanitizeSegment(args.fileName, "file");
  const step =
    args.stepCode === undefined
      ? null
      : sanitizeSegment(args.stepCode, "unknown-step");
  const prefix = `erpsys/${year}/${args.category}`;
  const scoped = step === null ? prefix : `${prefix}/${step}`;
  return `${scoped}/${owner}/${upload}-${name}`;
}

export function storageRowStatus(row: {
  r2Status?: string | null;
}): "pending" | "complete" | "abandoned" {
  if (row.r2Status === "complete") return "complete";
  if (row.r2Status === "abandoned") return "abandoned";
  return "pending";
}

export function buildStorageFinalizeUpdate(args: {
  bucket: string;
  key: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  now?: Date;
}): { fileKey: string; update: Record<string, unknown> } {
  const now = args.now ?? new Date();
  const fileKey = buildR2FileKey(args.bucket, args.key);
  return {
    fileKey,
    update: {
      backend: "r2",
      r2Status: "complete",
      r2Bucket: args.bucket,
      r2Key: args.key,
      fileKey,
      fileUrl: null,
      kind: args.kind,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      expiresAt: draftExpiresAt(now),
      expiredAt: null,
    },
  };
}
