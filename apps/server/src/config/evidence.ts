export const DRAFT_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;

export const DRAFT_EVIDENCE_KINDS = [
  "SOCIAL_SCREENSHOT",
  "PROFILING_SCREENSHOT",
  "MUGSHOT",
  "CONSENT_SCAN",
] as const;

const DRAFT_EVIDENCE_KIND_SET: Record<string, true> = Object.fromEntries(
  DRAFT_EVIDENCE_KINDS.map((kind) => [kind, true]),
);

function isDraftEvidenceKind(kind: string | null | undefined): boolean {
  return Boolean(kind && DRAFT_EVIDENCE_KIND_SET[kind]);
}

export type DraftUploadRow = {
  _id: string;
  kind?: string | null;
  fileKey?: string | null;
  createdAt?: Date | null;
  expiresAt?: Date | null;
  expiredAt?: Date | null;
  filePurgedAt?: Date | null;
};

export function draftExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + DRAFT_EVIDENCE_TTL_MS);
}

export function expiresAtOf(upload: DraftUploadRow): Date | null {
  const stored = upload.expiresAt ? new Date(upload.expiresAt) : null;
  if (stored && !Number.isNaN(stored.getTime())) return stored;
  const createdAt = upload.createdAt ? new Date(upload.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;
  return draftExpiresAt(createdAt);
}

export function isDraftExpired(
  upload: DraftUploadRow,
  now: number = Date.now(),
): boolean {
  if (upload.expiredAt) return true;
  const expiresAt = expiresAtOf(upload);
  return expiresAt !== null && expiresAt.getTime() <= now;
}

type DraftEvidenceSweepPlan = {
  toExpire: DraftUploadRow[];
  toRetryPurge: DraftUploadRow[];
};

export function planDraftEvidenceSweep({
  uploads,
  referencedIds,
  now,
}: {
  uploads: DraftUploadRow[];
  referencedIds: ReadonlySet<string>;
  now: number;
}): DraftEvidenceSweepPlan {
  const toExpire: DraftUploadRow[] = [];
  const toRetryPurge: DraftUploadRow[] = [];

  for (const upload of uploads) {
    if (referencedIds.has(String(upload._id))) continue;
    if (!isDraftEvidenceKind(upload.kind)) continue;

    if (upload.expiredAt) {
      if (!upload.filePurgedAt && upload.fileKey) toRetryPurge.push(upload);
      continue;
    }

    const expiresAt = expiresAtOf(upload);
    if (expiresAt === null) continue;
    if (expiresAt.getTime() <= now) toExpire.push(upload);
  }

  return { toExpire, toRetryPurge };
}
