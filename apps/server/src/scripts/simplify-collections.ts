import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Db } from "mongodb";
import dotenv from "dotenv";

export async function simplifyCollections(db: Db, apply = false) {
  const [actions, settings, credentials, forms] = await Promise.all([
    db.collection("admin_action_log").find({}).toArray(),
    db.collection("integration_setting").find({}).toArray(),
    db.collection("integration_credential").find({}).toArray(),
    db.collection("profiling_form").find({}).toArray(),
  ]);
  for (const [rows, field] of [[settings, "key"], [credentials, "key"], [forms, "academicYearId"]] as const) {
    const keys = rows.map((row) => String(row[field]));
    if (new Set(keys).size !== keys.length) throw new Error(`Duplicate ${field}; resolve before migration.`);
  }
  for (const form of forms) {
    if (!await db.collection("academic_year").findOne({ _id: form.academicYearId })) {
      throw new Error(`Profiling form ${String(form._id)} has no academic year; migration stopped.`);
    }
  }
  for (const row of actions) {
    if (!(row.createdAt ?? row.at ?? row.updatedAt)) throw new Error(`Action ${String(row._id)} has no timestamp; migration stopped.`);
  }
  const keys = new Set([...settings, ...credentials].map((row) => String(row.key)));
  const summary = { actions: actions.length, integrations: keys.size, forms: forms.length, applied: apply };
  if (!apply) return summary;
  await db.collection("integration").createIndex({ key: 1 }, { unique: true, name: "uq_integration_key" });
  for (const row of actions) {
    const createdAt = row.createdAt ?? row.at ?? row.updatedAt;

    const { _id, ...fields } = row;
    await db.collection("audit_log").updateOne(
      { _id: `legacy-admin-action:${String(_id)}` as never },
      { $setOnInsert: { _id: `legacy-admin-action:${String(_id)}` as never, ...fields, legacyId: _id, kind: "action", createdAt, updatedAt: row.updatedAt ?? createdAt } },
      { upsert: true },
    );
  }
  for (const key of keys) {
    const setting = settings.find((row) => row.key === key);
    const credential = credentials.find((row) => row.key === key);
    await db.collection("integration").updateOne(
      { key },
      { $setOnInsert: {
        _id: `integration:${key}` as never,
        key,
        values: credential?.values ?? {},
        version: credential?.version ?? 0,
        createdAt: credential?.createdAt ?? setting?.createdAt,
        updatedAt: credential?.updatedAt ?? setting?.updatedAt,
        ...(credential?.updatedById ? { updatedById: credential.updatedById } : {}),
        ...(setting ? { enabled: setting.enabled, enabledAt: setting.updatedAt, enabledById: setting.updatedById } : {}),
      } },
      { upsert: true },
    );
  }
  for (const row of forms) {
    const { _id, academicYearId, ...form } = row;
    await db.collection("academic_year").updateOne(
      { _id: academicYearId, profilingForm: { $exists: false } },
      { $set: { profilingForm: { ...form, legacyId: _id } } },
    );
  }
  return summary;
}

async function main() {
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env") });
  dotenv.config();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set.");
  const client = new MongoClient(url, { appName: "erpsys-simplify-collections" });
  try {
    await client.connect();
    console.log(await simplifyCollections(client.db(), process.argv.includes("--apply")));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
