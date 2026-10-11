import {
  DRAFT_EVIDENCE_KINDS,
  draftExpiresAt,
  expiresAtOf,
  planDraftEvidenceSweep,
  type DraftUploadRow,
} from "../../config/evidence.js";
import { KIND_FOR_STEP, evidenceUploadIds } from "../../config/steps.js";
import { getDbSync } from "../../lib/db/db.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { deleteR2Object } from "../../lib/storage/client.js";
import { configuredR2Client } from "../../lib/storage/configured-client.js";
import { addStoredBytes, monthKey } from "../../lib/storage/quota.js";
import { isR2FileKey, parseR2FileKey } from "../../lib/storage/storage.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { UploadModel, type UploadRow } from "../../models/UploadModel.js";

type PurgeRow = DraftUploadRow &
  Pick<UploadRow, "r2Bucket" | "r2Key" | "sizeBytes">;

async function purgeR2Rows(rows: PurgeRow[]): Promise<Set<string>> {
  const purged = new Set<string>();
  if (rows.length === 0) return purged;
  const client = configuredR2Client();
  if (!client) {
    console.error(
      "[evidence-expiry] R2 not configured — r2 rows stay for the next sweep",
    );
    return purged;
  }
  const month = monthKey();
  for (const row of rows) {
    const parsed = parseR2FileKey(row.fileKey);
    const bucket = row.r2Bucket ?? parsed?.bucket;
    const key = row.r2Key ?? parsed?.key;
    if (!bucket || !key) continue;
    try {
      await deleteR2Object(client, { bucket, key });
      purged.add(String(row._id));
      await addStoredBytes(getDbSync(), month, -(row.sizeBytes ?? 0));
    } catch (error) {
      console.error(
        `[evidence-expiry] R2 delete failed for upload ${String(row._id)} — will retry on the next sweep`,
        error,
      );
    }
  }
  return purged;
}

async function purgeDraftFiles(rows: DraftUploadRow[]): Promise<Set<string>> {
  const withKey = rows.filter((row) => Boolean(row.fileKey));
  const purged = new Set(
    rows.filter((row) => !row.fileKey).map((row) => String(row._id)),
  );
  if (withKey.length === 0) return purged;

  for (const id of await purgeR2Rows(
    withKey.filter((row) => isR2FileKey(row.fileKey)) as PurgeRow[],
  )) {
    purged.add(id);
  }
  for (const row of withKey.filter((row) => !isR2FileKey(row.fileKey))) {
    purged.add(String(row._id));
  }
  return purged;
}

async function labelForExpired(kinds: string[]): Promise<string> {
  const codeByKind = new Map(
    Object.entries(KIND_FOR_STEP).map(([code, kind]) => [kind, code]),
  );
  const codes = [
    ...new Set(
      kinds
        .map((kind) => codeByKind.get(kind))
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const steps = await StepModel.listByCodes(codes);
  if (steps.length > 0) return steps.map((step) => step.name).join(", ");
  return "Your evidence";
}

export class DraftEvidenceService {
  static async sweep({
    studentProfileId,
    userId,
    now = new Date(),
  }: {
    studentProfileId: string;
    userId: string | null;
    now?: Date;
  }): Promise<{ expired: number; purged: number }> {
    const verifications =
      await StepVerificationModel.listEvidenceByProfile(studentProfileId);
    const referencedIds = new Set(
      verifications.flatMap((v) => evidenceUploadIds(v.evidence)),
    );
    const uploads = await UploadModel.listDraftCandidates(
      studentProfileId,
      DRAFT_EVIDENCE_KINDS,
    );

    const { toExpire, toRetryPurge } = planDraftEvidenceSweep({
      uploads,
      referencedIds,
      now: now.getTime(),
    });
    if (toExpire.length === 0 && toRetryPurge.length === 0) {
      return { expired: 0, purged: 0 };
    }

    const purged = await purgeDraftFiles([...toExpire, ...toRetryPurge]);

    for (const upload of toExpire) {
      await UploadModel.updateById(String(upload._id), {
        expiresAt: expiresAtOf(upload) ?? now,
        expiredAt: now,
        ...(purged.has(String(upload._id)) ? { filePurgedAt: now } : {}),
      });
    }

    const retryIds = toRetryPurge
      .filter((upload) => purged.has(String(upload._id)))
      .map((upload) => String(upload._id));
    await UploadModel.updateManyByIds(retryIds, { filePurgedAt: now });

    if (toExpire.length > 0 && userId) {
      const label = await labelForExpired(
        toExpire.map((upload) => String(upload.kind)),
      );
      const body =
        toExpire.length === 1
          ? `${label} — a file you uploaded but never submitted was removed 24 hours after upload. Upload it again to submit.`
          : `${label} — ${toExpire.length} files you uploaded but never submitted were removed 24 hours after upload. Upload them again to submit.`;
      await NotificationModel.insert({
        _id: `notification-${crypto.randomUUID()}`,
        userId,
        type: "EVIDENCE_EXPIRED",
        title: "Evidence expired",
        body,
        createdAt: now,
      });
      publishToUser(userId, "notifications", now);
    }

    return { expired: toExpire.length, purged: purged.size };
  }

  static async refreshExpiry(
    uploadIds: string[],
    now: Date = new Date(),
  ): Promise<void> {
    if (uploadIds.length === 0) return;
    const rows = await UploadModel.findByIds(uploadIds);
    const draftIds = rows
      .filter(
        (row) =>
          (DRAFT_EVIDENCE_KINDS as readonly string[]).includes(
            row.kind ?? "",
          ) && !row.filePurgedAt,
      )
      .map((row) => String(row._id));
    await UploadModel.updateManyByIds(draftIds, {
      expiresAt: draftExpiresAt(now),
      expiredAt: null,
    });
  }
}
