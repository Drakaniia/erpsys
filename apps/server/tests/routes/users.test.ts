import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
}));

vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
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
        name: "Student One",
        email: "s1@student.buksu.edu.ph",
        role: "STUDENT",
        isOutsideOrg: false,
        createdAt: joined(2),
      },
      {
        _id: "off1",
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
    [COLLECTIONS.studentProfile]: [
      {
        _id: "p-stu1",
        userId: "stu1",
        studentNumber: "123",
        academicYearId: "ay-1",
      },
      {
        _id: "p-off1",
        userId: "off1",
        studentNumber: "456",
        academicYearId: "ay-1",
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
    [COLLECTIONS.session]: [],
    [COLLECTIONS.account]: [],
    [COLLECTIONS.notification]: [],
    [COLLECTIONS.verification]: [],
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.upload]: [],
    [COLLECTIONS.enrollmentQueue]: [],
    [COLLECTIONS.adviserDepartment]: [],
    [COLLECTIONS.adviserAvailability]: [],
    [COLLECTIONS.chatbotKnowledge]: [],
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
  context = fakeDb(seed());
  holder.db = context.db;
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

  it("filters by year level", async () => {
    const body = await (await call("/users?yearLevel=SECOND")).json();
    expect(body.data.map((u: Row) => u.id)).toEqual(["off1"]);
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
  it("skips admins and blocked accounts", async () => {
    const response = await call("/users", {
      method: "DELETE",
      body: JSON.stringify({ userIds: ["admin1", "blocked1"] }),
    });
    expect((await response.json()).data).toEqual({
      hardDeleted: [],
      blocked: [],
      skipped: [
        { userId: "admin1", reason: "ADMIN" },
        { userId: "blocked1", reason: "BLOCKED" },
      ],
    });
  });

  it("refuses a self password reset", async () => {
    const response = await call("/users/admin1/password-reset", {
      method: "POST",
      body: JSON.stringify({ newPassword: "longenough" }),
    });
    expect(response.status).toBe(403);
  });

  it("refuses a password reset for a non-student", async () => {
    const response = await call("/users/off1/password-reset", {
      method: "POST",
      body: JSON.stringify({ newPassword: "longenough" }),
    });
    expect(response.status).toBe(403);
  });
});
