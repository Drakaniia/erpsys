import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { beginSharedTransaction, configureTimestampOracle, currentTransaction, restartSharedAborted, TS_ABORTED } from "../../../src/lib/db/timestamp-ordering.js";
import { configureServerless, runMaintenance } from "../../../src/lib/platform/serverless.js";
import { configureSharedRateLimits, createRateLimitBudget } from "../../../src/lib/platform/rate-limit.js";

describe("serverless execution", () => {
  it("allocates a shared timestamp and keeps client anchoring", async () => {
    let clock = Date.now();
    configureTimestampOracle(async () => ++clock);
    const first = await beginSharedTransaction(undefined, "POST", () => currentTransaction()!.ts);
    expect(first).toBe(clock);
    await beginSharedTransaction(first, "PATCH", async () => {
      expect(currentTransaction()).toMatchObject({ ts: first, anchor: "client" });
      expect(await restartSharedAborted({ data: { code: TS_ABORTED } }, 0)).toBe(false);
    });
    await beginSharedTransaction(undefined, "POST", async () => {
      const previous = currentTransaction()!.ts;
      expect(await restartSharedAborted({ data: { code: TS_ABORTED } }, 0)).toBe(true);
      expect(currentTransaction()!.ts).toBeGreaterThan(previous);
      expect(await restartSharedAborted({ data: { code: TS_ABORTED } }, 3)).toBe(false);
    });
    await expect(beginSharedTransaction(clock + 100, "POST", () => null)).rejects.toMatchObject({ status: 400 });
  });

  it("delegates named rate budgets to shared storage", async () => {
    const check = vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    configureSharedRateLimits(check);
    const budget = createRateLimitBudget({ name: "test-shared", windowMs: 1000, max: 2 });
    expect(await budget.checkAsync("user:test")).toEqual({ allowed: false, retryAfterSeconds: 12 });
    expect(check).toHaveBeenCalledWith("test-shared", "user:test", 1000, 2);
  });

  it("configures atomic timestamp/rate pipelines and TTL cleanup", async () => {
    const collection = { createIndex: vi.fn(), findOneAndUpdate: vi.fn() };
    const db = { collection: vi.fn(() => collection) } as unknown as Db;
    await configureServerless(db);
    expect(collection.createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    collection.findOneAndUpdate.mockResolvedValueOnce({ value: Date.now() });
    await beginSharedTransaction(undefined, "GET", () => null);
    expect(collection.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: "transaction-clock" });
    collection.findOneAndUpdate.mockResolvedValueOnce({ allowed: true, times: [Date.now()] });
    expect((await createRateLimitBudget({ name: "r", windowMs: 1000, max: 1 }).checkAsync("k")).allowed).toBe(true);
    expect(collection.findOneAndUpdate.mock.calls[1][1]).toHaveLength(3);
  });

  it("skips a competing maintenance lease and releases its own lease after failure", async () => {
    const work = vi.fn();
    const state = { findOneAndUpdate: vi.fn().mockRejectedValueOnce({ code: 11000 }), deleteOne: vi.fn() };
    const db = { collection: () => state } as unknown as Db;
    expect(await runMaintenance(db, work)).toBe(false);
    expect(work).not.toHaveBeenCalled();
    state.findOneAndUpdate.mockImplementationOnce(async (_filter, update) => ({ owner: update.$set.owner }));
    work.mockRejectedValueOnce(new Error("failed"));
    await expect(runMaintenance(db, work)).rejects.toThrow("failed");
    expect(state.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ _id: "maintenance-lease", owner: expect.any(String) }));
  });
});
