import {
  DRAFT_EVIDENCE_KINDS,
  expiresAtOf,
  isDraftExpired,
  planDraftEvidenceSweep,
  type DraftUploadRow,
} from "../config/evidence.js";
import { KIND_FOR_STEP, evidenceUploadIds } from "../config/steps.js";
import { getDbSync } from "../lib/db/db.js";
import { deleteR2Object } from "../lib/storage/client.js";
import { configuredR2Client } from "../lib/storage/configured-client.js";
import { addStoredBytes, monthKey } from "../lib/storage/quota.js";
import { isR2FileKey, parseR2FileKey } from "../lib/storage/storage.js";
import { NotificationModel } from "../models/NotificationModel.js";
import { StepModel } from "../models/StepModel.js";
import { StepVerificationModel } from "../models/StepVerificationModel.js";
import { UploadModel, type UploadRow } from "../models/UploadModel.js";

export type EvidenceWire = {
  id: string;
  fileKey: string | null;
  fileUrl: string;
  kind: string;
  expiresAt: string | null;
  expired: boolean;
};

export const attachedEvidence = (u: UploadRow): EvidenceWire => ({
  id: String(u._id),
  fileKey: u.fileKey ?? null,
  fileUrl: u.fileUrl ?? "",
  kind: u.kind ?? "",
  expiresAt: null,
  expired: false,
});

export const draftEvidence = (u: UploadRow, now: number): EvidenceWire => ({
  ...attachedEvidence(u),
  expiresAt: expiresAtOf(u)?.toISOString() ?? null,
  expired: isDraftExpired(u, now),
});

async function purgeFiles(rows: DraftUploadRow[]): Promise<Set<string>> {
  const isR2 = (row: DraftUploadRow) =>
    Boolean(row.fileKey) && isR2FileKey(row.fileKey);
  const purged = new Set(
    rows.filter((row) => !isR2(row)).map((row) => String(row._id)),
  );
  const r2Rows = rows.filter(isR2) as (DraftUploadRow &
    Pick<UploadRow, "r2Bucket" | "r2Key" | "sizeBytes">)[];
  if (r2Rows.length === 0) return purged;
  const client = configuredR2Client();
  if (!client) {
    console.error(
      "[evidence-expiry] R2 not configured — r2 rows stay for the next sweep",
    );
    return purged;
  }
  const month = monthKey();
  for (const row of r2Rows) {
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

export async function sweepDrafts(
  studentProfileId: string,
  userId: string | null,
): Promise<void> {
  const now = new Date();
  const verifications =
    await StepVerificationModel.listEvidenceByProfile(studentProfileId);
  const { toExpire, toRetryPurge } = planDraftEvidenceSweep({
    uploads: await UploadModel.listDraftCandidates(
      studentProfileId,
      DRAFT_EVIDENCE_KINDS,
    ),
    referencedIds: new Set(
      verifications.flatMap((v) => evidenceUploadIds(v.evidence)),
    ),
    now: now.getTime(),
  });
  if (toExpire.length === 0 && toRetryPurge.length === 0) return;

  const purged = await purgeFiles([...toExpire, ...toRetryPurge]);
  for (const upload of toExpire) {
    await UploadModel.updateById(String(upload._id), {
      expiresAt: expiresAtOf(upload) ?? now,
      expiredAt: now,
      ...(purged.has(String(upload._id)) ? { filePurgedAt: now } : {}),
    });
  }
  await UploadModel.updateManyByIds(
    toRetryPurge
      .map((upload) => String(upload._id))
      .filter((id) => purged.has(id)),
    { filePurgedAt: now },
  );

  if (toExpire.length === 0 || !userId) return;
  const codeByKind = new Map(
    Object.entries(KIND_FOR_STEP).map(([code, kind]) => [kind, code]),
  );
  const codes = [
    ...new Set(
      toExpire.flatMap((upload) => codeByKind.get(String(upload.kind)) ?? []),
    ),
  ];
  const steps = await StepModel.listByCodes(codes);
  const label =
    steps.length > 0
      ? steps.map((step) => step.name).join(", ")
      : "Your evidence";
  await NotificationModel.insert({
    _id: `notification-${crypto.randomUUID()}`,
    userId,
    type: "EVIDENCE_EXPIRED",
    title: "Evidence expired",
    body:
      toExpire.length === 1
        ? `${label} — a file you uploaded but never submitted was removed 24 hours after upload. Upload it again to submit.`
        : `${label} — ${toExpire.length} files you uploaded but never submitted were removed 24 hours after upload. Upload them again to submit.`,
    createdAt: now,
  });
}
