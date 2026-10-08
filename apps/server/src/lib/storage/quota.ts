import type { Db } from "mongodb";

export const R2_QUOTA_BYTES = 8589934592;

export const CLASS_A_MONTHLY_CAP = 1_000_000;
export const CLASS_B_MONTHLY_CAP = 10_000_000;
export const CLASS_A_BLOCK_AT = 800_000;
export const CLASS_B_BLOCK_AT = 8_000_000;

export const STORAGE_QUOTA_CODE = "STORAGE_QUOTA_EXCEEDED";

export function canMintBytes(
  bytesStored: number,
  sizeBytes: number,
  quotaBytes: number = R2_QUOTA_BYTES,
): boolean {
  if (!Number.isFinite(bytesStored) || bytesStored < 0) return false;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return false;
  return bytesStored + sizeBytes <= quotaBytes;
}

export function canMintOps(classAOps: number, classBOps: number): boolean {
  if (!Number.isFinite(classAOps) || classAOps < 0) return false;
  if (!Number.isFinite(classBOps) || classBOps < 0) return false;
  if (classAOps >= CLASS_A_BLOCK_AT) return false;
  if (classBOps >= CLASS_B_BLOCK_AT) return false;
  return true;
}

export function uploadsEnabled(value: string | boolean | undefined): boolean {
  if (value === false) return false;
  if (typeof value === "string" && value.trim().toLowerCase() === "false")
    return false;
  return true;
}

export function quotaExceededBody(message: string): {
  code: typeof STORAGE_QUOTA_CODE;
  message: string;
} {
  return { code: STORAGE_QUOTA_CODE, message };
}

export type MintGate = {
  bytesStored: number;
  sizeBytes: number;
  quotaBytes?: number;
  classAOps: number;
  classBOps: number;
  uploadsEnabledValue?: string | boolean;
  message?: string;
};

export function shouldBlockMint(
  gate: MintGate,
): { code: typeof STORAGE_QUOTA_CODE; message: string } | null {
  if (!uploadsEnabled(gate.uploadsEnabledValue))
    return quotaExceededBody(gate.message ?? "Uploads are temporarily paused.");
  const quota = gate.quotaBytes ?? R2_QUOTA_BYTES;
  if (!canMintBytes(gate.bytesStored, gate.sizeBytes, quota))
    return quotaExceededBody(gate.message ?? "Storage quota reached.");
  if (!canMintOps(gate.classAOps, gate.classBOps))
    return quotaExceededBody(gate.message ?? "Storage quota reached.");
  return null;
}

export type StorageUsageDoc = {
  month: string;
  bytesStored: number;
  classAOps: number;
  classBOps: number;
  updatedAt: Date;
};

export function monthKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const STORAGE_USAGE_COLLECTION = "storage_usage";

function blankUsage(month: string, now: Date): StorageUsageDoc {
  return { month, bytesStored: 0, classAOps: 0, classBOps: 0, updatedAt: now };
}

function normalizeUsage(
  row: StorageUsageDoc | null,
  month: string,
  now: Date,
): StorageUsageDoc {
  if (!row) return blankUsage(month, now);
  return {
    month: row.month,
    bytesStored: Math.max(0, Math.floor(row.bytesStored ?? 0)),
    classAOps: Math.max(0, Math.floor(row.classAOps ?? 0)),
    classBOps: Math.max(0, Math.floor(row.classBOps ?? 0)),
    updatedAt: row.updatedAt ?? now,
  };
}

export async function getUsage(
  db: Db,
  month: string,
  now: Date = new Date(),
): Promise<StorageUsageDoc> {
  const row = (await db
    .collection(STORAGE_USAGE_COLLECTION)
    .findOne({ month })) as unknown as StorageUsageDoc | null;
  return normalizeUsage(row, month, now);
}

export async function addStoredBytes(
  db: Db,
  month: string,
  deltaBytes: number,
  now: Date = new Date(),
): Promise<StorageUsageDoc> {
  const current = await getUsage(db, month, now);
  const next = normalizeUsage(
    { ...current, bytesStored: current.bytesStored + Math.trunc(deltaBytes) },
    month,
    now,
  );
  await db
    .collection(STORAGE_USAGE_COLLECTION)
    .updateOne(
      { month },
      { $set: { ...next, updatedAt: now } },
      { upsert: true },
    );
  return { ...next, updatedAt: now };
}

export async function incOps(
  db: Db,
  month: string,
  args: { classA?: number; classB?: number } = {},
  now: Date = new Date(),
): Promise<StorageUsageDoc> {
  const current = await getUsage(db, month, now);
  const next = normalizeUsage(
    {
      ...current,
      classAOps: current.classAOps + Math.max(0, Math.trunc(args.classA ?? 0)),
      classBOps: current.classBOps + Math.max(0, Math.trunc(args.classB ?? 0)),
    },
    month,
    now,
  );
  await db
    .collection(STORAGE_USAGE_COLLECTION)
    .updateOne(
      { month },
      { $set: { ...next, updatedAt: now } },
      { upsert: true },
    );
  return { ...next, updatedAt: now };
}

export async function reconcileUsage(
  db: Db,
  month: string,
  actualBytes: number,
  now: Date = new Date(),
): Promise<{ usage: StorageUsageDoc; clamped: boolean; divergence: number }> {
  const tracked = await getUsage(db, month, now);
  const actual = Math.max(0, Math.floor(actualBytes));
  const baseline = Math.max(tracked.bytesStored, actual, 1);
  const divergence = Math.abs(actual - tracked.bytesStored) / baseline;
  if (divergence <= 0.01) return { usage: tracked, clamped: false, divergence };
  const clampedBytes = Math.max(tracked.bytesStored, actual);
  const next = normalizeUsage(
    { ...tracked, bytesStored: clampedBytes },
    month,
    now,
  );
  await db
    .collection(STORAGE_USAGE_COLLECTION)
    .updateOne(
      { month },
      { $set: { ...next, updatedAt: now } },
      { upsert: true },
    );
  return { usage: { ...next, updatedAt: now }, clamped: true, divergence };
}
