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

export function getDbSync(): Db {
  if (db) return db;
  client = new MongoClient(env.DATABASE_URL, {
    appName: "erpsys",
    maxPoolSize: 25,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 10_000,
  });
  db = guardDb(client.db());
  return db;
}

export async function getDb(): Promise<Db> {
  const handle = getDbSync();
  await client!.connect();
  return handle;
}

export async function closeDb(): Promise<void> {
  const open = client;
  client = null;
  db = null;
  await open?.close().catch(() => {});
}
