import { AsyncLocalStorage } from "node:async_hooks";
import { type Db, MongoClient, ObjectId } from "mongodb";
import { env } from "../platform/env.js";
import { guardDb } from "./timestamp-ordering.js";

export const COLLECTIONS = {

  user: "user",
  session: "session",
  account: "account",
  verification: "verification",
  academicYear: "academic_year",
  studentProfile: "student_profile",
  studentEnrollment: "student_enrollment",
  step: "step",
  stepVerification: "step_verification",
  upload: "upload",
  requirementItem: "requirement_item",

  socialMediaLink: "social_media_link",
  notification: "notification",
  department: "department",
  adviserDepartment: "adviser_department",
  enrollmentQueue: "enrollment_queue",
  adviserAvailability: "adviser_availability",
  availabilityWindow: "availability_window",
  calendarConnection: "calendar_connection",
  departmentTransferRequest: "department_transfer_request",
  adminActionLog: "audit_log",
  auditLog: "audit_log",
  chatbotKnowledge: "chatbot_knowledge",
  chatUsage: "chat_usage",
  storageUsage: "storage_usage",
  integrationSetting: "integration",
  adminStepUp: "admin_step_up",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

function idForms(id: string): (string | ObjectId)[] {
  return ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];
}

export function idIn(ids: string[]): { _id: { $in: (string | ObjectId)[] } } {
  return { _id: refIn(ids) };
}

export function refIn(ids: string[]): { $in: (string | ObjectId)[] } {
  return { $in: ids.flatMap(idForms) };
}

let client: MongoClient | null = null;
let db: Db | null = null;
const requestDb = new AsyncLocalStorage<{ client: MongoClient; db: Db }>();
const scopedDb = new Proxy({} as Db, {
  get(_target, key) {
    if (key === "collection") return (name: string) => new Proxy({}, {
      get(_collection, property) {
        const current = requestDb.getStore()?.db;
        if (!current) throw new Error("Database operation outside Worker request");
        const collection = current.collection(name);
        const value = Reflect.get(collection, property, collection);
        return typeof value === "function" ? value.bind(collection) : value;
      },
    });
    const current = requestDb.getStore()?.db;
    if (!current) throw new Error("Database operation outside Worker request");
    const value = Reflect.get(current, key, current);
    return typeof value === "function" ? value.bind(current) : value;
  },
});

export function withRequestDb<T>(run: () => T): T {
  const client = new MongoClient(env.DATABASE_URL, { appName: "erpsys-worker", maxPoolSize: 2, minPoolSize: 0, serverSelectionTimeoutMS: 10_000 });
  return requestDb.run({ client, db: guardDb(client.db()) }, run);
}

export function getDbSync(): Db {
  if (process.env.CLOUDFLARE_WORKER === "1") return scopedDb;
  if (db) return db;
  client = new MongoClient(env.DATABASE_URL, { appName: "erpsys", maxPoolSize: 25, minPoolSize: 0, maxIdleTimeMS: 60_000, serverSelectionTimeoutMS: 10_000 });
  db = guardDb(client.db());
  return db;
}

export async function getDb(): Promise<Db> {
  const handle = getDbSync();
  await (requestDb.getStore()?.client ?? client)!.connect();
  return handle;
}

export async function closeDb(): Promise<void> {
  const scoped = requestDb.getStore();
  if (scoped) {
    await scoped.client.close();
    return;
  }
  const open = client;
  client = null;
  db = null;
  await open?.close().catch(() => {});
}
