import { useCallback } from "react";
import { ROUTES } from "$lib/api-routes";
import { compressImageFile, isCompressibleImage } from "./compress";
// Single source is $lib/domain/types (type-only copy; importing it
// never pulls server runtime or the Mongo driver into the web bundle).
// Local aliases preserve web names.
import type {
  StorageRoute,
  StorageSessionRequest,
  StorageSessionResponse,
  StorageSessionStatusResponse,
} from "$lib/domain/types";

export type { StorageRoute };

export type MintSessionInput = StorageSessionRequest;

export type MintSessionOutput = StorageSessionResponse;

export type SessionStatus = StorageSessionStatusResponse;

export type UploadRow = {
  id: string;
  fileKey: string;
  fileUrl: string | null;
  kind: string;
  mime?: string | null;
};

export type StorageResult = {
  fileKey: string;
  fileUrl: string;
  uploadId: string;
};

// Locked per spec §7 — same as Drive v2.
export const STORAGE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const STORAGE_ACCEPT_LIST = STORAGE_ACCEPT.split(",");
const MB = 1024 * 1024;

export const MAX_BYTES_BY_ROUTE: Record<StorageRoute, number> = {
  evidenceImage: 10 * MB,
  mugshotCapture: 10 * MB,
  stampImage: 5 * MB,
};

export const MAX_INPUT_BYTES_BY_ROUTE: Record<StorageRoute, number> = {
  evidenceImage: 40 * MB,
  mugshotCapture: 40 * MB,
  stampImage: 20 * MB,
};

export const STORAGE_MAINTENANCE_MESSAGE =
  "Uploads are temporarily paused for maintenance — please try again later.";

export function validateStorageFile(
  file: File,
  route: StorageRoute,
): string | null {
  if (!STORAGE_ACCEPT_LIST.includes(file.type))
    return "File type not supported — use JPEG, PNG, WebP or PDF.";
  const cap = MAX_BYTES_BY_ROUTE[route];
  if (file.size <= cap) return null;
  if (!isCompressibleImage(file))
    return `File too large — max ${Math.round(cap / MB)} MB.`;
  const ceiling = MAX_INPUT_BYTES_BY_ROUTE[route];
  if (file.size > ceiling)
    return `File too large — images up to ${Math.round(ceiling / MB)} MB are accepted.`;
  return null;
}

function maintenanceError(res: Response): Error | null {
  if (res.status !== 503) return null;
  return new Error(STORAGE_MAINTENANCE_MESSAGE);
}

function apiBase(): string {
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ""
  ).replace(/\/+$/, "");
}

/**
 * Server failures arrive as `{ error }` (errorHandler) or `{ message }`
 * (quota/rate-limit guards) — surface that copy instead of a bare status so
 * the next "Upload failed" report names the cause (step, quota, auth, …).
 */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.clone().json()) as {
      error?: unknown;
      message?: unknown;
    };
    if (typeof body?.error === "string" && body.error) return body.error;
    if (typeof body?.message === "string" && body.message) return body.message;
  } catch {
    // Non-JSON failure (proxy, gateway, R2 XML) — fall through to status.
  }
  return fallback;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Network error — check connection and try again.");
  }
  const maintenance = maintenanceError(res);
  if (maintenance) throw maintenance;
  if (!res.ok)
    throw new Error(await errorMessage(res, `Request failed (${res.status})`));
  const json = (await res.json()) as { data?: T } | T;
  return (
    json && typeof json === "object" && "data" in json
      ? (json as { data: T }).data
      : json
  ) as T;
}

async function getStatus(uploadId: string): Promise<SessionStatus> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase()}${ROUTES.storage.sessionStatus.path}?uploadId=${encodeURIComponent(uploadId)}`,
      { credentials: "include" },
    );
  } catch {
    throw new Error("Network error — check connection and try again.");
  }
  const maintenance = maintenanceError(res);
  if (maintenance) throw maintenance;
  if (!res.ok)
    throw new Error(await errorMessage(res, `Request failed (${res.status})`));
  const json = (await res.json()) as { data?: SessionStatus } | SessionStatus;
  return (
    json && typeof json === "object" && "data" in json
      ? (json as { data: SessionStatus }).data
      : json
  ) as SessionStatus;
}

/** Single PUT of bytes direct to R2; server HeadObject verifies on /complete. */
async function putBytes(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "Content-Length": String(file.size),
      },
      body: file,
    });
  } catch {
    // CORS rejection and offline/aborted PUTs both land here.
    throw new Error(
      "Network error during upload — check connection and try again.",
    );
  }
  const maintenance = maintenanceError(res);
  if (maintenance) throw maintenance;
  // R2 answers errors as XML, so the status is the diagnosable signal:
  // 403 is usually a CORS/signature mismatch on the bucket.
  if (!res.ok) throw new Error(`Upload failed (${res.status}) — tap to retry.`);
  onProgress(100);
}

async function complete(uploadId: string): Promise<UploadRow> {
  return postJson<UploadRow>(ROUTES.storage.completeUpload.path, { uploadId });
}

/**
 * R2 upload: mint session → PUT bytes direct to uploadUrl → /complete
 * (idempotent on uploadId, so retries converge). On any PUT/complete error,
 * first GET session-status: server-complete → finish /complete; abandoned →
 * throw; otherwise retry the PUT once, then /complete once more.
 */
export function useStorageUpload(route: StorageRoute) {
  const upload = useCallback(
    async (
      file: File,
      opts?: {
        stepCode?: string;
        studentProfileId?: string;
        onProgress?: (pct: number) => void;
      },
    ): Promise<StorageResult> => {
      const onProgress = opts?.onProgress ?? (() => {});
      const prepared = await compressImageFile(file);
      const cap = MAX_BYTES_BY_ROUTE[route];
      if (prepared.size > cap)
        throw new Error(
          `File too large — max ${Math.round(cap / MB)} MB after compression.`,
        );

      const session = await postJson<MintSessionOutput>(
        ROUTES.storage.mintSession.path,
        {
          route,
          stepCode: opts?.stepCode,
          studentProfileId: opts?.studentProfileId,
          mime: prepared.type,
          size: prepared.size,
        },
      );

      const finish = async (): Promise<StorageResult> => {
        try {
          const row = await complete(session.uploadId);
          return {
            fileKey: row.fileKey,
            fileUrl: row.fileUrl ?? "",
            uploadId: row.id,
          };
        } catch (e) {
          // Idempotent retry: ask the server whether the first /complete
          // landed before surfacing the error. The original error carries
          // the server copy (bytes-missing, mismatch, …) — keep it so the
          // UI names the cause instead of a generic retry line.
          const status = await getStatus(session.uploadId);
          if (status.status !== "complete") throw e;
          const row = await complete(session.uploadId);
          return {
            fileKey: row.fileKey,
            fileUrl: row.fileUrl ?? "",
            uploadId: row.id,
          };
        }
      };

      try {
        await putBytes(session.uploadUrl, prepared, onProgress);
        return await finish();
      } catch (e) {
        // 503 quota/kill-switch: maintenance copy, no retry.
        if ((e as Error)?.message === STORAGE_MAINTENANCE_MESSAGE) throw e;
        return await reconcile(e);
      }

      async function reconcile(cause: unknown): Promise<StorageResult> {
        const status = await getStatus(session.uploadId);
        // Abandoned rows never converge — but the PUT/complete error names
        // the cause (403 CORS/signature, 404 bytes-missing, …), so keep it.
        if (status.status === "abandoned") {
          if (cause instanceof Error && cause.message) throw cause;
          throw new Error("Upload failed — tap to retry.");
        }
        if (
          status.status === "complete" ||
          (status.bytesReceived ?? 0) >= prepared.size
        )
          return await finish();
        // Partial/no bytes confirmed → retry the single PUT once (idempotent;
        // key is server-chosen), then finish.
        await putBytes(session.uploadUrl, prepared, onProgress);
        return await finish();
      }
    },
    [route],
  );
  return { upload };
}
