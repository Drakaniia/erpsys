import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Db } from "mongodb";
import { COLLECTIONS, getDb } from "./db.js";
import { genId } from "./ids.js";
import {
  auditQueueInvariants,
  formatQueueAuditReport,
  type QueueAuditReport,
  type QueueEntryRef,
} from "./queue-audit.js";

type RepairActionKind =
  | "DEQUEUE_UNPLACEABLE"
  | "DEMOTE_EXTRA_SERVING"
  | "DELETE_DUPLICATE_ENTRY";

type RepairMutation = {
  kind: RepairActionKind;
  collection: string;
  _id: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown> | null;
  applied: boolean;
};

type QueueRepairResult = {
  dryRun: boolean;
  plannedMutations: number;
  appliedMutations: number;
  mutations: RepairMutation[];
  unrepairable: {
    duplicateStudentNumbers: string[];
    duplicateAuthKeys: string[];
  };
  auditBefore: QueueAuditReport;
  auditAfter: QueueAuditReport;
};

type RepairOptions = {
  dryRun?: boolean;
  logger?: (message: string) => void;
};

function defaultLog(message: string): void {
  console.log(message);
}

const STATUS_PRIORITY: Record<string, number> = {
  COMPLETED: 0,
  IN_PROGRESS: 1,
  WAITING: 2,
};

function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "number") return value;
  return 0;
}

function survivor(entries: QueueEntryRef[]): QueueEntryRef {
  return [...entries].sort((a, b) => {
    const byStatus =
      (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3);
    if (byStatus !== 0) return byStatus;
    const byJoined = timeOf(a.joinedAt) - timeOf(b.joinedAt);
    if (byJoined !== 0) return byJoined;
    return a.id.localeCompare(b.id);
  })[0]!;
}

function servingSurvivor(entries: QueueEntryRef[]): QueueEntryRef {
  return entries[0]!;
}

export async function repairQueueInvariants(
  db: Db,
  options: RepairOptions = {},
): Promise<QueueRepairResult> {
  const dryRun = options.dryRun !== false;
  const log = options.logger ?? defaultLog;
  const queue = db.collection(COLLECTIONS.enrollmentQueue);
  const mutations: RepairMutation[] = [];

  const record = (mutation: RepairMutation): void => {
    mutations.push(mutation);
    log(
      JSON.stringify({
        source: "queue-repair",
        dryRun,
        ...mutation,
      }),
    );
  };

  const auditBefore = await auditQueueInvariants(db);
  log(formatQueueAuditReport(auditBefore));

  const dequeuedIds = new Set<string>();

  for (const row of auditBefore.unplaceableServingEntries) {
    const before = (await queue.findOne({
      _id: row.entryId,
    } as never)) as Record<string, unknown> | null;
    if (!before) continue;
    const after = {
      ...before,
      status: "WAITING",
      servedById: null,
      servedAt: null,
    };
    const mutation: RepairMutation = {
      kind: "DEQUEUE_UNPLACEABLE",
      collection: COLLECTIONS.enrollmentQueue,
      _id: row.entryId,
      reason: `IN_PROGRESS row is missing [${row.missing.join(", ")}], so the partial unique index on (departmentId, academicYearId) cannot be built over it. Returned to the queue; the document is preserved.`,
      before: before as Record<string, unknown>,
      after: after as Record<string, unknown>,
      applied: false,
    };
    if (!dryRun) {
      await queue.updateOne(
        {
          _id: row.entryId,
          status: "IN_PROGRESS",
        } as never,
        {
          $set: { status: "WAITING", servedById: null, servedAt: null },
        } as never,
      );
      mutation.applied = true;
      dequeuedIds.add(row.entryId);
    }
    record(mutation);
    if (row.missing.includes("departmentId")) {
      log(
        `[queue-repair] entry ${row.entryId} has no departmentId even after dequeueing — no read path can reach it. Assign a department or delete it by hand.`,
      );
    }
  }

  for (const conflict of auditBefore.departmentServingConflicts) {
    const candidates = conflict.entries.filter((e) => !dequeuedIds.has(e.id));
    if (candidates.length < 2) continue;
    const keep = servingSurvivor(candidates);
    for (const entry of candidates) {
      if (entry.id === keep.id) continue;
      const before = (await queue.findOne({
        _id: entry.id,
      } as never)) as Record<string, unknown> | null;
      if (!before) continue;
      const after = {
        ...before,
        status: "WAITING",
        servedById: null,
        servedAt: null,
      };
      const mutation: RepairMutation = {
        kind: "DEMOTE_EXTRA_SERVING",
        collection: COLLECTIONS.enrollmentQueue,
        _id: entry.id,
        reason: `Department ${conflict.departmentId ?? "(missing)"} year ${conflict.academicYearId ?? "(missing)"} had ${candidates.length} IN_PROGRESS rows; kept ${keep.id} (most recently served) and returned this one to the queue.`,
        before: before as Record<string, unknown>,
        after: after as Record<string, unknown>,
        applied: false,
      };
      if (!dryRun) {
        const demoted = await queue.updateOne(
          { _id: entry.id, status: "IN_PROGRESS" } as never,
          {
            $set: { status: "WAITING", servedById: null, servedAt: null },
          } as never,
        );
        if ((demoted.matchedCount ?? 0) === 0) {
          log(
            `[queue-repair] entry ${entry.id} was no longer IN_PROGRESS when the demotion ran — left untouched.`,
          );
          continue;
        }
        mutation.applied = true;
        await db.collection(COLLECTIONS.adminActionLog).insertOne({
          _id: genId("admin-action"),
          actorId: entry.servedById ?? "system",
          action: "AUTO_REPAIR_DEMOTE_EXTRA_SERVING",
          targetRef: `EnrollmentQueue:${entry.id}`,
          at: new Date(),
        } as never);
      }
      record(mutation);
    }
  }

  for (const duplicate of auditBefore.duplicateStudentYearEntries) {
    const keep = survivor(duplicate.entries);
    for (const entry of duplicate.entries) {
      if (entry.id === keep.id) continue;
      const before = (await queue.findOne({
        _id: entry.id,
      } as never)) as Record<string, unknown> | null;
      if (!before) continue;
      const mutation: RepairMutation = {
        kind: "DELETE_DUPLICATE_ENTRY",
        collection: COLLECTIONS.enrollmentQueue,
        _id: entry.id,
        reason: `Student ${duplicate.studentProfileId ?? "(missing)"} had ${duplicate.entries.length} entries for year ${duplicate.academicYearId ?? "(missing)"}; kept ${keep.id} (${keep.status}, joined ${String(keep.joinedAt ?? "unknown")}) and deleted this one.`,
        before: before as Record<string, unknown>,
        after: null,
        applied: false,
      };
      if (!dryRun) {
        const deleted = await queue.deleteOne({
          _id: entry.id,
        } as never);
        mutation.applied = (deleted.deletedCount ?? 0) > 0;
        if (!mutation.applied) continue;
      }
      record(mutation);
    }
  }

  const auditAfter = dryRun ? auditBefore : await auditQueueInvariants(db);
  const appliedMutations = mutations.filter((m) => m.applied).length;

  const result: QueueRepairResult = {
    dryRun,
    plannedMutations: mutations.length,
    appliedMutations,
    mutations,
    unrepairable: {
      duplicateStudentNumbers: auditBefore.duplicateStudentNumbers.map(
        (d) =>
          `${d.studentNumber ?? "(missing)"} -> [${d.profileIds.join(", ")}]`,
      ),
      duplicateAuthKeys: auditBefore.duplicateAuthKeys.map(
        (d) =>
          `${d.collection}.${d.field}=${d.value ?? "(missing)"} -> [${d.documentIds.join(", ")}]`,
      ),
    },
    auditBefore,
    auditAfter,
  };

  log(
    `[queue-repair] ${dryRun ? "dry run" : "applied"}: ${mutations.length} mutation(s) planned, ${appliedMutations} applied. ${auditAfter.blockingCount} blocking violation(s) remain.`,
  );
  if (auditAfter.blockingCount > 0) {
    log(formatQueueAuditReport(auditAfter));
  }
  return result;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--apply");
  const db = await getDb();
  const result = await repairQueueInvariants(db, { dryRun });
  const blocked =
    result.auditAfter.blockingCount > 0 ||
    result.unrepairable.duplicateStudentNumbers.length > 0 ||
    result.unrepairable.duplicateAuthKeys.length > 0;
  if (blocked) {
    console.error(
      "[queue-repair] violations remain. Duplicate student numbers and auth keys are NOT auto-repaired — resolve them by hand, then run ensureIndexes() again.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    "[queue-repair] done. Boot the server (or call ensureIndexes()) to build the indexes.",
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  await main();
}
