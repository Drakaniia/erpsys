// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./db.js";
import { repairQueueInvariants } from "./queue-repair.js";

/**
 * The repair's tests are really tests of the *policy* documented at the top of
 * `queue-repair.ts`: which row of a violating set survives, and what happens
 * to the rest. So each case below seeds exactly one violation class and
 * asserts the survivor and the fate of the others.
 *
 * The fake database supports only what `auditQueueInvariants` and the repair
 * use, and throws on anything else, so a silently-ignored filter change cannot
 * pass. It is a hand-rolled in-memory double rather than a real MongoDB: the
 * behaviour under test is "which document did this script choose to change",
 * which the driver has no opinion about.
 */
type Doc = Record<string, unknown>;

function getField(doc: Doc, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc === null || acc === undefined
          ? undefined
          : (acc as Record<string, unknown>)[key],
      doc,
    );
}

function isEqualValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date)
    return actual instanceof Date && actual.getTime() === expected.getTime();
  if (typeof expected === "object")
    return (
      actual !== null &&
      typeof actual === "object" &&
      JSON.stringify(actual) === JSON.stringify(expected)
    );
  return actual === expected;
}

function typeOrder(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return 1;
  if (typeof value === "string") return 2;
  if (value instanceof Date) return 3;
  return 4;
}

function compareValues(a: unknown, b: unknown): number {
  const orderA = typeOrder(a);
  const orderB = typeOrder(b);
  if (orderA !== orderB) return orderA - orderB;
  if (orderA === 0) return 0;
  if (orderA === 1) return (a as number) - (b as number);
  if (orderA === 3) return (a as Date).getTime() - (b as Date).getTime();
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matchesValue(actual: unknown, condition: unknown): boolean {
  if (
    condition !== null &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    return Object.entries(condition as Record<string, unknown>).every(
      ([operator, operand]) => {
        switch (operator) {
          case "$in":
            return (operand as unknown[]).some((v) => isEqualValue(actual, v));
          case "$lt":
            return compareValues(actual, operand) < 0;
          case "$gt":
            return compareValues(actual, operand) > 0;
          case "$exists":
            return (actual !== undefined) === Boolean(operand);
          case "$ne":
            return !isEqualValue(actual, operand);
          default:
            throw new Error(`fake db: unsupported operator ${operator}`);
        }
      },
    );
  }
  return isEqualValue(actual, condition);
}

function matches(doc: Doc, filter: Doc = {}): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or")
      return (condition as Doc[]).some((sub) => matches(doc, sub));
    if (key === "$and")
      return (condition as Doc[]).every((sub) => matches(doc, sub));
    return matchesValue(getField(doc, key), condition);
  });
}

function evalExpression(expression: unknown, doc: Doc): unknown {
  if (typeof expression === "string" && expression.startsWith("$"))
    return getField(doc, expression.slice(1));
  if (
    expression !== null &&
    typeof expression === "object" &&
    !Array.isArray(expression) &&
    !(expression instanceof Date)
  ) {
    if ("$ifNull" in (expression as Record<string, unknown>)) {
      const [value, fallback] = (expression as { $ifNull: unknown[] }).$ifNull;
      const resolved = evalExpression(value, doc);
      return resolved === null || resolved === undefined
        ? evalExpression(fallback, doc)
        : resolved;
    }
    return Object.fromEntries(
      Object.entries(expression as Record<string, unknown>).map(
        ([key, value]) => [key, evalExpression(value, doc)],
      ),
    );
  }
  return expression;
}

function fakeDb() {
  const stores = new Map<string, Doc[]>();
  const writes: Array<{ op: string; collection: string; _id: string }> = [];

  const store = (name: string): Doc[] => {
    let rows = stores.get(name);
    if (!rows) {
      rows = [];
      stores.set(name, rows);
    }
    return rows;
  };
  const cursor = (rows: Doc[]) => ({
    toArray: async () => rows.map((r) => ({ ...r })),
  });

  const collection = (name: string) => ({
    find: (filter: Doc = {}) =>
      cursor(store(name).filter((row) => matches(row, filter))),
    findOne: async (filter: Doc = {}) => {
      const row = store(name).find((candidate) => matches(candidate, filter));
      return row ? { ...row } : null;
    },
    aggregate: (pipeline: Doc[]) => {
      let rows: Doc[] = store(name).map((r) => ({ ...r }));
      for (const stage of pipeline) {
        if (stage["$match"])
          rows = rows.filter((row) => matches(row, stage["$match"] as Doc));
        else if (stage["$group"]) {
          const spec = stage["$group"] as Record<string, Doc>;
          const groups = new Map<
            string,
            { _id: unknown; count: number; push: Record<string, unknown[]> }
          >();
          for (const row of rows) {
            const key = evalExpression(spec["_id"], row) ?? null;
            const id = JSON.stringify(key);
            let group = groups.get(id);
            if (!group) {
              group = { _id: key, count: 0, push: {} };
              groups.set(id, group);
            }
            for (const [field, accumulator] of Object.entries(spec)) {
              if (field === "_id") continue;
              if (accumulator["$sum"] === 1) group.count += 1;
              else if ("$push" in accumulator)
                (group.push[field] ??= []).push(
                  evalExpression(accumulator["$push"], row),
                );
              else
                throw new Error(`fake db: unsupported accumulator on ${field}`);
            }
          }
          rows = [...groups.values()].map((g) => ({
            _id: g._id,
            count: g.count,
            ...g.push,
          }));
        } else if (stage["$sort"]) {
          const keys = Object.entries(stage["$sort"] as Record<string, number>);
          rows.sort((a, b) => {
            for (const [path, direction] of keys) {
              const delta = compareValues(getField(a, path), getField(b, path));
              if (delta !== 0) return direction < 0 ? -delta : delta;
            }
            return 0;
          });
        } else {
          throw new Error(
            `fake db: unsupported aggregation stage ${Object.keys(stage).join(",")}`,
          );
        }
      }
      return cursor(rows);
    },
    insertOne: async (doc: Doc) => {
      writes.push({
        op: "insertOne",
        collection: name,
        _id: String(doc["_id"]),
      });
      store(name).push(doc);
      return { acknowledged: true };
    },
    updateOne: async (filter: Doc, update: Doc) => {
      const row = store(name).find((candidate) => matches(candidate, filter));
      if (row) {
        Object.assign(row, (update["$set"] as Doc) ?? {});
        writes.push({
          op: "updateOne",
          collection: name,
          _id: String(row["_id"]),
        });
      }
      const matched = row ? 1 : 0;
      return {
        acknowledged: true,
        matchedCount: matched,
        modifiedCount: matched,
      };
    },
    deleteOne: async (filter: Doc) => {
      const index = store(name).findIndex((candidate) =>
        matches(candidate, filter),
      );
      if (index < 0) return { acknowledged: true, deletedCount: 0 };
      const [removed] = store(name).splice(index, 1);
      writes.push({
        op: "deleteOne",
        collection: name,
        _id: String(removed!["_id"]),
      });
      return { acknowledged: true, deletedCount: 1 };
    },
  });

  return {
    db: { collection: (name: string) => collection(name) } as unknown as Db,
    seed: (name: string, rows: Doc[]) => {
      store(name).push(...rows.map((r) => ({ ...r })));
    },
    read: (name: string) => store(name).map((r) => ({ ...r })),
    writes,
  };
}

const QUEUE = COLLECTIONS.enrollmentQueue;

function entry(id: string, overrides: Doc = {}): Doc {
  return {
    _id: id,
    studentProfileId: "sp-1",
    departmentId: "dept-1",
    academicYearId: "AY-2026",
    status: "WAITING",
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const quiet = { logger: () => {} };

describe("repairQueueInvariants", () => {
  it("performs no writes in dry-run, the default", async () => {
    const { db, seed, writes, read } = fakeDb();
    seed(QUEUE, [
      entry("q-old"),
      entry("q-new", { joinedAt: new Date("2026-01-05T00:00:00Z") }),
      entry("q-other", { studentProfileId: "sp-2", status: "IN_PROGRESS" }),
      entry("q-other-2", { studentProfileId: "sp-2", status: "IN_PROGRESS" }),
    ]);

    const result = await repairQueueInvariants(db, quiet);

    expect(result.dryRun).toBe(true);
    expect(result.plannedMutations).toBe(3);
    expect(result.appliedMutations).toBe(0);
    expect(writes).toHaveLength(0);
    expect(read(QUEUE)).toHaveLength(4);
    // Still blocking, because nothing was actually fixed.
    expect(result.auditAfter.blockingCount).toBeGreaterThan(0);
  });

  it("logs every mutation, with before, after, and reason", async () => {
    const { db, seed, writes } = fakeDb();
    seed(QUEUE, [
      entry("q-old"),
      entry("q-new", { joinedAt: new Date("2026-01-05T00:00:00Z") }),
    ]);
    const lines: string[] = [];

    const result = await repairQueueInvariants(db, {
      dryRun: false,
      logger: (message) => lines.push(message),
    });

    expect(result.appliedMutations).toBe(1);
    expect(writes).toEqual([
      { op: "deleteOne", collection: QUEUE, _id: "q-new" },
    ]);
    const mutationLines = lines.filter((l) =>
      l.includes('"source":"queue-repair"'),
    );
    expect(mutationLines).toHaveLength(1);
    const logged = JSON.parse(mutationLines[0]!);
    expect(logged).toMatchObject({
      kind: "DELETE_DUPLICATE_ENTRY",
      _id: "q-new",
      applied: true,
      dryRun: false,
    });
    expect(logged.before._id).toBe("q-new");
    expect(logged.after).toBeNull();
    expect(logged.reason).toContain("kept q-old");
  });

  describe("duplicate (studentProfileId, academicYearId)", () => {
    it("keeps the oldest and deletes the rest", async () => {
      const { db, seed, read } = fakeDb();
      seed(QUEUE, [
        entry("q-1", { joinedAt: new Date("2026-01-01T00:00:00Z") }),
        entry("q-2", { joinedAt: new Date("2026-01-02T00:00:00Z") }),
        entry("q-3", { joinedAt: new Date("2026-01-03T00:00:00Z") }),
      ]);

      const result = await repairQueueInvariants(db, {
        ...quiet,
        dryRun: false,
      });

      expect(read(QUEUE).map((r) => r["_id"])).toEqual(["q-1"]);
      expect(result.appliedMutations).toBe(2);
      expect(result.auditAfter.clean).toBe(true);
    });

    it("keeps a COMPLETED entry over an older WAITING one, because an enrollment is a fact", async () => {
      const { db, seed, read } = fakeDb();
      seed(QUEUE, [
        entry("q-waiting", { joinedAt: new Date("2026-01-01T00:00:00Z") }),
        entry("q-done", {
          status: "COMPLETED",
          joinedAt: new Date("2026-01-09T00:00:00Z"),
        }),
      ]);

      await repairQueueInvariants(db, { ...quiet, dryRun: false });

      expect(read(QUEUE).map((r) => r["_id"])).toEqual(["q-done"]);
    });

    it("keeps the IN_PROGRESS entry, so the serving lock survives", async () => {
      const { db, seed, read } = fakeDb();
      seed(QUEUE, [
        entry("q-waiting", { joinedAt: new Date("2026-01-01T00:00:00Z") }),
        entry("q-serving", {
          status: "IN_PROGRESS",
          servedById: "adv-1",
          servedAt: new Date("2026-01-09T00:00:00Z"),
          joinedAt: new Date("2026-01-09T00:00:00Z"),
        }),
      ]);

      await repairQueueInvariants(db, { ...quiet, dryRun: false });

      expect(read(QUEUE).map((r) => r["_id"])).toEqual(["q-serving"]);
    });
  });

  describe("more than one IN_PROGRESS row per department-year", () => {
    it("keeps the most recently served and returns the rest to the queue", async () => {
      const { db, seed, read, writes } = fakeDb();
      seed(QUEUE, [
        entry("q-oldest", {
          studentProfileId: "sp-1",
          status: "IN_PROGRESS",
          servedById: "adv-1",
          servedAt: new Date("2026-01-01T09:00:00Z"),
        }),
        entry("q-newest", {
          studentProfileId: "sp-2",
          status: "IN_PROGRESS",
          servedById: "adv-2",
          servedAt: new Date("2026-01-01T11:00:00Z"),
        }),
        entry("q-middle", {
          studentProfileId: "sp-3",
          status: "IN_PROGRESS",
          servedById: "adv-3",
          servedAt: new Date("2026-01-01T10:00:00Z"),
        }),
      ]);

      const result = await repairQueueInvariants(db, {
        ...quiet,
        dryRun: false,
      });

      const rows = read(QUEUE);
      expect(rows.find((r) => r["_id"] === "q-newest")?.["status"]).toBe(
        "IN_PROGRESS",
      );
      for (const id of ["q-oldest", "q-middle"]) {
        const row = rows.find((r) => r["_id"] === id);
        expect(row).toMatchObject({
          status: "WAITING",
          servedById: null,
          servedAt: null,
        });
      }
      // One action-log entry per demotion, so the change is attributable.
      expect(
        writes.filter((w) => w.collection === COLLECTIONS.adminActionLog),
      ).toHaveLength(2);
      expect(result.auditAfter.clean).toBe(true);
    });
  });

  describe("IN_PROGRESS rows missing a partial-index key field", () => {
    it("returns the row to the queue rather than deleting it", async () => {
      const { db, seed, read } = fakeDb();
      seed(QUEUE, [
        entry("q-unplaceable", {
          status: "IN_PROGRESS",
          servedById: "adv-1",
          servedAt: new Date("2026-01-01T09:00:00Z"),
          departmentId: null,
        }),
      ]);

      const result = await repairQueueInvariants(db, {
        ...quiet,
        dryRun: false,
      });

      expect(read(QUEUE)).toHaveLength(1);
      expect(read(QUEUE)[0]).toMatchObject({
        status: "WAITING",
        servedById: null,
        servedAt: null,
      });
      expect(result.mutations[0]?.kind).toBe("DEQUEUE_UNPLACEABLE");
      expect(result.auditAfter.clean).toBe(true);
    });

    it("warns that a row with no department stays unreachable", async () => {
      const { db, seed } = fakeDb();
      seed(QUEUE, [
        entry("q-unplaceable", { status: "IN_PROGRESS", departmentId: null }),
      ]);
      const lines: string[] = [];

      await repairQueueInvariants(db, {
        dryRun: false,
        logger: (message) => lines.push(message),
      });

      expect(
        lines.some(
          (l) => l.includes("q-unplaceable") && l.includes("no departmentId"),
        ),
      ).toBe(true);
    });
  });

  describe("violations it refuses to guess at", () => {
    it("reports duplicate student numbers without mutating either profile", async () => {
      const { db, seed, read, writes } = fakeDb();
      seed(COLLECTIONS.studentProfile, [
        { _id: "sp-1", userId: "u-1", studentNumber: "2401117078" },
        { _id: "sp-2", userId: "u-2", studentNumber: "2401117078" },
      ]);

      const result = await repairQueueInvariants(db, {
        ...quiet,
        dryRun: false,
      });

      expect(result.unrepairable.duplicateStudentNumbers).toEqual([
        "2401117078 -> [sp-1, sp-2]",
      ]);
      expect(writes).toHaveLength(0);
      expect(read(COLLECTIONS.studentProfile)).toHaveLength(2);
      expect(result.auditAfter.clean).toBe(false);
    });

    it("leaves a clean database alone", async () => {
      const { db, seed, writes } = fakeDb();
      seed(QUEUE, [entry("q-1")]);

      const result = await repairQueueInvariants(db, {
        ...quiet,
        dryRun: false,
      });

      expect(result.mutations).toHaveLength(0);
      expect(writes).toHaveLength(0);
      expect(result.auditAfter.clean).toBe(true);
    });
  });
});

describe("repairQueueInvariants logging", () => {
  it("prints the audit it is working from, so the log stands alone", async () => {
    const { db, seed } = fakeDb();
    seed(QUEUE, [entry("q-1"), entry("q-2")]);
    const log = vi.fn();

    await repairQueueInvariants(db, { dryRun: true, logger: log });

    const printed = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain("auditQueueInvariants");
    expect(printed).toContain("duplicate (studentProfileId, academicYearId)");
    expect(printed).toContain("q-1");
  });
});
