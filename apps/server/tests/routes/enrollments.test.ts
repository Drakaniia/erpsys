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

const STUDENT = {
  user: {
    id: "stud1",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
    isOutsideOrg: false,
  },
};

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.academicYear]: [
      {
        _id: "ay-2",
        label: "2026-2027",
        semesterLabel: "First",
        isActive: false,
        createdAt: new Date("2026-06-01"),
      },
      {
        _id: "ay-1",
        label: "2025-2026",
        semesterLabel: "First",
        isActive: true,
        createdAt: new Date("2025-06-01"),
      },
    ],
    [COLLECTIONS.studentProfile]: [
      {
        _id: "profile-1",
        userId: "stud1",
        studentNumber: "12345",
        academicYearId: "ay-1",
      },
    ],
    [COLLECTIONS.studentEnrollment]: [
      {
        _id: "enr-1",
        studentProfileId: "profile-1",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
    ],
    [COLLECTIONS.department]: [
      {
        _id: "dept-1",
        name: "College of Technologies",
        isActive: true,
        yearLevels: ["FIRST"],
      },
      {
        _id: "dept-2",
        name: "College of Arts",
        isActive: true,
        yearLevels: ["SECOND"],
      },
    ],
    [COLLECTIONS.adviserAvailability]: [
      {
        _id: "av-1",
        adviserId: "adv1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        isOpen: true,
        lastActiveAt: new Date(),
      },
    ],
    [COLLECTIONS.adviserDepartment]: [
      {
        _id: "link-1",
        adviserId: "adv1",
        departmentId: "dept-1",
        yearLevels: ["FIRST"],
      },
    ],
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "someone",
        status: "WAITING",
        joinedAt: new Date(),
      },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "stud1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        role: "STUDENT",
      },
      {
        _id: "adv1",
        name: "Adviser",
        email: "adv@buksu.edu.ph",
        role: "ENROLLMENT_ADVISER",
      },
    ],
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

let context: ReturnType<typeof fakeDb>;
let server: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  holder.session = STUDENT;
  context = fakeDb(seed());
  holder.db = context.db;
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

const call = (path: string, init?: RequestInit) =>
  fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

const save = (body: Record<string, unknown>) =>
  call("/me/enrollments", { method: "POST", body: JSON.stringify(body) });

describe("my enrollments", () => {
  it("lists the year with its active flag and course code", async () => {
    const body = await (await call("/me/enrollments")).json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      academicYearLabel: "2025-2026",
      departmentName: "College of Technologies",
      departmentCode: "CT",
      yearLevel: "FIRST",
      isActiveYear: true,
    });
  });

  it("updates the enrolled course for a new year", async () => {
    const response = await save({
      academicYearId: "ay-2",
      departmentId: "dept-2",
      yearLevel: "SECOND",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      studentNumber: "12345",
      enrollment: { academicYearId: "ay-2", departmentId: "dept-2" },
    });
    const rows = context.store[COLLECTIONS.studentEnrollment];
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      studentProfileId: "profile-1",
      academicYearId: "ay-2",
      yearLevel: "SECOND",
    });
  });

  it("rewrites the same year in place instead of adding a row", async () => {
    await save({
      academicYearId: "ay-1",
      departmentId: "dept-2",
      yearLevel: "SECOND",
    });
    const rows = context.store[COLLECTIONS.studentEnrollment];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      departmentId: "dept-2",
      yearLevel: "SECOND",
    });
  });

  it("refuses a course change while the student is in the queue", async () => {
    context.store[COLLECTIONS.enrollmentQueue][0].studentProfileId =
      "profile-1";
    const response = await save({
      academicYearId: "ay-1",
      departmentId: "dept-2",
      yearLevel: "SECOND",
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Leave the queue before changing your course or year level.",
    );
  });

  it("refuses a level the department does not offer", async () => {
    const response = await save({
      academicYearId: "ay-2",
      departmentId: "dept-2",
      yearLevel: "FIRST",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "College of Arts doesn't offer 1st Year.",
    );
  });

  it("refuses an unknown academic year", async () => {
    const response = await save({
      academicYearId: "ay-nope",
      departmentId: "dept-1",
      yearLevel: "FIRST",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Pick an academic year from the list.",
    );
  });
});

describe("my department", () => {
  it("reports the open state, server, wait, and level coverage", async () => {
    const body = await (await call("/me/departments")).json();
    expect(body.data).toMatchObject({
      departmentId: "dept-1",
      departmentName: "College of Technologies",
      code: "CT",
      isOpen: true,
      openBy: { id: "adv1", name: "Adviser" },
      waitingCount: 1,
      servesMyLevel: true,
      myYearLevel: "FIRST",
      openLevels: ["FIRST"],
    });
  });

  it("is null before the student has an enrollment", async () => {
    context.store[COLLECTIONS.studentEnrollment] = [];
    const body = await (await call("/me/departments")).json();
    expect(body.data).toBeNull();
  });
});
