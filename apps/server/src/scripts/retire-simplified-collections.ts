import { pathToFileURL } from "node:url";
import { MongoClient, type Db } from "mongodb";
import {
  SIMPLIFICATION_COLLECTIONS,
  SimplificationError,
  planCollectionSimplification,
  verifySimplificationSnapshot,
  type MigrationRow,
  type SimplificationSnapshot,
} from "../lib/db/collection-simplification.js";

export const RETIRED_SOURCES = [
  "student_profile",
  "adviser_department",
  "step",
  "requirement_item",
  "social_media_link",
  "adviser_availability",
  "availability_window",
] as const;

type Options = {
  apply: boolean;
  writersStopped: boolean;
  restoreVerified: boolean;
  backupReference?: string;
  database?: string;
};

export function parseRetirementArgs(args: readonly string[]): Options {
  const options: Options = {
    apply: false,
    writersStopped: false,
    restoreVerified: false,
  };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (seen.has(arg)) throw new Error("INVALID_ARGUMENTS");
    seen.add(arg);
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--writers-stopped") options.writersStopped = true;
    else if (arg === "--restore-verified") options.restoreVerified = true;
    else if (arg === "--backup-reference" || arg === "--database") {
      const value = args[++i];
      if (!value?.trim() || value.startsWith("--"))
        throw new Error("INVALID_ARGUMENTS");
      if (arg === "--database") options.database = value.trim();
      else options.backupReference = value.trim();
    } else throw new Error("INVALID_ARGUMENTS");
  }
  if (seen.has("--apply") && seen.has("--dry-run"))
    throw new Error("INVALID_ARGUMENTS");
  if (
    options.apply &&
    (!options.writersStopped ||
      !options.restoreVerified ||
      !options.backupReference ||
      !options.database)
  ) {
    throw new Error(
      "RETIREMENT_REQUIRES_OFFLINE_BACKUP_RESTORE_AND_DATABASE_ACKNOWLEDGEMENTS",
    );
  }
  if (
    !options.apply &&
    (options.writersStopped ||
      options.restoreVerified ||
      options.backupReference ||
      options.database)
  ) {
    throw new Error("ACKNOWLEDGEMENTS_REQUIRE_APPLY");
  }
  return options;
}

async function snapshot(db: Db): Promise<SimplificationSnapshot> {
  const result = {} as SimplificationSnapshot;
  for (const name of SIMPLIFICATION_COLLECTIONS) {
    result[name] = await db.collection<MigrationRow>(name).find({}).toArray();
  }
  return result;
}

async function requireMarker(db: Db): Promise<void> {
  const marker = await db.collection("platform_state").findOne({
    _id: "collection-simplification-v2",
    version: 2,
    completedAt: { $type: "date" },
  } as never);
  if (!marker) throw new Error("VERIFIED_V2_MARKER_REQUIRED");
}

export async function runCollectionRetirement(
  args: readonly string[],
): Promise<void> {
  const options = parseRetirementArgs(args);
  const { env } = await import("../lib/platform/env.js");
  const client = new MongoClient(env.DATABASE_URL, {
    appName: "erpsys-offline-source-retirement",
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const db = client.db();
    if (options.apply && options.database !== db.databaseName)
      throw new Error("DATABASE_MISMATCH");
    await requireMarker(db);
    const before = await snapshot(db);
    if (planCollectionSimplification(before).changes.length) {
      throw new Error("SOURCE_DESTINATION_RECONCILIATION_REQUIRED");
    }
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (row) => row.name,
      ),
    );
    const sources = RETIRED_SOURCES.filter((name) => existing.has(name));
    console.log(
      JSON.stringify({
        mode: options.apply ? "apply" : "dry-run",
        collections: sources.length,
        sourceRows: RETIRED_SOURCES.reduce(
          (sum, name) => sum + before[name].length,
          0,
        ),
      }),
    );
    if (!options.apply) return;
    for (const name of sources) {
      await requireMarker(db);
      verifySimplificationSnapshot(before, await snapshot(db));
      await db.collection(name).drop();
      before[name] = [];
      verifySimplificationSnapshot(before, await snapshot(db));
    }
    console.log(
      JSON.stringify({ verified: true, droppedCollections: sources.length }),
    );
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCollectionRetirement(process.argv.slice(2)).catch((error: unknown) => {
    const code =
      error instanceof SimplificationError
        ? `${error.code} (${error.collection})`
        : error instanceof Error &&
            [
              "INVALID_ARGUMENTS",
              "RETIREMENT_REQUIRES_OFFLINE_BACKUP_RESTORE_AND_DATABASE_ACKNOWLEDGEMENTS",
              "ACKNOWLEDGEMENTS_REQUIRE_APPLY",
              "DATABASE_MISMATCH",
              "VERIFIED_V2_MARKER_REQUIRED",
              "SOURCE_DESTINATION_RECONCILIATION_REQUIRED",
            ].includes(error.message)
          ? error.message
          : "RETIREMENT_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}
