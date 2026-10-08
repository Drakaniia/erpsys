import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import {
  addStoredBytes,
  canMintBytes,
  canMintOps,
  CLASS_A_BLOCK_AT,
  CLASS_A_MONTHLY_CAP,
  CLASS_B_BLOCK_AT,
  CLASS_B_MONTHLY_CAP,
  getUsage,
  incOps,
  monthKey,
  quotaExceededBody,
  R2_QUOTA_BYTES,
  reconcileUsage,
  shouldBlockMint,
  STORAGE_QUOTA_CODE,
  uploadsEnabled,
} from "./quota.js";

type Row = Record<string, unknown>;

function fakeDb(seed: Row[] = []) {
  const rows = (seed as Row[]).map((r) => ({ ...r }));
  const db = {
    collection: (_name: string) => ({
      findOne: async (filter: Row) =>
        rows.find((r) =>
          Object.entries(filter).every(([k, v]) => r[k] === v),
        ) ?? null,
      updateOne: async (_filter: Row, update: Row, opts?: Row) => {
        const at = rows.findIndex(
          (r) => r["month"] === (_filter as Row)["month"],
        );
        const set = (update.$set ?? {}) as Row;
        if (at < 0) {
          if (opts?.["upsert"]) rows.push({ ...set });
          return { matchedCount: 0, modifiedCount: 0 };
        }
        Object.assign(rows[at], set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };
  return db as unknown as Db;
}

describe("quota core", () => {
  it("locks the 8 GiB default and the 80% op marks", () => {
    expect(R2_QUOTA_BYTES).toBe(8589934592);
    expect(CLASS_A_MONTHLY_CAP).toBe(1_000_000);
    expect(CLASS_B_MONTHLY_CAP).toBe(10_000_000);
    expect(CLASS_A_BLOCK_AT).toBe(800_000);
    expect(CLASS_B_BLOCK_AT).toBe(8_000_000);
  });

  it("blocks mint exactly at the quota-size boundary", () => {
    expect(canMintBytes(R2_QUOTA_BYTES - 10, 10)).toBe(true);
    expect(canMintBytes(R2_QUOTA_BYTES - 10, 11)).toBe(false);
    expect(canMintBytes(R2_QUOTA_BYTES, 1)).toBe(false);
    expect(canMintBytes(0, 0)).toBe(false);
    expect(canMintBytes(-1, 10)).toBe(false);
  });

  it("blocks when either op counter reaches its 80% mark", () => {
    expect(canMintOps(0, 0)).toBe(true);
    expect(canMintOps(799_999, 7_999_999)).toBe(true);
    expect(canMintOps(800_000, 0)).toBe(false);
    expect(canMintOps(0, 8_000_000)).toBe(false);
  });

  it("kill-switch forces a block regardless of counters", () => {
    expect(uploadsEnabled(undefined)).toBe(true);
    expect(uploadsEnabled(true)).toBe(true);
    expect(uploadsEnabled("true")).toBe(true);
    expect(uploadsEnabled(false)).toBe(false);
    expect(uploadsEnabled("false")).toBe(false);
    const blocked = shouldBlockMint({
      bytesStored: 0,
      sizeBytes: 1,
      classAOps: 0,
      classBOps: 0,
      uploadsEnabledValue: false,
      message: "paused",
    });
    expect(blocked).toEqual({ code: STORAGE_QUOTA_CODE, message: "paused" });
  });

  it("shapes the 503 body with the quota code", () => {
    expect(quotaExceededBody("full")).toEqual({
      code: "STORAGE_QUOTA_EXCEEDED",
      message: "full",
    });
    expect(STORAGE_QUOTA_CODE).toBe("STORAGE_QUOTA_EXCEEDED");
  });

  it("passes a mint with headroom on every axis", () => {
    expect(
      shouldBlockMint({
        bytesStored: 0,
        sizeBytes: 1,
        classAOps: 0,
        classBOps: 0,
      }),
    ).toBeNull();
  });
});

describe("usage shell", () => {
  it("keys months in UTC YYYY-MM", () => {
    expect(monthKey(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01");
  });

  it("delete-then-mint succeeds: counters clamp at zero, mint reopens", async () => {
    const db = fakeDb();
    const month = "2026-10";
    await addStoredBytes(db, month, 1000);
    await addStoredBytes(db, month, -1000);
    const usage = await getUsage(db, month);
    expect(usage.bytesStored).toBe(0);
    expect(canMintBytes(usage.bytesStored, 10 * 1024 * 1024)).toBe(true);
  });

  it("never stores a negative counter after over-delete", async () => {
    const db = fakeDb();
    const usage = await addStoredBytes(db, "2026-10", -500);
    expect(usage.bytesStored).toBe(0);
  });

  it("accumulates op counters monotonically", async () => {
    const db = fakeDb();
    await incOps(db, "2026-10", { classA: 3, classB: 7 });
    await incOps(db, "2026-10", { classA: 2 });
    const usage = await getUsage(db, "2026-10");
    expect(usage.classAOps).toBe(5);
    expect(usage.classBOps).toBe(7);
    expect(canMintOps(usage.classAOps, usage.classBOps)).toBe(true);
  });

  it("reconcile clamps to the larger value on >1% divergence", async () => {
    const db = fakeDb();
    await addStoredBytes(db, "2026-10", 1000);
    const drifted = await reconcileUsage(db, "2026-10", 5000);
    expect(drifted.clamped).toBe(true);
    expect(drifted.usage.bytesStored).toBe(5000);
    const shrunk = await reconcileUsage(db, "2026-10", 1000);
    expect(shrunk.clamped).toBe(true);
    expect(shrunk.usage.bytesStored).toBe(5000);
  });

  it("reconcile ignores drift within 1%", async () => {
    const db = fakeDb();
    await addStoredBytes(db, "2026-10", 10_000);
    const close = await reconcileUsage(db, "2026-10", 10_050);
    expect(close.clamped).toBe(false);
    expect(close.usage.bytesStored).toBe(10_000);
  });
});
