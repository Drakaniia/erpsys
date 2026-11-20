import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  filter: null as Record<string, unknown> | null,
  update: null as Record<string, unknown> | null,
  matchedCount: 1,
}));

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/db.js")>();
  return {
    ...actual,
    getDbSync: () => ({
      collection: () => ({
        find: () => ({
          sort: () => ({ toArray: async () => [] }),
          toArray: async () => [],
        }),
        findOne: async () => holder.doc,
        insertOne: async () => ({ acknowledged: true }),
        updateOne: async (
          filter: Record<string, unknown>,
          update: Record<string, unknown>,
        ) => {
          holder.filter = filter;
          holder.update = update;
          return { matchedCount: holder.matchedCount };
        },
      }),
    }),
  };
});

vi.mock("../platform/credential-probes.js", () => ({
  probeCredentials: vi.fn(),
}));

const { encryptField } = await import("./credentials.js");
const { resetCredentials } = await import("../../services/integrations.js");

beforeEach(() => {
  holder.filter = null;
  holder.update = null;
  holder.matchedCount = 1;
  holder.doc = {
    _id: "google-settings",
    key: "googleAuth",
    enabled: false,
    version: 4,
    values: {
      GOOGLE_CLIENT_ID: encryptField(
        "googleAuth",
        "GOOGLE_CLIENT_ID",
        "database-client-id",
      ),
    },
    updatedAt: new Date(),
    createdAt: new Date(),
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("resetCredentials", () => {
  it("clears only database values with an optimistic version check", async () => {
    const row = await resetCredentials("admin-1", "googleAuth");

    expect(row.key).toBe("googleAuth");
    expect(holder.filter).toEqual({
      _id: "google-settings",
      version: 4,
    });
    expect(holder.update).toMatchObject({
      $set: { values: {}, version: 5, updatedById: "admin-1" },
    });
    expect(holder.update?.$set).not.toHaveProperty("enabled");
    expect(holder.update).not.toHaveProperty("$unset");
  });

  it("rejects a concurrent update instead of clearing newer credentials", async () => {
    holder.matchedCount = 0;

    await expect(
      resetCredentials("admin-1", "googleAuth"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not write when there are no database overrides", async () => {
    holder.doc = null;

    const row = await resetCredentials("admin-1", "googleAuth");
    expect(row.key).toBe("googleAuth");
    expect(holder.update).toBeNull();
  });
});
