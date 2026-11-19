import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  marker: true,
  changes: false,
  database: "erpsys",
  rows: {} as Record<string, Record<string, unknown>[]>,
  drops: [] as string[],
  closed: false,
  mutate: false,
}));

vi.mock("../../../src/lib/platform/env.js", () => ({ env: { DATABASE_URL: "mongodb://unused/erpsys" } }));
vi.mock("mongodb", async importOriginal => {
  const original = await importOriginal<typeof import("mongodb")>();
  return {
    ...original,
    MongoClient: class {
      async connect() {}
      async close() { state.closed = true; }
      db() {
        return {
          databaseName: state.database,
          listCollections: () => ({ toArray: async () => Object.keys(state.rows).map(name => ({ name })) }),
          collection: (name: string) => ({
            findOne: async () => state.marker ? { version: 2, completedAt: new Date() } : null,
            find: () => ({ toArray: async () => [...(state.rows[name] ?? [])] }),
            drop: async () => {
              state.drops.push(name);
              delete state.rows[name];
              if (state.mutate) state.rows.user = [{ _id: "changed" }];
            },
          }),
        };
      }
    },
  };
});

vi.mock("../../../src/lib/db/collection-simplification.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../src/lib/db/collection-simplification.js")>();
  return {
    ...original,
    planCollectionSimplification: () => ({ changes: state.changes ? [{}] : [] }),
    verifySimplificationSnapshot: (expected: unknown, actual: unknown) => {
      expect(actual).toEqual(expected);
    },
  };
});

import { RETIRED_SOURCES, parseRetirementArgs, runCollectionRetirement } from "../../../src/scripts/retire-simplified-collections.js";

const apply = ["--apply", "--writers-stopped", "--restore-verified", "--backup-reference", "verified-private-backup", "--database", "erpsys"];

beforeEach(() => {
  state.marker = true;
  state.changes = false;
  state.database = "erpsys";
  state.rows = Object.fromEntries([...RETIRED_SOURCES, "user", "admin_action_log", "integration_credential"].map(name => [name, []]));
  state.drops = [];
  state.closed = false;
  state.mutate = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("offline source retirement", () => {
  it("defaults to dry-run without dropping anything", async () => {
    expect(parseRetirementArgs([]).apply).toBe(false);
    await runCollectionRetirement([]);
    expect(state.drops).toEqual([]);
    expect(state.closed).toBe(true);
  });

  it("drops only reconciled v2 sources and leaves legacy credentials and logs alone", async () => {
    await runCollectionRetirement(apply);
    expect(state.drops).toEqual(RETIRED_SOURCES);
    expect(state.rows).toHaveProperty("integration_credential");
    expect(state.rows).toHaveProperty("admin_action_log");
    expect(state.closed).toBe(true);
  });

  it("resumes after an already absent source", async () => {
    delete state.rows.student_profile;
    await runCollectionRetirement(apply);
    expect(state.drops).not.toContain("student_profile");
    expect(state.drops).toHaveLength(6);
  });

  it.each(["marker", "changes", "database"] as const)("fails closed for %s", async field => {
    if (field === "marker") state.marker = false;
    if (field === "changes") state.changes = true;
    if (field === "database") state.database = "test";
    await expect(runCollectionRetirement(apply)).rejects.toThrow();
    expect(state.drops).toEqual([]);
    expect(state.closed).toBe(true);
  });

  it("stops immediately when verification detects a concurrent destination edit", async () => {
    state.mutate = true;
    await expect(runCollectionRetirement(apply)).rejects.toThrow();
    expect(state.drops).toEqual(["student_profile"]);
    expect(state.closed).toBe(true);
  });

  it.each([
    ["--apply"],
    apply.filter(arg => arg !== "--restore-verified"),
    ["--drop", "integration_credential"],
    ["--dry-run", "--apply"],
    ["--database"],
    ["--restore-verified"],
    ["--dry-run", "--dry-run"],
  ])("rejects unsafe arguments: %j", (...args) => {
    expect(() => parseRetirementArgs(args)).toThrow();
  });
});
