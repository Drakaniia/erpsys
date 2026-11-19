import type { IndexDescription } from "mongodb";
import { COLLECTIONS, getDb, type CollectionName } from "./db.js";

const ix = (
  name: string,
  key: Record<string, 1 | -1>,
  options: Partial<IndexDescription> = {},
): IndexDescription => ({ name, key, ...options });

const INDEXES: [CollectionName, IndexDescription[]][] = [
  [
    COLLECTIONS.enrollmentQueue,
    [
      ix(
        "uq_enrollment_queue_student_year",
        { studentProfileId: 1, academicYearId: 1 },
        { unique: true },
      ),
      ix(
        "uq_enrollment_queue_department_serving",
        { departmentId: 1, academicYearId: 1 },
        { unique: true, partialFilterExpression: { status: "IN_PROGRESS" } },
      ),
      ix("idx_enrollment_queue_year_status_joined", {
        academicYearId: 1,
        status: 1,
        joinedAt: 1,
      }),
      ix("idx_enrollment_queue_department_year_status_joined", {
        departmentId: 1,
        academicYearId: 1,
        status: 1,
        joinedAt: 1,
      }),
      ix("idx_enrollment_queue_served_by_status", { servedById: 1, status: 1 }),
    ],
  ],
  [
    COLLECTIONS.studentProfile,
    [
      ix(
        "uq_student_profile_student_number",
        { studentNumber: 1 },
        { unique: true },
      ),
      ix("idx_student_profile_user", { userId: 1 }),
      ix("idx_student_profile_year", { academicYearId: 1 }),
    ],
  ],
  [
    COLLECTIONS.adviserDepartment,
    [
      ix("idx_adviser_department_adviser_department", {
        adviserId: 1,
        departmentId: 1,
      }),
      ix("idx_adviser_department_department", { departmentId: 1 }),
    ],
  ],
  [
    COLLECTIONS.adviserAvailability,
    [
      ix("idx_adviser_availability_adviser_department_year", {
        adviserId: 1,
        departmentId: 1,
        academicYearId: 1,
      }),
      ix("idx_adviser_availability_year_open", {
        academicYearId: 1,
        isOpen: 1,
      }),
      ix("idx_adviser_availability_adviser_open", { adviserId: 1, isOpen: 1 }),
      ix("idx_adviser_availability_open_last_active", {
        isOpen: 1,
        lastActiveAt: 1,
      }),
    ],
  ],
  [
    COLLECTIONS.availabilityWindow,
    [
      ix("idx_availability_window_department_year", {
        departmentId: 1,
        academicYearId: 1,
      }),
      ix("idx_availability_window_adviser_department_year", {
        adviserId: 1,
        departmentId: 1,
        academicYearId: 1,
      }),
    ],
  ],
  [
    COLLECTIONS.calendarConnection,
    [
      ix("uq_calendar_connection_user", { userId: 1 }, { unique: true }),
      ix("idx_calendar_connection_sync_due", {
        syncState: 1,
        nextAttemptAt: 1,
      }),
    ],
  ],
  [
    COLLECTIONS.notification,
    [ix("idx_notification_user_created", { userId: 1, createdAt: -1 })],
  ],
  [
    COLLECTIONS.stepVerification,
    [
      ix("idx_step_verification_student_year", {
        studentProfileId: 1,
        academicYearId: 1,
      }),
    ],
  ],
  [COLLECTIONS.user, [ix("uq_user_email", { email: 1 }, { unique: true })]],
  [
    COLLECTIONS.session,
    [
      ix("uq_session_token", { token: 1 }, { unique: true }),
      ix("idx_session_user", { userId: 1 }),
      ix("idx_session_expires_at", { expiresAt: 1 }),
    ],
  ],
  [
    COLLECTIONS.account,
    [
      ix("idx_account_user", { userId: 1 }),
      ix("idx_account_provider_account", { providerId: 1, accountId: 1 }),
    ],
  ],
  [
    COLLECTIONS.verification,
    [ix("idx_verification_identifier", { identifier: 1 })],
  ],
  [
    COLLECTIONS.upload,
    [
      ix(
        "uq_upload_idempotency_key",
        { idempotencyKey: 1 },
        {
          unique: true,
          partialFilterExpression: { idempotencyKey: { $exists: true } },
        },
      ),
      ix(
        "idx_upload_r2_status_expires",
        { r2Status: 1, sessionExpiresAt: 1 },
        { partialFilterExpression: { r2Status: { $exists: true } } },
      ),
    ],
  ],
  [
    COLLECTIONS.auditLog,
    [
      ix("idx_audit_log_created", { createdAt: -1 }),
      ix("idx_audit_log_kind_created", { kind: 1, createdAt: -1 }),
    ],
  ],
  [
    COLLECTIONS.chatUsage,
    [
      ix(
        "ttl_chat_usage_expires_at",
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      ),
    ],
  ],
  [
    COLLECTIONS.integrationSetting,
    [ix("uq_integration_key", { key: 1 }, { unique: true })],
  ],
  [
    COLLECTIONS.adminStepUp,
    [
      ix(
        "ttl_admin_step_up_expires_at",
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      ),
    ],
  ],
  [
    COLLECTIONS.storageUsage,
    [ix("uq_storage_usage_month", { month: 1 }, { unique: true })],
  ],
];

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  for (const [name, indexes] of INDEXES) {
    try {
      await db.collection(name).createIndexes(indexes);
    } catch (error) {
      console.error(`[indexes] ${name}: ${(error as Error).message}`);
    }
  }
}
