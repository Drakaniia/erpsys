import type { S3Client } from "@aws-sdk/client-s3";
import type { Db } from "mongodb";
import { COLLECTIONS } from "../db/db.js";
import { startSweeps } from "../db/sweeps.js";
import { deleteR2Object } from "./client.js";
import { isR2FileKey, parseR2FileKey } from "./storage.js";

export const STORAGE_SWEEP_INTERVAL_MS = 15 * 60_000;

export type StorageKeyRow = { fileKey?: string | null };

export function isR2Row(row: StorageKeyRow): boolean {
  return isR2FileKey(row.fileKey);
}

export function partitionStorageKeys<T extends StorageKeyRow>(
  rows: T[],
): { r2: T[]; external: T[]; legacy: T[] } {
  const r2: T[] = [];
  const external: T[] = [];
  const legacy: T[] = [];
  for (const row of rows) {
    if (isR2Row(row)) r2.push(row);
    else if (
      typeof row.fileKey === "string" &&
      row.fileKey.startsWith("external:")
    )
      external.push(row);
    else legacy.push(row);
  }
  return { r2, external, legacy };
}

export async function deleteR2FileKey(
  client: S3Client,
  fileKey: string | null | undefined,
): Promise<boolean> {
  const parsed = parseR2FileKey(fileKey);
  if (!parsed) return false;
  await deleteR2Object(client, { bucket: parsed.bucket, key: parsed.key });
  return true;
}

export async function reapAbandonedStorageSessions(
  db: Db,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.collection(COLLECTIONS.upload).updateMany(
    {
      backend: "r2",
      r2Status: "pending",
      sessionExpiresAt: { $lte: now },
    } as never,
    { $set: { r2Status: "abandoned" } } as never,
  );
  return result.modifiedCount;
}

export async function reconcileR2Orphans(
  _db: Db,
  _now: Date = new Date(),
): Promise<{ deleted: number; adopted: number }> {
  return { deleted: 0, adopted: 0 };
}

export async function runStorageSweeps(
  db: Db,
  now: Date = new Date(),
): Promise<{ reaped: number; deleted: number; adopted: number }> {
  const reaped = await reapAbandonedStorageSessions(db, now);
  const { deleted, adopted } = await reconcileR2Orphans(db, now);
  if (reaped + deleted + adopted > 0) {
    console.log(
      `[storage-sweep] reaped=${reaped} orphansDeleted=${deleted} adopted=${adopted}`,
    );
  }
  return { reaped, deleted, adopted };
}

export function startStorageSweeps(
  options: {
    intervalMs?: number;
    runAtStart?: boolean;
    logger?: (message: string) => void;
  } = {},
): () => void {
  return startSweeps({
    intervalMs: options.intervalMs ?? STORAGE_SWEEP_INTERVAL_MS,
    runAtStart: options.runAtStart,
    runSweep: (db) => runStorageSweeps(db).then(() => undefined),
    logger: options.logger,
    label: "storage-sweep",
  });
}
