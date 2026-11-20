import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { assertCollectionReadiness } from "../../../src/lib/db/collection-readiness.js";

function database(rows: Record<string, unknown>) {
  return {
    collection: vi.fn((name: string) => ({
      findOne: vi.fn(async () => rows[name] ?? null),
    })),
  };
}

describe("collection readiness", () => {
  it("allows a fresh database", async () => {
    await expect(
      assertCollectionReadiness(database({}) as unknown as Db),
    ).resolves.toBeUndefined();
  });
  it.each([
    "student_profile",
    "adviser_department",
    "step",
    "requirement_item",
    "social_media_link",
    "adviser_availability",
    "availability_window",
  ])("blocks unmigrated %s", async (name) => {
    await expect(
      assertCollectionReadiness(
        database({ [name]: { _id: "legacy" } }) as unknown as Db,
      ),
    ).rejects.toThrow("migration required");
  });
  it("accepts verified completion without rereading retained stale sources", async () => {
    const db = database({
      platform_state: {
        _id: "collection-simplification-v2",
        version: 2,
        completedAt: new Date(),
      },
      student_profile: { _id: "legacy" },
    });
    await expect(
      assertCollectionReadiness(db as unknown as Db),
    ).resolves.toBeUndefined();
    expect(db.collection).toHaveBeenCalledTimes(1);
  });
});
