import {
  type Db,
  type MongoClientOptions,
  MongoClient,
  ObjectId,
} from "mongodb";
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
  profilingForm: "profiling_form",
  socialMediaLink: "social_media_link",
  notification: "notification",
  department: "department",
  adviserDepartment: "adviser_department",
  enrollmentQueue: "enrollment_queue",
  adviserAvailability: "adviser_availability",
  availabilityWindow: "availability_window",
  calendarConnection: "calendar_connection",
  departmentTransferRequest: "department_transfer_request",
  adminActionLog: "admin_action_log",
  auditLog: "audit_log",
  chatbotKnowledge: "chatbot_knowledge",
  chatUsage: "chat_usage",
  storageUsage: "storage_usage",
  integrationSetting: "integration_setting",
  integrationCredential: "integration_credential",
  adminStepUp: "admin_step_up",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export function idForms(id: string): (string | ObjectId)[] {
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

export function mongoClientOptions(): MongoClientOptions {
  return {
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    waitQueueTimeoutMS: env.MONGO_WAIT_QUEUE_TIMEOUT_MS,
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
    socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
    maxIdleTimeMS: env.MONGO_MAX_IDLE_TIME_MS,
    appName: env.MONGO_APP_NAME,
  };
}

type ClientFactory = (url: string, options: MongoClientOptions) => MongoClient;

const realClientFactory: ClientFactory = (url, options) =>
  new MongoClient(url, options);

let clientFactory: ClientFactory = realClientFactory;

function ensureHandle(): Db {
  if (db) return db;
  client = clientFactory(env.DATABASE_URL, mongoClientOptions());
  db = guardDb(client.db());
  return db;
}

export function getDbSync(): Db {
  return ensureHandle();
}

export async function getDb(): Promise<Db> {
  const handle = ensureHandle();
  if (client) await client.connect();
  return handle;
}

export async function closeDb(): Promise<void> {
  const open = client;
  client = null;
  db = null;
  if (!open) return;
  try {
    await open.close();
  } catch {}
}

export type PoolStats = {
  checkedOut: number;
  available: number;
  size: number;
  maxPoolSize: number;
};

export function poolStats(): PoolStats {
  const maxPoolSize = env.MONGO_MAX_POOL_SIZE;
  const empty: PoolStats = {
    checkedOut: 0,
    available: 0,
    size: 0,
    maxPoolSize,
  };
  if (!client) return empty;

  try {
    const topology = (client as unknown as { topology?: unknown }).topology;
    if (!topology || typeof topology !== "object") return empty;

    const servers = (topology as { s?: { servers?: Map<string, unknown> } }).s
      ?.servers;
    if (!servers || typeof servers.forEach !== "function") return empty;

    let checkedOut = 0;
    let available = 0;
    let size = 0;

    servers.forEach((server) => {
      const pool = (server as { pool?: unknown }).pool;
      if (!pool || typeof pool !== "object") return;

      const checkOut = (pool as { checkOut?: { size?: () => number } })
        .checkOut;
      if (checkOut && typeof checkOut.size === "function") {
        size += checkOut.size();
      }

      const free = (pool as { available?: number }).available;
      if (typeof free === "number") available += free;
    });

    checkedOut = Math.max(0, size - available);
    return { checkedOut, available, size, maxPoolSize };
  } catch {
    return empty;
  }
}

export function setClientFactoryForTest(factory: ClientFactory | null): void {
  clientFactory = factory ?? realClientFactory;
  client = null;
  db = null;
}
