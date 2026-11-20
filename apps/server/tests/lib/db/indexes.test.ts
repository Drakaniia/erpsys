import { isDeepStrictEqual } from "node:util";
import type { IndexDescription, IndexDescriptionInfo } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  definitions: [] as Array<{ collection: string; indexes: IndexDescription[] }>,
  existing: {} as Record<string, IndexDescriptionInfo[]>,
  missing: new Set<string>(),
  listError: undefined as Error | undefined,
  fail: "",
}));

vi.mock("../../../src/lib/db/db.js", () => ({
  COLLECTIONS: {
    academicYear: "academic_year",
    user: "user",
    studentEnrollment: "student_enrollment",
    enrollmentQueue: "enrollment_queue",
    department: "department",
    adviserSchedule: "adviser_schedule",
    content: "content",
    calendarConnection: "calendar_connection",
    stepVerification: "step_verification",
    upload: "upload",
    notification: "notification",
    auditLog: "audit_log",
    chatUsage: "chat_usage",
    storageUsage: "storage_usage",
    adminStepUp: "admin_step_up",
    session: "session",
    account: "account",
    verification: "verification",
    integrationSetting: "integration",
  },
  getDb: async () => ({
    collection: (collection: string) => ({
      listIndexes: () => ({
        toArray: async () => {
          if (state.listError) throw state.listError;
          if (state.missing.has(collection)) {
            throw Object.assign(new Error("namespace not found"), { code: 26 });
          }
          return state.existing[collection] ?? [];
        },
      }),
      createIndexes: async (indexes: IndexDescription[]) => {
        state.definitions.push({ collection, indexes });
        if (collection === state.fail) throw new Error("index conflict");
        for (const index of indexes) {
          const existing = state.existing[collection]?.find((candidate) =>
            isDeepStrictEqual(
              Object.entries(candidate.key),
              Object.entries(index.key),
            ),
          );
          if (existing && existing.name !== index.name) {
            throw Object.assign(
              new Error("Index already exists with a different name"),
              { code: 85 },
            );
          }
        }
      },
    }),
  }),
}));

import { ensureIndexes } from "../../../src/lib/db/indexes.js";

beforeEach(() => {
  state.definitions = [];
  state.existing = {};
  state.missing = new Set();
  state.listError = undefined;
  state.fail = "";
});

describe("consolidated collection indexes", () => {
  it("keeps uniqueness scoped to presence, profiles and physical owners", async () => {
    await ensureIndexes();
    const schedule = state.definitions.find(
      (row) => row.collection === "adviser_schedule",
    )!;
    expect(schedule.indexes.find((row) => row.unique)).toMatchObject({
      key: { adviserId: 1, departmentId: 1, academicYearId: 1 },
      partialFilterExpression: { kind: "presence" },
    });
    const user = state.definitions.find((row) => row.collection === "user")!;
    expect(
      user.indexes.filter((row) => row.unique).map((row) => row.key),
    ).toEqual([
      { "studentProfile.studentNumber": 1 },
      { "studentProfile._id": 1 },
    ]);
    expect(state.definitions.map((row) => row.collection)).not.toEqual(
      expect.arrayContaining([
        "student_profile",
        "adviser_department",
        "availability_window",
        "adviser_availability",
        "step",
      ]),
    );
  });

  it("reuses equivalent legacy names without dropping indexes or skipping the remaining batch", async () => {
    state.existing = {
      user: [{ v: 2, name: "user_email_key", key: { email: 1 }, unique: true }],
      enrollment_queue: [
        {
          name: "enrollment_queue_studentProfileId_academicYearId_key",
          key: { studentProfileId: 1, academicYearId: 1 },
          unique: true,
        },
      ],
      session: [
        { name: "session_token_key", key: { token: 1 }, unique: true },
        {
          name: "session_userId_idx",
          key: { userId: 1 },
          unique: false,
          sparse: false,
          hidden: false,
        },
      ],
      account: [{ name: "account_userId_idx", key: { userId: 1 } }],
      verification: [
        { name: "verification_identifier_idx", key: { identifier: 1 } },
      ],
    };

    await ensureIndexes();

    const definitions = (collection: string) =>
      state.definitions
        .filter((row) => row.collection === collection)
        .flatMap((row) => row.indexes);
    expect(definitions("user")).toContainEqual({
      name: "user_email_key",
      key: { email: 1 },
      unique: true,
    });
    expect(definitions("enrollment_queue")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "enrollment_queue_studentProfileId_academicYearId_key",
        }),
        expect.objectContaining({
          name: "uq_enrollment_queue_department_serving",
        }),
      ]),
    );
    expect(definitions("session").map((index) => index.name)).toEqual([
      "session_token_key",
      "session_userId_idx",
      "idx_session_expires_at",
    ]);
    expect(definitions("account").map((index) => index.name)).toEqual([
      "account_userId_idx",
      "idx_account_provider_account",
    ]);
    expect(definitions("verification")[0].name).toBe(
      "verification_identifier_idx",
    );
  });

  it.each([
    { name: "non_unique_email", key: { email: 1 } },
    { name: "sparse_email", key: { email: 1 }, unique: true, sparse: true },
    {
      name: "partial_email",
      key: { email: 1 },
      unique: true,
      partialFilterExpression: { email: { $exists: true } },
    },
    {
      name: "collated_email",
      key: { email: 1 },
      unique: true,
      collation: { locale: "en", strength: 2 },
    },
    { name: "hidden_email", key: { email: 1 }, unique: true, hidden: true },
    {
      name: "expiring_email",
      key: { email: 1 },
      unique: true,
      expireAfterSeconds: 60,
    },
  ])("does not reuse incompatible options from $name", async (existing) => {
    state.existing.user = [existing];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(ensureIndexes()).rejects.toThrow(
        "Index already exists with a different name",
      );
    } finally {
      log.mockRestore();
    }
  });

  it("does not equate compound indexes with reversed key order", async () => {
    state.existing.account = [
      { name: "reversed_account", key: { accountId: 1, providerId: 1 } },
    ];
    await ensureIndexes();
    expect(
      state.definitions.find((row) => row.collection === "account")!.indexes[1]
        .name,
    ).toBe("idx_account_provider_account");
  });

  it("creates indexes for collections that do not exist yet", async () => {
    state.missing.add("user");
    await ensureIndexes();
    expect(
      state.definitions.filter((row) => row.collection === "user"),
    ).toHaveLength(2);
  });

  it("does not hide failures to read required indexes", async () => {
    state.listError = new Error("not authorized to list indexes");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(ensureIndexes()).rejects.toThrow(
        "not authorized to list indexes",
      );
    } finally {
      log.mockRestore();
    }
  });

  it("refuses startup if required profile indexes cannot be installed", async () => {
    state.fail = "user";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(ensureIndexes()).rejects.toThrow("index conflict");
    } finally {
      log.mockRestore();
    }
  });
});
