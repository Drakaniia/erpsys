import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { COLLECTIONS } from "../lib/db/db.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../../../../.env") });
dotenv.config();

const SOURCE_FIELDS = ["at", "joinedAt", "createdAt", "openedAt", "updatedAt", "servedAt", "completedAt", "closedAt"];
const STAMP_FREE = new Set(["user", "session", "account", "verification"]);

const TARGETS = Object.values(COLLECTIONS).filter((name) => !STAMP_FREE.has(name));

function earliest(row: Record<string, unknown>): Date | null {
  const times = SOURCE_FIELDS.map((field) => row[field])
    .filter((value) => value instanceof Date)
    .map((value) => (value as Date).getTime());
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

function latest(row: Record<string, unknown>, fallback: Date): Date {
  const times = SOURCE_FIELDS.map((field) => row[field])
    .filter((value) => value instanceof Date)
    .map((value) => (value as Date).getTime());
  return times.length > 0 ? new Date(Math.max(...times)) : fallback;
}

async function main(): Promise<void> {
  const url = (process.env.DATABASE_URL ?? "").trim();
  if (!url) throw new Error("DATABASE_URL is not set.");
  const client = new MongoClient(url, { appName: "erpsys-backfill" });
  try {
    await client.connect();
    const db = client.db();
    let touched = 0;
    for (const name of TARGETS) {
      const collection = db.collection(name);
      const missing = await collection
        .find({
          $or: [{ createdAt: { $exists: false } }, { updatedAt: { $exists: false } }],
        })
        .toArray();
      let count = 0;
      for (const row of missing) {
        const created = row.createdAt instanceof Date ? row.createdAt : earliest(row);
        const anchor = created ?? new Date();
        const updated = row.updatedAt instanceof Date ? row.updatedAt : latest(row, anchor);
        await collection.updateOne({ _id: row._id }, { $set: { createdAt: anchor, updatedAt: updated } });
        count += 1;
      }
      if (count > 0) console.log(`${name}: ${count}`);
      touched += count;
    }
    console.log(`backfilled ${touched} document(s)`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
