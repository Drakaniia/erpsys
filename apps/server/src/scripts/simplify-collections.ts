import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { MongoClient, type Db, type Document } from "mongodb";
import {
  SIMPLIFICATION_COLLECTIONS,
  SimplificationError,
  expectedSimplificationSnapshot,
  planCollectionSimplification,
  verifySimplificationSnapshot,
  type MigrationRow,
  type SimplificationChange,
  type SimplificationSnapshot,
} from "../lib/db/collection-simplification.js";

export type SimplificationOptions = {
  apply: boolean;
  writersStopped: boolean;
  backupReference?: string;
};

export function parseSimplificationArgs(
  args: readonly string[],
): SimplificationOptions {
  const options: SimplificationOptions = {
    apply: false,
    writersStopped: false,
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (seen.has(arg)) throw new Error("INVALID_ARGUMENTS");
    seen.add(arg);
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--writers-stopped") options.writersStopped = true;
    else if (arg === "--backup-reference") {
      const value = args[++i];
      if (!value?.trim() || value.startsWith("--"))
        throw new Error("INVALID_ARGUMENTS");
      options.backupReference = value.trim();
    } else throw new Error("INVALID_ARGUMENTS");
  }
  if (seen.has("--apply") && seen.has("--dry-run"))
    throw new Error("INVALID_ARGUMENTS");
  if (options.apply && (!options.writersStopped || !options.backupReference)) {
    throw new Error("APPLY_REQUIRES_OFFLINE_ACKNOWLEDGEMENT_AND_BACKUP");
  }
  if (!options.apply && (options.writersStopped || options.backupReference)) {
    throw new Error("ACKNOWLEDGEMENTS_REQUIRE_APPLY");
  }
  return options;
}

async function snapshot(db: Db): Promise<SimplificationSnapshot> {
  const result = {} as SimplificationSnapshot;
  for (const collection of SIMPLIFICATION_COLLECTIONS) {
    result[collection] = await db
      .collection<MigrationRow>(collection)
      .find({})
      .toArray();
  }
  return result;
}

/**
 * Concurrency: timestamp ordering — offline migration compare-and-swap.
 * Rule: all writers must be stopped; compare the entire parent, including readTs/writeTs, before merging.
 * Pass: preserve readTs/writeTs and update only the planned embedded field or stepId.
 * Abort: stop on any changed document; never overwrite concurrent writes or retry automatically.
 */
async function applyChange(
  db: Db,
  change: SimplificationChange,
): Promise<void> {
  const collection = db.collection<MigrationRow>(change.collection);
  if (change.before === null) {
    await collection.insertOne(change.after);
    return;
  }
  const entries = Object.entries(change.before).map(([key, value]) => ({
    $eq: [
      { $getField: { field: { $literal: key }, input: "$$ROOT" } },
      { $literal: value },
    ],
  }));
  const result = await collection.updateOne(
    {
      _id: change.before._id,
      $expr: {
        $and: [
          {
            $eq: [
              { $size: { $objectToArray: "$$ROOT" } },
              Object.keys(change.before).length,
            ],
          },
          ...entries,
        ],
      },
    } as Document,
    { $set: change.set },
  );
  if (result.matchedCount !== 1)
    throw new Error("OFFLINE_COMPARE_AND_SWAP_FAILED");
}

export async function runCollectionSimplification(
  args: readonly string[],
): Promise<void> {
  const options = parseSimplificationArgs(args);
  const { env } = await import("../lib/platform/env.js");
  const client = new MongoClient(env.DATABASE_URL, {
    appName: "erpsys-offline-collection-simplification",
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const db = client.db();
    const markers = db.collection<MigrationRow>("platform_state");
    const marker = await markers.findOne({
      _id: "collection-simplification-v2",
    });
    if (marker) throw new Error("MIGRATION_ALREADY_COMPLETED");
    const before = await snapshot(db);
    const plan = planCollectionSimplification(before);
    console.log(
      JSON.stringify({
        mode: options.apply ? "apply" : "dry-run",
        ...plan.summary,
      }),
    );
    if (!options.apply) return;
    const rechecked = await snapshot(db);
    for (const collection of SIMPLIFICATION_COLLECTIONS) {
      if (!isDeepStrictEqual(before[collection], rechecked[collection])) {
        throw new Error("OFFLINE_SNAPSHOT_CHANGED");
      }
    }
    const expected = expectedSimplificationSnapshot(before, plan);
    for (const change of plan.changes) await applyChange(db, change);
    verifySimplificationSnapshot(expected, await snapshot(db));
    await markers.insertOne({
      _id: "collection-simplification-v2",
      version: 2,
      completedAt: new Date(),
    });
    console.log(
      JSON.stringify({ verified: true, changedRows: plan.changes.length }),
    );
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCollectionSimplification(process.argv.slice(2)).catch((error: unknown) => {
    const code =
      error instanceof SimplificationError
        ? `${error.code} (${error.collection})`
        : error instanceof Error &&
            [
              "INVALID_ARGUMENTS",
              "APPLY_REQUIRES_OFFLINE_ACKNOWLEDGEMENT_AND_BACKUP",
              "ACKNOWLEDGEMENTS_REQUIRE_APPLY",
              "OFFLINE_COMPARE_AND_SWAP_FAILED",
              "OFFLINE_SNAPSHOT_CHANGED",
              "MIGRATION_ALREADY_COMPLETED",
            ].includes(error.message)
          ? error.message
          : "MIGRATION_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}
