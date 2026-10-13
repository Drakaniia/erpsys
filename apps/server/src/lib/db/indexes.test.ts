// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { COLLECTIONS } from "./db.js";
import { INDEX_PLANS, QueueInvariantError, ensureIndexes } from "./indexes.js";
import { auditQueueInvariants } from "./queue-audit.js";

/**
 * A hand-rolled in-memory stand-in for the handful of Mongo operations the
 * index bootstrap and the audit use. No real database: the point of these
 * tests is the sequencing and the shapes, not the driver's behaviour.
 *
 * The filter and aggregation support is deliberately minimal — exactly the
 * operators the audit's pipelines use — and throws on anything else, so a
 * pipeline change that the fake silently ignored cannot pass unnoticed.
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
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((v, i) => isEqualValue(actual[i], v))
    );
  if (typeof expected === "object")
    return (
      actual !== null &&
      typeof actual === "object" &&
      JSON.stringify(actual) === JSON.stringify(expected)
    );
  return actual === expected;
}

/**
 * BSON comparison order, so the fake agrees with the server on the one case
 * that matters here: `null` sorts before `date`, so `{ x: { $lt: cutoff } }`
 * matches a `null` `x`. The availability sweep depends on that.
 */
function typeOrder(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return 1;
  if (typeof value === "string") return 2;
  if (value instanceof Date) return 3;
  if (typeof value === "boolean") return 4;
  return 5;
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

type FakeCalls = {
  createIndexes: Array<{ collection: string; specs: Doc[] }>;
  insertOne: Array<{ collection: string; doc: Doc }>;
  updateOne: Array<{
    collection: string;
    filter: Doc;
    update: Doc;
    matched: number;
  }>;
  updateMany: Array<{
    collection: string;
    filter: Doc;
    update: Doc;
    matched: number;
  }>;
  deleteOne: Array<{ collection: string; filter: Doc; deleted: number }>;
};

function fakeDb(options: { missingNamespaces?: string[] } = {}) {
  const missing = new Set(options.missingNamespaces ?? []);
  const stores = new Map<string, Doc[]>();
  const indexes = new Map<string, Doc[]>();
  const calls: FakeCalls = {
    createIndexes: [],
    insertOne: [],
    updateOne: [],
    updateMany: [],
    deleteOne: [],
  };

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
    listIndexes: () => {
      // A collection with no writes yet has no namespace: the driver throws
      // NamespaceNotFound (code 26) instead of returning [].
      if (missing.has(name)) throw { code: 26, codeName: "NamespaceNotFound" };
      return cursor(indexes.get(name) ?? []);
    },
    createIndexes: async (specs: Doc[]) => {
      calls.createIndexes.push({ collection: name, specs });
      const current = indexes.get(name) ?? [];
      for (const spec of specs) current.push({ ...spec });
      indexes.set(name, current);
      return specs.map((s) => String(s["name"]));
    },
    insertOne: async (doc: Doc) => {
      calls.insertOne.push({ collection: name, doc });
      store(name).push(doc);
      return { acknowledged: true, insertedId: doc["_id"] };
    },
    updateOne: async (filter: Doc, update: Doc) => {
      const row = store(name).find((candidate) => matches(candidate, filter));
      const matched = row ? 1 : 0;
      calls.updateOne.push({ collection: name, filter, update, matched });
      if (row) Object.assign(row, (update["$set"] as Doc) ?? {});
      return {
        acknowledged: true,
        matchedCount: matched,
        modifiedCount: matched,
      };
    },
    updateMany: async (filter: Doc, update: Doc) => {
      const rows = store(name).filter((candidate) =>
        matches(candidate, filter),
      );
      calls.updateMany.push({
        collection: name,
        filter,
        update,
        matched: rows.length,
      });
      for (const row of rows) Object.assign(row, (update["$set"] as Doc) ?? {});
      return {
        acknowledged: true,
        matchedCount: rows.length,
        modifiedCount: rows.length,
      };
    },
    deleteOne: async (filter: Doc) => {
      const index = store(name).findIndex((candidate) =>
        matches(candidate, filter),
      );
      if (index < 0) {
        calls.deleteOne.push({ collection: name, filter, deleted: 0 });
        return { acknowledged: true, deletedCount: 0 };
      }
      store(name).splice(index, 1);
      calls.deleteOne.push({ collection: name, filter, deleted: 1 });
      return { acknowledged: true, deletedCount: 1 };
    },
  });

  const db = {
    collection: (name: string) => collection(name),
  } as unknown as Db;

  return {
    db,
    calls,
    seed: (name: string, rows: Doc[]) => {
      store(name).push(...rows.map((r) => ({ ...r })));
    },
    read: (name: string) => store(name).map((r) => ({ ...r })),
    writes: () =>
      calls.insertOne.length +
      calls.updateOne.length +
      calls.updateMany.length +
      calls.deleteOne.length +
      calls.createIndexes.length,
  };
}

const QUEUE = COLLECTIONS.enrollmentQueue;

function waiting(
  id: string,
  studentProfileId: string,
  overrides: Doc = {},
): Doc {
  return {
    _id: id,
    studentProfileId,
    departmentId: "dept-1",
    academicYearId: "AY-2026",
    status: "WAITING",
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const quiet = { logger: () => {} };

describe("ensureIndexes", () => {
  it("creates every planned index in one batched call per collection", async () => {
    const { db, calls } = fakeDb();
    await ensureIndexes(db, quiet);

    expect(calls.createIndexes.map((c) => c.collection)).toEqual(
      INDEX_PLANS.map((p) => p.collection),
    );
    const created = calls.createIndexes.flatMap((c) => c.specs);
    expect(created).toHaveLength(
      INDEX_PLANS.reduce((total, p) => total + p.indexes.length, 0),
    );

    // The two unique indexes are the whole point of the phase.
    const serving = created.find(
      (s) => s["name"] === "uq_enrollment_queue_department_serving",
    );
    expect(serving).toMatchObject({
      key: { departmentId: 1, academicYearId: 1 },
      unique: true,
      partialFilterExpression: { status: "IN_PROGRESS" },
    });
    const studentYear = created.find(
      (s) => s["name"] === "uq_enrollment_queue_student_year",
    );
    expect(studentYear).toMatchObject({
      key: { studentProfileId: 1, academicYearId: 1 },
      unique: true,
    });

    // The pending-row idempotency key.
    const idempotency = created.find(
      (s) => s["name"] === "uq_upload_idempotency_key",
    );
    expect(idempotency).toMatchObject({
      key: { idempotencyKey: 1 },
      unique: true,
      partialFilterExpression: { idempotencyKey: { $exists: true } },
    });
  });

  it("plans the R2 quota-guard and pending-session reaper indexes", async () => {
    const { db, calls } = fakeDb();
    await ensureIndexes(db, quiet);

    const created = calls.createIndexes.flatMap((c) =>
      c.specs.map((s) => s["name"]),
    );
    expect(created).toContain("uq_storage_usage_month");
    expect(created).toContain("idx_upload_r2_status_expires");

    const byName = new Map(
      INDEX_PLANS.flatMap((p) => p.indexes.map((s) => [s.name, s] as const)),
    );
    expect(byName.get("uq_storage_usage_month")).toMatchObject({
      key: { month: 1 },
      unique: true,
    });
    expect(byName.get("idx_upload_r2_status_expires")).toMatchObject({
      key: { r2Status: 1, sessionExpiresAt: 1 },
      partialFilterExpression: { r2Status: { $exists: true } },
    });
    const plans = new Map(INDEX_PLANS.map((p) => [p.collection, p]));
    expect(plans.get(COLLECTIONS.storageUsage)?.collection).toBe(
      COLLECTIONS.storageUsage,
    );
  });

  it("is idempotent: a second run creates nothing and does not conflict", async () => {
    const { db, calls } = fakeDb();
    await ensureIndexes(db, quiet);
    const afterFirst = calls.createIndexes.length;

    await expect(ensureIndexes(db, quiet)).resolves.toBeUndefined();

    expect(calls.createIndexes).toHaveLength(afterFirst);
  });

  it("treats a missing collection namespace as empty and creates its indexes", async () => {
    const { db, calls } = fakeDb({
      missingNamespaces: [COLLECTIONS.storageUsage],
    });
    await expect(ensureIndexes(db, quiet)).resolves.toBeUndefined();

    const usage = calls.createIndexes.find(
      (c) => c.collection === COLLECTIONS.storageUsage,
    );
    expect(usage?.specs.map((s) => s["name"])).toEqual([
      "uq_storage_usage_month",
    ]);
  });

  it("refuses to build the indexes when the audit reports violations", async () => {
    const { db, calls, seed } = fakeDb();
    seed(QUEUE, [
      waiting("q-1", "sp-1"),
      waiting("q-2", "sp-1", { joinedAt: new Date("2026-01-02T00:00:00Z") }),
    ]);

    const error = await ensureIndexes(db, quiet).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueueInvariantError);
    const failure = error as QueueInvariantError;
    expect(failure.message).toContain("auditQueueInvariants()");
    expect(failure.message).toContain("tsx src/lib/queue-repair.ts");
    expect(failure.message).toContain("duplicateStudentYearEntries: 1");
    expect(
      failure.report.duplicateStudentYearEntries[0]?.entries.map((e) => e.id),
    ).toEqual(["q-1", "q-2"]);
    // Not one index is created — audit → repair → index, all or nothing.
    expect(calls.createIndexes).toHaveLength(0);
  });
});

describe("auditQueueInvariants", () => {
  it("detects duplicate (studentProfileId, academicYearId) queue entries", async () => {
    const { db, seed } = fakeDb();
    seed(QUEUE, [
      waiting("q-1", "sp-1"),
      waiting("q-2", "sp-1", { joinedAt: new Date("2026-02-01T00:00:00Z") }),
      waiting("q-3", "sp-2"),
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.duplicateStudentYearEntries).toHaveLength(1);
    expect(report.duplicateStudentYearEntries[0]).toMatchObject({
      studentProfileId: "sp-1",
      academicYearId: "AY-2026",
    });
    expect(
      report.duplicateStudentYearEntries[0]?.entries.map((e) => e.id),
    ).toEqual(["q-1", "q-2"]);
    expect(report.blockingByCategory["duplicateStudentYearEntries"]).toBe(1);
  });

  it("detects a department with two IN_PROGRESS rows for one year", async () => {
    const { db, seed } = fakeDb();
    seed(QUEUE, [
      waiting("q-1", "sp-1", {
        status: "IN_PROGRESS",
        servedById: "adv-1",
        servedAt: new Date("2026-01-01T09:00:00Z"),
      }),
      waiting("q-2", "sp-2", {
        status: "IN_PROGRESS",
        servedById: "adv-2",
        servedAt: new Date("2026-01-01T10:00:00Z"),
      }),
      waiting("q-3", "sp-3", { departmentId: "dept-2" }),
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.departmentServingConflicts).toHaveLength(1);
    expect(report.departmentServingConflicts[0]).toMatchObject({
      departmentId: "dept-1",
      academicYearId: "AY-2026",
    });
    // Most recently served first, so a repair knows which row to keep.
    expect(
      report.departmentServingConflicts[0]?.entries.map((e) => e.id),
    ).toEqual(["q-2", "q-1"]);
  });

  it("detects duplicate studentNumber values", async () => {
    const { db, seed } = fakeDb();
    seed(COLLECTIONS.studentProfile, [
      { _id: "sp-1", userId: "u-1", studentNumber: "2401117078" },
      { _id: "sp-2", userId: "u-2", studentNumber: "2401117078" },
      { _id: "sp-3", userId: "u-3", studentNumber: "2401119999" },
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.duplicateStudentNumbers).toEqual([
      { studentNumber: "2401117078", profileIds: ["sp-1", "sp-2"] },
    ]);
  });

  it("flags IN_PROGRESS rows missing a partial-index key field", async () => {
    const { db, seed } = fakeDb();
    seed(QUEUE, [
      waiting("q-ok", "sp-1", { status: "IN_PROGRESS" }),
      waiting("q-no-dept", "sp-2", {
        status: "IN_PROGRESS",
        departmentId: null,
      }),
      waiting("q-no-year", "sp-3", {
        status: "IN_PROGRESS",
        academicYearId: undefined,
      }),
      // A waiting row missing a field is fine — it is outside the partial
      // index's filter, so only the IN_PROGRESS one is a problem.
      waiting("q-waiting-no-dept", "sp-4", { departmentId: null }),
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.unplaceableServingEntries).toHaveLength(2);
    const byId = new Map(
      report.unplaceableServingEntries.map((r) => [r.entryId, r.missing]),
    );
    expect(byId.get("q-no-dept")).toEqual(["departmentId"]);
    expect(byId.get("q-no-year")).toEqual(["academicYearId"]);
  });

  it("treats two numberless profiles as a collision, because a unique index keys a missing field as null", async () => {
    const { db, seed } = fakeDb();
    seed(COLLECTIONS.studentProfile, [
      { _id: "sp-1", userId: "u-1" },
      { _id: "sp-2", userId: "u-2", studentNumber: null },
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.duplicateStudentNumbers).toEqual([
      { studentNumber: null, profileIds: ["sp-1", "sp-2"] },
    ]);
  });

  it("detects the Better Auth unique keys it cannot report on later", async () => {
    const { db, seed } = fakeDb();
    seed(COLLECTIONS.user, [
      { _id: "u-1", email: "a@buksu.edu.ph" },
      { _id: "u-2", email: "a@buksu.edu.ph" },
    ]);
    seed(COLLECTIONS.session, [
      { _id: "s-1", token: "t-1" },
      { _id: "s-2", token: "t-1" },
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.duplicateAuthKeys).toEqual([
      {
        collection: COLLECTIONS.user,
        field: "email",
        value: "a@buksu.edu.ph",
        documentIds: ["u-1", "u-2"],
      },
      {
        collection: COLLECTIONS.session,
        field: "token",
        value: "t-1",
        documentIds: ["s-1", "s-2"],
      },
    ]);
  });

  it("reports clean on an empty database", async () => {
    const { db } = fakeDb();
    const report = await auditQueueInvariants(db);
    expect(report.clean).toBe(true);
    expect(report.blockingCount).toBe(0);
  });

  it("is dry-run by default: it mutates nothing", async () => {
    const { db, calls, seed, writes } = fakeDb();
    seed(QUEUE, [
      waiting("q-1", "sp-1"),
      waiting("q-2", "sp-1"),
      waiting("q-3", "sp-2", { status: "IN_PROGRESS" }),
      waiting("q-4", "sp-2", { status: "IN_PROGRESS" }),
    ]);
    seed(COLLECTIONS.studentProfile, [
      { _id: "sp-1", userId: "u-1", studentNumber: "1" },
      { _id: "sp-2", userId: "u-2", studentNumber: "1" },
    ]);

    const report = await auditQueueInvariants(db);

    expect(report.blockingCount).toBeGreaterThan(0);
    expect(writes()).toBe(0);
    expect(calls.insertOne).toHaveLength(0);
    expect(calls.updateOne).toHaveLength(0);
    expect(calls.updateMany).toHaveLength(0);
    expect(calls.deleteOne).toHaveLength(0);
    expect(calls.createIndexes).toHaveLength(0);
  });
});

describe("ensureIndexes logging", () => {
  it("says what it did, so a deploy log explains itself", async () => {
    const { db } = fakeDb();
    const lines: string[] = [];
    const logger = vi.fn((message: string) => lines.push(message));

    await ensureIndexes(db, { logger });
    await ensureIndexes(db, { logger });

    expect(lines.some((l) => l.includes("preflight audit clean"))).toBe(true);
    expect(
      lines.filter((l) => l.includes(`${QUEUE}: up to date`)),
    ).toHaveLength(1);
  });
});
