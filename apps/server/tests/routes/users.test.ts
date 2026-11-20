import express from "express";
import { ObjectId } from "mongodb";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
  inviteAccount: vi.fn(async (_name: string, _email: string) => "invited-id"),
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
  inviteAccount: holder.inviteAccount,
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});

const ADMIN = {
  user: { id: "admin1", email: "admin@buksu.edu.ph", role: "ADMIN" },
};

function seed(): Record<string, Row[]> {
  const joined = (day: number) => new Date(2026, 0, day);
  return {
    [COLLECTIONS.user]: [
      {
        _id: "admin1",
        name: "Admin",
        email: "admin@buksu.edu.ph",
        role: "ADMIN",
        isOutsideOrg: false,
        createdAt: joined(1),
      },
      {
        _id: "stu1",
        studentProfile: {
          _id: "p-stu1",
          studentNumber: "123",
          academicYearId: "ay-1",
        },
        name: "Student One",
        email: "s1@student.buksu.edu.ph",
        role: "STUDENT",
        isOutsideOrg: false,
        createdAt: joined(2),
      },
      {
        _id: "off1",
        studentProfile: {
          _id: "p-off1",
          studentNumber: "456",
          academicYearId: "ay-1",
        },
        name: "Officer",
        email: "s2@student.buksu.edu.ph",
        role: "SBO_OFFICER",
        isOutsideOrg: false,
        createdAt: joined(3),
      },
      {
        _id: "blocked1",
        name: "Blocked",
        email: "b@test",
        role: "STUDENT",
        isOutsideOrg: true,
        blockedAt: joined(4),
        createdAt: joined(4),
      },
    ],
    [COLLECTIONS.academicYear]: [
      {
        _id: "ay-1",
        label: "2026-2027",
        semesterLabel: "First",
        isActive: true,
        createdAt: joined(1),
      },
    ],

    [COLLECTIONS.studentEnrollment]: [
      {
        _id: "e1",
        studentProfileId: "p-stu1",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
      {
        _id: "e2",
        studentProfileId: "p-off1",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "SECOND",
      },
    ],
    [COLLECTIONS.department]: [
      { _id: "dept-1", name: "College of Technologies", isActive: true },
    ],
    [COLLECTIONS.adminActionLog]: [],
    [COLLECTIONS.session]: [{ _id: "sess1", userId: "stu1" }],
    [COLLECTIONS.adminStepUp]: [
      { _id: "admin1", unlockedUntil: new Date(Date.now() + 60_000) },
    ],
    [COLLECTIONS.account]: [],
    [COLLECTIONS.notification]: [],
    [COLLECTIONS.chatbotKnowledge]: [],
    [COLLECTIONS.verification]: [],
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.upload]: [],
    [COLLECTIONS.enrollmentQueue]: [],
    [COLLECTIONS.adviserSchedule]: [],
  };
}

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", v1Router);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const call = (path: string, init?: RequestInit) =>
  fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

let context: ReturnType<typeof fakeDb>;
let server: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  holder.session = ADMIN;
  holder.inviteAccount.mockClear();
  context = fakeDb(seed());
  let pending = Promise.resolve();
  holder.db = {
    ...context.db,
    client: {
      startSession: () => ({
        withTransaction: <T>(work: () => Promise<T>) => {
          const result = pending.then(work);
          pending = result.then(
            () => {},
            () => {},
          );
          return result;
        },
        endSession: async () => {},
      }),
    },
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

describe("GET /api/v1/users", () => {
  it("hydrates student number and placement", async () => {
    const body = await (await call("/users?role=STUDENT")).json();
    // stu1 plus the blocked student — the directory lists blocked accounts.
    expect(body.total).toBe(2);
    expect(body.data.find((u: Row) => u.id === "stu1")).toMatchObject({
      id: "stu1",
      studentNumber: "123",
      yearLevel: "FIRST",
      department: { name: "College of Technologies", code: "CT" },
    });
  });

  it("filters historical BSON user IDs by student number and placement", async () => {
    const student = context.store[COLLECTIONS.user][1];
    student._id = new ObjectId();
    for (const path of ["/users?q=123", "/users?yearLevel=FIRST"]) {
      const response = await call(path);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.map((row: Row) => row.id)).toEqual([
        String(student._id),
      ]);
    }
  });

  it("filters by year level", async () => {
    const body = await (await call("/users?yearLevel=SECOND")).json();
    expect(body.data.map((u: Row) => u.id)).toEqual(["off1"]);
  });
});

describe("admin account management", () => {
  const post = (path: string, body: object = {}) =>
    call(path, { method: "POST", body: JSON.stringify(body) });

  it("validates and normalizes invitation input without sending mail", async () => {
    expect(
      (await post("/users/invite", { name: " ", email: "invalid" })).status,
    ).toBe(400);
    expect(
      (
        await post("/users/invite", {
          name: " Example ",
          email: " Example@Example.com ",
        })
      ).status,
    ).toBe(201);
    expect(holder.inviteAccount).toHaveBeenCalledExactlyOnceWith(
      "Example",
      "example@example.com",
    );
    expect(context.store[COLLECTIONS.adminActionLog]).toHaveLength(1);
  });

  it("denies invite and promotion to non-admins", async () => {
    holder.session = { user: { ...ADMIN.user, role: "STUDENT" } };
    expect(
      (
        await post("/users/invite", {
          name: "Example",
          email: "example@example.com",
        })
      ).status,
    ).toBe(403);
    expect((await post("/users/stu1/promote-admin")).status).toBe(403);
    expect(holder.inviteAccount).not.toHaveBeenCalled();
  });

  it("requires step-up and verified email, then promotes and signs out the account", async () => {
    const lock = context.store[COLLECTIONS.adminStepUp][0];
    lock.unlockedUntil = new Date(0);
    expect((await post("/users/stu1/promote-admin")).status).toBe(403);
    lock.unlockedUntil = new Date(Date.now() + 60_000);
    expect((await post("/users/stu1/promote-admin")).status).toBe(409);
    const student = context.store[COLLECTIONS.user][1];
    student.emailVerified = true;
    student.blockedAt = new Date();
    expect((await post("/users/stu1/promote-admin")).status).toBe(409);
    student.blockedAt = null;
    const promoted = await post("/users/stu1/promote-admin");
    expect(promoted.status).toBe(200);
    expect((await promoted.json()).data).toEqual({
      userId: "stu1",
      role: "ADMIN",
    });
    expect(context.store[COLLECTIONS.session]).toHaveLength(0);
    expect(context.store[COLLECTIONS.adminActionLog]).toHaveLength(1);
  });
});

describe("POST /api/v1/users/:userId/reactivate", () => {
  const reactivate = (userId = "blocked1") =>
    call(`/users/${userId}/reactivate`, { method: "POST" });

  it("restores a disabled account to the directory without changing its role, credentials or linked records", async () => {
    const officer = context.store[COLLECTIONS.user][2];
    officer.emailVerified = true;
    officer.twoFactorEnabled = true;
    context.store[COLLECTIONS.account].push(
      {
        _id: "credential",
        userId: "off1",
        providerId: "credential",
        password: "existing-hash",
      },
      {
        _id: "google",
        userId: "off1",
        providerId: "google",
        accountId: "google-id",
        refreshToken: "existing-token",
      },
    );
    context.store[COLLECTIONS.stepVerification].push({
      _id: "verified",
      studentProfileId: "p-off1",
      verifiedById: "admin1",
    });
    context.store[COLLECTIONS.upload].push({
      _id: "uploaded",
      studentProfileId: "p-off1",
      key: "existing-file",
    });
    context.store[COLLECTIONS.notification].push({
      _id: "notice",
      userId: "off1",
      message: "Existing notice",
    });
    const disabled = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: ["off1"] }),
    });
    expect(disabled.status).toBe(200);
    expect((await disabled.json()).data.blocked).toEqual(["off1"]);
    const before = await (await call("/users?role=SBO_OFFICER")).json();
    expect(before.data[0]).toMatchObject({ id: "off1", blocked: true });

    const preservedUser = { ...officer, blockedAt: null };
    const linked = [
      COLLECTIONS.account,
      COLLECTIONS.studentEnrollment,
      COLLECTIONS.stepVerification,
      COLLECTIONS.upload,
      COLLECTIONS.notification,
    ];
    const preservedRecords = structuredClone(
      linked.map((name) => context.store[name]),
    );
    context.store[COLLECTIONS.session].push({
      _id: "remaining-target-session",
      userId: "off1",
    });
    const response = await reactivate("off1");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ userId: "off1" });
    expect(officer).toEqual(preservedUser);
    expect(linked.map((name) => context.store[name])).toEqual(preservedRecords);
    expect(context.store[COLLECTIONS.session]).toEqual([
      { _id: "sess1", userId: "stu1" },
    ]);
    const after = await (await call("/users?role=SBO_OFFICER")).json();
    expect(after.data[0]).toMatchObject({
      id: "off1",
      blocked: false,
      role: "SBO_OFFICER",
      emailVerified: true,
      studentNumber: "456",
      studentProfileId: "p-off1",
      yearLevel: "SECOND",
    });
    expect(
      context.store[COLLECTIONS.adminActionLog].filter(
        (row) => row.action === "Reactivated account",
      ),
    ).toEqual([
      expect.objectContaining({
        actorId: "admin1",
        action: "Reactivated account",
        targetRef: "User:off1",
      }),
    ]);
  });

  it("supports a historical BSON user ID and revokes BSON and string session references", async () => {
    const target = context.store[COLLECTIONS.user][3];
    const userId = new ObjectId();
    target._id = userId;
    target.role = "ADMIN";
    context.store[COLLECTIONS.session].push(
      { _id: "bson-session", userId },
      { _id: "string-session", userId: String(userId) },
    );
    const response = await reactivate(String(userId));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ userId: String(userId) });
    expect(target).toMatchObject({
      _id: userId,
      role: "ADMIN",
      blockedAt: null,
    });
    expect(context.store[COLLECTIONS.session]).toEqual([
      { _id: "sess1", userId: "stu1" },
    ]);
    expect(context.store[COLLECTIONS.adminActionLog]).toEqual([
      expect.objectContaining({
        action: "Reactivated account",
        targetRef: `User:${userId}`,
      }),
    ]);
  });

  it.each(["STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER", null])(
    "denies reactivation for role %s or no session",
    async (role) => {
      holder.session = role ? { user: { ...ADMIN.user, role } } : null;
      expect((await reactivate()).status).toBe(role ? 403 : 401);
      expect(context.store[COLLECTIONS.user][3].blockedAt).toBeInstanceOf(Date);
      expect(context.store[COLLECTIONS.adminActionLog]).toEqual([]);
    },
  );

  it("requires step-up before changing a disabled account", async () => {
    context.store[COLLECTIONS.adminStepUp][0].unlockedUntil = new Date(0);
    const response = await reactivate();
    expect(response.status).toBe(403);
    expect((await response.json()).data.code).toBe("STEP_UP_REQUIRED");
    expect(context.store[COLLECTIONS.user][3].blockedAt).toBeInstanceOf(Date);
    expect(context.store[COLLECTIONS.adminActionLog]).toEqual([]);
  });

  it.each([undefined, null])(
    "rejects an active account with blockedAt %s",
    async (blockedAt) => {
      context.store[COLLECTIONS.user][1].blockedAt = blockedAt;
      expect((await reactivate("stu1")).status).toBe(409);
      expect(context.store[COLLECTIONS.user][1].blockedAt).toBe(blockedAt);
      expect(context.store[COLLECTIONS.session]).toHaveLength(1);
      expect(context.store[COLLECTIONS.adminActionLog]).toEqual([]);
    },
  );

  it("rejects a missing account", async () => {
    expect((await reactivate("missing")).status).toBe(404);
    expect(context.store[COLLECTIONS.adminActionLog]).toEqual([]);
  });

  it("allows only one success and audit when two requests read the same disabled account", async () => {
    // Hold both snapshots before either write so the loser exercises the matchedCount guard.
    let reads = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    holder.db = {
      ...context.db,
      collection: (name: string) => {
        const collection = context.db.collection(name);
        if (name !== COLLECTIONS.user) return collection;
        return {
          ...collection,
          findOne: async (...args: Parameters<typeof collection.findOne>) => {
            const target = await collection.findOne(...args);
            if (++reads === 2) release();
            await ready;
            return target;
          },
        };
      },
    };
    const responses = await Promise.all([reactivate(), reactivate()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const conflict = responses.find((response) => response.status === 409)!;
    expect((await conflict.json()).error).toContain("account changed");
    expect(context.store[COLLECTIONS.user][3].blockedAt).toBeNull();
    expect(context.store[COLLECTIONS.adminActionLog]).toEqual([
      expect.objectContaining({
        action: "Reactivated account",
        targetRef: "User:blocked1",
      }),
    ]);
  });
});

describe("role lever", () => {
  it("promotes a student to SBO officer", async () => {
    const response = await call("/users/stu1", {
      method: "PATCH",
      body: JSON.stringify({ role: "SBO_OFFICER" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      userId: "stu1",
      role: "SBO_OFFICER",
    });
    expect(context.store[COLLECTIONS.adminActionLog]).toHaveLength(1);
  });

  it("rejects a role derived from the email domain", async () => {
    const response = await call("/users/admin1", {
      method: "PATCH",
      body: JSON.stringify({ role: "STUDENT" }),
    });
    expect(response.status).toBe(409);
  });

  it("skips accounts already on the requested side in bulk", async () => {
    const response = await call("/users", {
      method: "PATCH",
      body: JSON.stringify({
        userIds: ["stu1", "off1"],
        role: "SBO_OFFICER",
      }),
    });
    expect((await response.json()).data).toEqual({
      updated: 1,
      skipped: ["off1"],
    });
  });
});

describe("delete and password", () => {
  it("skips self and blocked accounts", async () => {
    const response = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: ["admin1", "blocked1"] }),
    });
    expect((await response.json()).data).toEqual({
      hardDeleted: [],
      blocked: [],
      skipped: [
        { userId: "admin1", reason: "SELF" },
        { userId: "blocked1", reason: "BLOCKED" },
      ],
    });
  });

  it("deletes another admin without activity, including duplicate bulk IDs", async () => {
    context.store[COLLECTIONS.user].push({ _id: "admin2", role: "ADMIN" });
    context.store[COLLECTIONS.session].push({
      _id: "admin-session",
      userId: "admin2",
    });
    context.store[COLLECTIONS.account].push({
      _id: "admin-account",
      userId: "admin2",
    });
    const response = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: ["admin2", "admin2", "admin1"] }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      hardDeleted: ["admin2"],
      blocked: [],
      skipped: [{ userId: "admin1", reason: "SELF" }],
    });
    expect(
      context.store[COLLECTIONS.user].some((row) => row._id === "admin2"),
    ).toBe(false);
    expect(
      context.store[COLLECTIONS.session].some((row) => row.userId === "admin2"),
    ).toBe(false);
    expect(
      context.store[COLLECTIONS.account].some((row) => row.userId === "admin2"),
    ).toBe(false);
  });

  it("preserves the last active admin even with a stale session and disabled admin present", async () => {
    context.store[COLLECTIONS.user].push({
      _id: "admin2",
      role: "ADMIN",
      blockedAt: new Date(),
    });
    holder.session = { user: { ...ADMIN.user, id: "deleted-admin" } };
    const response = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: ["admin1"] }),
    });
    expect((await response.json()).data.skipped).toEqual([
      { userId: "admin1", reason: "LAST_ADMIN" },
    ]);
    expect(context.store[COLLECTIONS.user][0].blockedAt).toBeUndefined();
  });

  it("disables an admin with activity, then permits permanent purge while another admin remains", async () => {
    const userId = new ObjectId();
    context.store[COLLECTIONS.user].push({
      _id: userId,
      role: "ADMIN",
      studentProfile: { _id: "admin-profile" },
    });
    context.store[COLLECTIONS.studentEnrollment].push({
      _id: "admin-enrollment",
      studentProfileId: "admin-profile",
    });
    context.store[COLLECTIONS.stepVerification].push({
      _id: "admin-verification",
      studentProfileId: "admin-profile",
    });
    const response = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: [String(userId)] }),
    });
    expect((await response.json()).data.blocked).toEqual([String(userId)]);
    expect(
      context.store[COLLECTIONS.user].find(
        (row) => String(row._id) === String(userId),
      )?.blockedAt,
    ).toBeInstanceOf(Date);
    expect((await call(`/users/${userId}`, { method: "DELETE" })).status).toBe(
      200,
    );
    expect(
      context.store[COLLECTIONS.studentEnrollment].some(
        (row) => row._id === "admin-enrollment",
      ),
    ).toBe(false);
  });

  it("rejects self-purge and a purge that leaves no active admin", async () => {
    context.store[COLLECTIONS.user][0].blockedAt = new Date();
    const self = await call("/users/admin1", { method: "DELETE" });
    expect(self.status).toBe(403);
    expect((await self.json()).error).toContain("cannot delete yourself");
    holder.session = { user: { ...ADMIN.user, id: "deleted-admin" } };
    const last = await call("/users/admin1", { method: "DELETE" });
    expect(last.status).toBe(403);
    expect((await last.json()).error).toContain("last active admin");
  });

  it("preserves one active admin across concurrent removal requests", async () => {
    context.store[COLLECTIONS.user].push({ _id: "admin2", role: "ADMIN" });
    holder.session = { user: { ...ADMIN.user, id: "deleted-admin" } };
    const responses = await Promise.all(
      ["admin1", "admin2"].map((id) =>
        call("/users", {
          method: "DELETE",
          body: JSON.stringify({ userIds: [id] }),
        }),
      ),
    );
    const results = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(results.flatMap((result) => result.data.hardDeleted)).toHaveLength(
      1,
    );
    expect(results.flatMap((result) => result.data.skipped)).toContainEqual({
      userId: expect.any(String),
      reason: "LAST_ADMIN",
    });
    expect(
      context.store[COLLECTIONS.user].filter(
        (row) => row.role === "ADMIN" && !row.blockedAt,
      ),
    ).toHaveLength(1);
  });

  it("blocks rather than hard-deletes BSON-linked activity and clears the queue", async () => {
    const profileId = new ObjectId();
    context.store[COLLECTIONS.user][1].studentProfile = {
      _id: profileId,
      studentNumber: "123",
      academicYearId: "ay-1",
    };
    context.store[COLLECTIONS.stepVerification] = [
      { _id: "verification", studentProfileId: profileId },
    ];
    context.store[COLLECTIONS.enrollmentQueue] = [
      { _id: "queue", studentProfileId: profileId },
    ];
    const response = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: ["stu1"] }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      hardDeleted: [],
      blocked: ["stu1"],
    });
    expect(
      context.store[COLLECTIONS.user].find((row) => row._id === "stu1"),
    ).toHaveProperty("blockedAt");
    expect(context.store[COLLECTIONS.stepVerification]).toHaveLength(1);
    expect(context.store[COLLECTIONS.enrollmentQueue]).toEqual([]);
  });

  it("refuses a self password reset", async () => {
    const response = await call("/users/admin1/password-reset", {
      method: "POST",
      body: JSON.stringify({ newPassword: "Long-enough-password" }),
    });
    expect(response.status).toBe(403);
  });

  it("refuses a password reset for a non-student", async () => {
    const response = await call("/users/off1/password-reset", {
      method: "POST",
      body: JSON.stringify({ newPassword: "Long-enough-password" }),
    });
    expect(response.status).toBe(403);
  });
});
