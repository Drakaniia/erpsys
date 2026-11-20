import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { MongoClient, type Db, type Document } from "mongodb";
import { parseRetirementArgs } from "./retire-simplified-collections.js";

export const LEGACY_SOURCES = [
  "admin_action_log",
  "integration_setting",
  "integration_credential",
  "profiling_form",
  "editing_presence",
] as const;
export const LEGACY_COLLECTIONS = [
  ...LEGACY_SOURCES,
  "audit_log",
  "integration",
  "academic_year",
] as const;
type Row = Record<string, unknown>;
export type LegacySnapshot = Record<(typeof LEGACY_COLLECTIONS)[number], Row[]>;

function fail(): never {
  throw new Error("LEGACY_RECONCILIATION_REQUIRED");
}

function sameId(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b);
}

function fields(
  source: Row,
  destination: Row,
  omitted: readonly string[],
): void {
  for (const [key, value] of Object.entries(source)) {
    if (!omitted.includes(key) && !isDeepStrictEqual(value, destination[key]))
      fail();
  }
}

function shape(row: Row, allowed: readonly string[]): void {
  if (Object.keys(row).some((key) => !allowed.includes(key))) fail();
}

function unique(rows: Row[]): Row {
  if (rows.length !== 1) fail();
  return rows[0]!;
}

export function reconcileLegacy(snapshot: LegacySnapshot): void {
  const usedActions = new Set<Row>();
  for (const source of snapshot.admin_action_log) {
    if (
      !(source.at instanceof Date) ||
      !Number.isFinite(source.at.getTime()) ||
      typeof source.action !== "string"
    )
      fail();
    const target = unique(
      snapshot.audit_log.filter((row) => sameId(row.legacyId, source._id)),
    );
    if (usedActions.has(target) || target.kind !== "action") fail();
    usedActions.add(target);
    fields(source, target, ["_id", "readTs", "writeTs"]);
    if (
      !isDeepStrictEqual(source.at, target.createdAt) ||
      !isDeepStrictEqual(source.at, target.updatedAt)
    )
      fail();
  }
  const settingKeys = new Set<unknown>();
  for (const source of snapshot.integration_setting) {
    shape(source, [
      "_id",
      "key",
      "enabled",
      "createdAt",
      "updatedAt",
      "updatedById",
      "readTs",
      "writeTs",
    ]);
    if (
      typeof source.key !== "string" ||
      typeof source.enabled !== "boolean" ||
      settingKeys.has(source.key)
    )
      fail();
    settingKeys.add(source.key);
    const target = unique(
      snapshot.integration.filter((row) => row.key === source.key),
    );
    if (
      !isDeepStrictEqual(source.enabled, target.enabled) ||
      !isDeepStrictEqual(source.updatedAt, target.enabledAt) ||
      !isDeepStrictEqual(source.updatedById, target.enabledById)
    )
      fail();
    const dates = [
      source,
      ...snapshot.integration_credential.filter(
        (row) => row.key === source.key,
      ),
    ].map((row) => row.createdAt);
    if (
      dates.some(
        (date) => !(date instanceof Date) || !Number.isFinite(date.getTime()),
      )
    )
      fail();
    const earliest = new Date(
      Math.min(...dates.map((date) => (date as Date).getTime())),
    );
    if (!isDeepStrictEqual(earliest, target.createdAt)) fail();
  }
  const credentialKeys = new Set<unknown>();
  for (const source of snapshot.integration_credential) {
    shape(source, [
      "_id",
      "key",
      "values",
      "version",
      "createdAt",
      "updatedAt",
      "updatedById",
      "readTs",
      "writeTs",
    ]);
    if (typeof source.key !== "string" || credentialKeys.has(source.key))
      fail();
    credentialKeys.add(source.key);
    const target = unique(
      snapshot.integration.filter((row) => row.key === source.key),
    );
    fields(source, target, ["_id", "createdAt", "readTs", "writeTs"]);
    if (
      !(source.createdAt instanceof Date) ||
      !(target.createdAt instanceof Date) ||
      target.createdAt > source.createdAt
    )
      fail();
  }
  const formYears = new Set<string>();
  for (const source of snapshot.profiling_form) {
    const year = unique(
      snapshot.academic_year.filter((row) =>
        sameId(row._id, source.academicYearId),
      ),
    );
    if (formYears.has(String(source.academicYearId))) fail();
    formYears.add(String(source.academicYearId));
    const target = year.profilingForm;
    if (!target || typeof target !== "object" || Array.isArray(target)) fail();
    if (!sameId((target as Row).legacyId, source._id)) fail();
    fields(source, target as Row, [
      "_id",
      "academicYearId",
      "readTs",
      "writeTs",
    ]);
  }
  if (snapshot.editing_presence.length)
    throw new Error("NONEMPTY_EDITING_PRESENCE_REQUIRES_REVIEW");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    if (value instanceof Date || "_bsontype" in value) return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function assertLegacySnapshot(
  expected: LegacySnapshot,
  actual: LegacySnapshot,
): void {
  for (const name of LEGACY_COLLECTIONS) {
    const sort = (rows: Row[]) =>
      [...rows]
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))
        .map(canonical);
    if (!isDeepStrictEqual(sort(expected[name]), sort(actual[name])))
      throw new Error("LEGACY_SNAPSHOT_CHANGED");
  }
}

async function snapshot(db: Db): Promise<LegacySnapshot> {
  const result = {} as LegacySnapshot;
  for (const name of LEGACY_COLLECTIONS)
    result[name] = await db.collection<Document>(name).find({}).toArray();
  return result;
}

export async function retireLegacy(args: readonly string[]): Promise<void> {
  const options = parseRetirementArgs(args);
  const { env } = await import("../lib/platform/env.js");
  const client = new MongoClient(env.DATABASE_URL, {
    appName: "erpsys-offline-legacy-retirement",
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const db = client.db();
    if (options.apply && db.databaseName !== options.database)
      throw new Error("DATABASE_MISMATCH");
    const before = await snapshot(db);
    reconcileLegacy(before);
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (row) => row.name,
      ),
    );
    const sources = LEGACY_SOURCES.filter((name) => existing.has(name));
    console.log(
      JSON.stringify({
        mode: options.apply ? "apply" : "dry-run",
        collections: sources.length,
        auditEvents: before.admin_action_log.length,
        settings: before.integration_setting.length,
        credentials: before.integration_credential.length,
        forms: before.profiling_form.length,
      }),
    );
    if (!options.apply) return;
    for (const name of sources) {
      const current = await snapshot(db);
      assertLegacySnapshot(before, current);
      reconcileLegacy(current);
      await db.collection(name).drop();
      before[name] = [];
      assertLegacySnapshot(before, await snapshot(db));
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
  retireLegacy(process.argv.slice(2)).catch((error: unknown) => {
    const known = [
      "INVALID_ARGUMENTS",
      "RETIREMENT_REQUIRES_OFFLINE_BACKUP_RESTORE_AND_DATABASE_ACKNOWLEDGEMENTS",
      "ACKNOWLEDGEMENTS_REQUIRE_APPLY",
      "DATABASE_MISMATCH",
      "LEGACY_RECONCILIATION_REQUIRED",
      "NONEMPTY_EDITING_PRESENCE_REQUIRES_REVIEW",
      "LEGACY_SNAPSHOT_CHANGED",
    ];
    console.error(
      error instanceof Error && known.includes(error.message)
        ? error.message
        : "LEGACY_RETIREMENT_FAILED",
    );
    process.exitCode = 1;
  });
}
