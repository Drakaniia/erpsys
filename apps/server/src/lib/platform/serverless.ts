import { createHash, randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { configureTimestampOracle } from "../db/timestamp-ordering.js";
import { configureSharedRateLimits } from "./rate-limit.js";

type State = { _id: string; value?: number; times?: number[]; allowed?: boolean; expiresAt?: Date; owner?: string };

export async function configureServerless(db: Db): Promise<void> {
  const state = db.collection<State>("platform_state");
  await state.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  configureTimestampOracle(async () => {
    const row = await state.findOneAndUpdate(
      { _id: "transaction-clock" },
      [{ $set: { value: { $max: [{ $add: [{ $ifNull: ["$value", 0] }, 1] }, { $toLong: "$$NOW" }] } } }],
      { upsert: true, returnDocument: "after" },
    );
    if (!row?.value || !Number.isSafeInteger(row.value)) throw new Error("Timestamp allocation failed");
    return row.value;
  });
  configureSharedRateLimits(async (name, key, windowMs, max) => {
    const id = `rate:${name}:${createHash("sha256").update(key).digest("hex")}`;
    const row = await state.findOneAndUpdate(
      { _id: id },
      [
        { $set: { times: { $filter: { input: { $ifNull: ["$times", []] }, as: "at", cond: { $gt: ["$$at", { $subtract: [{ $toLong: "$$NOW" }, windowMs] }] } } } } },
        { $set: { allowed: { $lt: [{ $size: "$times" }, max] }, expiresAt: { $add: ["$$NOW", windowMs] } } },
        { $set: { times: { $cond: ["$allowed", { $concatArrays: ["$times", [{ $toLong: "$$NOW" }]] }, "$times"] } } },
      ],
      { upsert: true, returnDocument: "after" },
    );
    if (!row) throw new Error("Rate limit allocation failed");
    return { allowed: row.allowed === true, retryAfterSeconds: row.allowed ? 0 : Math.max(1, Math.ceil(((row.times?.[0] ?? Date.now()) + windowMs - Date.now()) / 1000)) };
  });
}

export async function runMaintenance(db: Db, work: () => Promise<void>): Promise<boolean> {
  const state = db.collection<State>("platform_state");
  const owner = randomUUID();
  let lease: State | null;
  try {
    lease = await state.findOneAndUpdate(
      { _id: "maintenance-lease", $or: [{ expiresAt: { $lte: new Date() } }, { expiresAt: { $exists: false } }] },
      { $set: { owner, expiresAt: new Date(Date.now() + 5 * 60_000) } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
  if (lease?.owner !== owner) return false;
  try {
    await work();
    return true;
  } finally {
    await state.deleteOne({ _id: "maintenance-lease", owner });
  }
}
