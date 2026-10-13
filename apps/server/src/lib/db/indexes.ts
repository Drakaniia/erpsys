import type { Db, Document, IndexDescription } from "mongodb";
import { COLLECTIONS, getDb, type CollectionName } from "./db.js";
import { auditQueueInvariants, type QueueAuditReport } from "./queue-audit.js";

type IndexSpec = {
  key: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Document;
  expireAfterSeconds?: number;
};

type IndexPlan = {
  collection: CollectionName;
  indexes: IndexSpec[];
};

export const INDEX_PLANS: readonly IndexPlan[] = [
  {
    collection: COLLECTIONS.enrollmentQueue,
    indexes: [
      {
        key: { studentProfileId: 1, academicYearId: 1 },
        name: "uq_enrollment_queue_student_year",
        unique: true,
      },
      {
        key: { departmentId: 1, academicYearId: 1 },
        name: "uq_enrollment_queue_department_serving",
        unique: true,
        partialFilterExpression: { status: "IN_PROGRESS" },
      },
      {
        key: { academicYearId: 1, status: 1, joinedAt: 1 },
        name: "idx_enrollment_queue_year_status_joined",
      },
      {
        key: { departmentId: 1, academicYearId: 1, status: 1, joinedAt: 1 },
        name: "idx_enrollment_queue_department_year_status_joined",
      },
      {
        key: { servedById: 1, status: 1 },
        name: "idx_enrollment_queue_served_by_status",
      },
    ],
  },
  {
    collection: COLLECTIONS.studentProfile,
    indexes: [
      {
        key: { studentNumber: 1 },
        name: "uq_student_profile_student_number",
        unique: true,
      },
      { key: { userId: 1 }, name: "idx_student_profile_user" },
      { key: { academicYearId: 1 }, name: "idx_student_profile_year" },
    ],
  },
  {
    collection: COLLECTIONS.adviserAvailability,
    indexes: [
      {
        key: { academicYearId: 1, isOpen: 1 },
        name: "idx_adviser_availability_year_open",
      },
      {
        key: { adviserId: 1, isOpen: 1 },
        name: "idx_adviser_availability_adviser_open",
      },
      {
        key: { isOpen: 1, lastActiveAt: 1 },
        name: "idx_adviser_availability_open_last_active",
      },
    ],
  },
  {
    collection: COLLECTIONS.availabilityWindow,
    indexes: [
      {
        key: { departmentId: 1, academicYearId: 1 },
        name: "idx_availability_window_department_year",
      },
      {
        key: { adviserId: 1, departmentId: 1, academicYearId: 1 },
        name: "idx_availability_window_adviser_department_year",
      },
    ],
  },
  {
    collection: COLLECTIONS.calendarConnection,
    indexes: [
      { key: { userId: 1 }, name: "uq_calendar_connection_user", unique: true },
      {
        key: { syncState: 1, nextAttemptAt: 1 },
        name: "idx_calendar_connection_sync_due",
      },
    ],
  },
  {
    collection: COLLECTIONS.notification,
    indexes: [
      {
        key: { userId: 1, createdAt: -1 },
        name: "idx_notification_user_created",
      },
    ],
  },
  {
    collection: COLLECTIONS.stepVerification,
    indexes: [
      {
        key: { studentProfileId: 1, academicYearId: 1 },
        name: "idx_step_verification_student_year",
      },
    ],
  },
  {
    collection: COLLECTIONS.user,
    indexes: [{ key: { email: 1 }, name: "uq_user_email", unique: true }],
  },
  {
    collection: COLLECTIONS.session,
    indexes: [
      { key: { token: 1 }, name: "uq_session_token", unique: true },
      { key: { userId: 1 }, name: "idx_session_user" },
      { key: { expiresAt: 1 }, name: "idx_session_expires_at" },
    ],
  },
  {
    collection: COLLECTIONS.account,
    indexes: [
      { key: { userId: 1 }, name: "idx_account_user" },
      {
        key: { providerId: 1, accountId: 1 },
        name: "idx_account_provider_account",
      },
    ],
  },
  {
    collection: COLLECTIONS.verification,
    indexes: [{ key: { identifier: 1 }, name: "idx_verification_identifier" }],
  },
  {
    collection: COLLECTIONS.chatUsage,
    indexes: [
      {
        key: { expiresAt: 1 },
        name: "ttl_chat_usage_expires_at",
        expireAfterSeconds: 0,
      },
    ],
  },
  {
    collection: COLLECTIONS.upload,
    indexes: [
      {
        key: { idempotencyKey: 1 },
        name: "uq_upload_idempotency_key",
        unique: true,
        partialFilterExpression: { idempotencyKey: { $exists: true } },
      },
      {
        key: { r2Status: 1, sessionExpiresAt: 1 },
        name: "idx_upload_r2_status_expires",
        partialFilterExpression: { r2Status: { $exists: true } },
      },
    ],
  },
  {
    collection: COLLECTIONS.auditLog,
    indexes: [{ key: { at: -1 }, name: "idx_audit_log_at" }],
  },
  {
    collection: COLLECTIONS.integrationSetting,
    indexes: [
      { key: { key: 1 }, name: "uq_integration_setting_key", unique: true },
    ],
  },
  {
    collection: COLLECTIONS.integrationCredential,
    indexes: [
      {
        key: { key: 1 },
        name: "uq_integration_credential_key",
        unique: true,
      },
    ],
  },
  {
    collection: COLLECTIONS.adminStepUp,
    indexes: [
      {
        key: { expiresAt: 1 },
        name: "ttl_admin_step_up_expires_at",
        expireAfterSeconds: 0,
      },
    ],
  },
  {
    collection: COLLECTIONS.storageUsage,
    indexes: [
      {
        key: { month: 1 },
        name: "uq_storage_usage_month",
        unique: true,
      },
    ],
  },
] as const;

export class QueueInvariantError extends Error {
  readonly report: QueueAuditReport;

  constructor(report: QueueAuditReport) {
    super(
      [
        `[indexes] refusing to create the unique indexes: auditQueueInvariants() found ${report.blockingCount} blocking violation(s).`,
        ...Object.entries(report.blockingByCategory).map(
          ([category, count]) => `  - ${category}: ${count}`,
        ),
        "The unique indexes reject writes that previously succeeded, so they cannot be built over this data.",
        "Repair it, then boot again:",
        "  pnpm --filter @erpsys/server exec tsx src/lib/queue-repair.ts           # preview (dry run)",
        "  pnpm --filter @erpsys/server exec tsx src/lib/queue-repair.ts --apply    # apply",
        "See `report` on this error, or call auditQueueInvariants(db) directly for the full detail.",
      ].join("\n"),
    );
    this.name = "QueueInvariantError";
    this.report = report;
  }
}

function keySignature(key: unknown): string {
  if (!key || typeof key !== "object") return JSON.stringify(key);
  return JSON.stringify(
    Object.entries(key as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
}

function optionsSignature(spec: IndexSpec): string {
  return JSON.stringify({
    unique: spec.unique === true,
    partial: spec.partialFilterExpression ?? null,
    ttl: spec.expireAfterSeconds ?? null,
  });
}

function toIndexDescription(spec: IndexSpec): IndexDescription {
  const description: IndexDescription = { key: spec.key, name: spec.name };
  if (spec.unique) description.unique = true;
  if (spec.partialFilterExpression)
    description.partialFilterExpression = spec.partialFilterExpression;
  if (spec.expireAfterSeconds !== undefined)
    description.expireAfterSeconds = spec.expireAfterSeconds;
  return description;
}

type EnsureIndexesOptions = {
  logger?: (message: string) => void;
};

function defaultLog(message: string): void {
  console.log(message);
}

export async function ensureIndexes(
  db?: Db,
  options: EnsureIndexesOptions = {},
): Promise<void> {
  const log = options.logger ?? defaultLog;
  const database = db ?? (await getDb());

  const report = await auditQueueInvariants(database);
  if (!report.clean) throw new QueueInvariantError(report);
  log("[indexes] preflight audit clean — creating indexes");

  for (const plan of INDEX_PLANS) {
    const collection = database.collection(plan.collection);
    let existing: Array<{
      name?: string;
      key?: Document;
      unique?: boolean;
      partialFilterExpression?: Document;
      expireAfterSeconds?: number;
    }>;
    try {
      existing = (await collection.listIndexes().toArray()) as Array<{
        name?: string;
        key?: Document;
        unique?: boolean;
        partialFilterExpression?: Document;
        expireAfterSeconds?: number;
      }>;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === 26
      ) {
        existing = [];
      } else {
        throw error;
      }
    }
    const byName = new Map(existing.map((i) => [String(i.name), i]));
    const byKey = new Map(
      existing.map((i) => [keySignature(i.key), i] as const),
    );

    const pending: IndexSpec[] = [];
    for (const spec of plan.indexes) {
      const sameName = byName.get(spec.name);
      if (sameName) {
        if (keySignature(sameName.key) !== keySignature(spec.key)) {
          log(
            `[indexes] ${plan.collection}.${spec.name} already exists with a different key — leaving it alone. Drop it by hand if it is wrong.`,
          );
        }
        continue;
      }
      const sameKey = byKey.get(keySignature(spec.key));
      if (sameKey) {
        if (
          optionsSignature(spec) !==
          optionsSignature({
            key: sameKey.key as Record<string, 1 | -1>,
            name: String(sameKey.name),
            unique: sameKey.unique === true,
            partialFilterExpression: sameKey.partialFilterExpression,
            expireAfterSeconds: sameKey.expireAfterSeconds,
          })
        ) {
          log(
            `[indexes] ${plan.collection} already has an index named "${String(sameKey.name)}" on the same keys with different options — leaving it alone. Drop it by hand if it is wrong.`,
          );
        }
        continue;
      }
      pending.push(spec);
    }

    if (pending.length === 0) {
      log(`[indexes] ${plan.collection}: up to date (${plan.indexes.length})`);
      continue;
    }
    await collection.createIndexes(pending.map(toIndexDescription));
    log(
      `[indexes] ${plan.collection}: created ${pending.length} of ${plan.indexes.length} (${pending.map((s) => s.name).join(", ")})`,
    );
  }
}
