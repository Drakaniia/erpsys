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

const ADVISER = {
  user: {
    id: "adv1",
    name: "Adviser",
    email: "adv@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
  },
};
const OFFICER = {
  user: {
    id: "off1",
    name: "Officer",
    email: "sbo@buksu.edu.ph",
    role: "SBO_OFFICER",
  },
};
const STUDENT = {
  user: {
    id: "u-p1",
    name: "Ana",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
  },
};

const PRE = ["ASSESSMENT", "SOCIAL_MEDIA", "PROFILING", "MUGSHOT", "CONSENT"];

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.academicYear]: [
      {
        _id: "ay-1",
        label: "2025-2026",
        semesterLabel: "First",
        isActive: true,
        createdAt: new Date("2025-06-01"),
      },
    ],
    [COLLECTIONS.department]: [
      { _id: "dept-1", name: "College of Technologies", isActive: true },
    ],
    [COLLECTIONS.adviserDepartment]: [
      { _id: "link-1", adviserId: "adv1", departmentId: "dept-1" },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "u-p1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        role: "STUDENT",
        createdAt: new Date("2025-01-01"),
      },
      {
        _id: "u-p2",
        name: "Ben",
        email: "12346@student.buksu.edu.ph",
        role: "STUDENT",
        createdAt: new Date("2025-01-02"),
      },
      {
        _id: "u-p3",
        name: "Cara",
        email: "12347@student.buksu.edu.ph",
        role: "STUDENT",
        createdAt: new Date("2025-01-03"),
      },
      {
        _id: "u-p4",
        name: "Dan",
        email: "12348@student.buksu.edu.ph",
        role: "STUDENT",
        createdAt: new Date("2025-01-04"),
      },
      {
        _id: "adm1",
        name: "Admin",
        email: "admin@buksu.edu.ph",
        role: "ADMIN",
        createdAt: new Date("2024-12-31"),
      },
    ],
    [COLLECTIONS.studentProfile]: [
      {
        _id: "p1",
        userId: "u-p1",
        studentNumber: "12345",
        academicYearId: "ay-1",
      },
      {
        _id: "p2",
        userId: "u-p2",
        studentNumber: "12346",
        academicYearId: "ay-1",
      },
      {
        _id: "p3",
        userId: "u-p3",
        studentNumber: "12347",
        academicYearId: "ay-1",
      },
      {
        _id: "p4",
        userId: "u-p4",
        studentNumber: "12348",
        academicYearId: "ay-1",
      },
    ],
    [COLLECTIONS.studentEnrollment]: [
      {
        _id: "enr-1",
        studentProfileId: "p1",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
      {
        _id: "enr-2",
        studentProfileId: "p2",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "SECOND",
      },
      {
        _id: "enr-3",
        studentProfileId: "p3",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
    ],
    [COLLECTIONS.step]: [
      ...PRE.map((code, index) => ({
        _id: `step-${code}`,
        code,
        name: code,
        order: index + 1,
      })),
      {
        _id: "step-ENROLLMENT",
        code: "ENROLLMENT",
        name: "Enrollment",
        order: 6,
      },
    ],
    [COLLECTIONS.stepVerification]: [
      // p1: all five pre-enrollment steps verified, no queue row → READY.
      ...PRE.map((code, index) => ({
        _id: `v-p1-${index}`,
        studentProfileId: "p1",
        stepId: `step-${code}`,
        academicYearId: "ay-1",
        status: "VERIFIED",
      })),
      // p2: one step in, still working.
      {
        _id: "v-p2-1",
        studentProfileId: "p2",
        stepId: "step-ASSESSMENT",
        academicYearId: "ay-1",
        status: "SUBMITTED",
      },
      // p3: enrolled.
      {
        _id: "v-p3-1",
        studentProfileId: "p3",
        stepId: "step-ENROLLMENT",
        academicYearId: "ay-1",
        status: "VERIFIED",
      },
    ],
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-3",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "p3",
        status: "COMPLETED",
        joinedAt: new Date("2025-07-01"),
        completedAt: new Date("2025-07-02"),
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
  holder.session = ADVISER;
  context = fakeDb(seed());
  holder.db = context.db;
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

const get = async (path: string) =>
  (await fetch(`${server.url}/api/v1${path}`)).json();

describe("roster", () => {
  it("classifies the adviser's students into buckets", async () => {
    const body = await get("/students?scope=mine");
    expect(body.total).toBe(3);
    const byName = Object.fromEntries(
      body.data.map((row: { studentName: string; bucket: string }) => [
        row.studentName,
        row.bucket,
      ]),
    );
    expect(byName).toEqual({
      Ana: "READY_FOR_QUEUE",
      Ben: "IN_PROGRESS",
      Cara: "ENROLLED",
    });
  });

  it("reports step counts, queue state and enrolled-at", async () => {
    const body = await get("/students?scope=mine&sort=name&dir=asc");
    const cara = body.data.find(
      (row: { studentName: string }) => row.studentName === "Cara",
    );
    expect(cara).toMatchObject({
      studentNumber: "12347",
      stepsVerified: 1,
      stepsTotal: 6,
      queueStatus: "COMPLETED",
      enrolled: true,
      enrolledAt: "2025-07-02T00:00:00.000Z",
      departmentCode: "CT",
      yearLevel: "FIRST",
    });
    expect(
      cara.stepStates.find((s: { code: string }) => s.code === "ENROLLMENT"),
    ).toMatchObject({
      status: "VERIFIED",
    });
  });

  it("filters by bucket, search text and unassigned", async () => {
    const ready = await get("/students?scope=mine&buckets=READY_FOR_QUEUE");
    expect(
      ready.data.map((row: { studentName: string }) => row.studentName),
    ).toEqual(["Ana"]);

    const searched = await get("/students?scope=mine&q=12346");
    expect(
      searched.data.map((row: { studentName: string }) => row.studentName),
    ).toEqual(["Ben"]);

    const unassigned = await get("/students?scope=all&unassigned=true");
    expect(
      unassigned.data.map((row: { studentName: string }) => row.studentName),
    ).toEqual(["Dan"]);
  });

  it("gives the officer the q-only picker", async () => {
    holder.session = OFFICER;
    expect((await get("/students")).data).toEqual([]);
    const found = await get("/students?q=Ana");
    expect(found.data[0]).toMatchObject({
      studentProfileId: "p1",
      name: "Ana",
      studentNumber: "12345",
    });
  });

  it("returns one student's steps, enrollment and queue", async () => {
    const body = await get("/students/p3");
    expect(body.data.student).toMatchObject({
      studentProfileId: "p3",
      studentName: "Cara",
      studentNumber: "12347",
    });
    expect(body.data.enrollment).toMatchObject({
      departmentCode: "CT",
      yearLevel: "FIRST",
    });
    expect(body.data.queue).toMatchObject({
      status: "COMPLETED",
      departmentCode: "CT",
      completedAt: "2025-07-02T00:00:00.000Z",
    });
    // ENROLLMENT verified out of six steps means five still pending.
    expect(body.data.pendingRequirements).toBe(5);
    expect(
      body.data.steps.find(
        (step: { code: string }) => step.code === "ENROLLMENT",
      ),
    ).toMatchObject({ status: "VERIFIED" });
  });

  it("refuses a student outside the adviser's departments", async () => {
    context.store[COLLECTIONS.adviserDepartment] = [];
    const response = await fetch(`${server.url}/api/v1/students/p3`);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "This student belongs to another department.",
    );
  });

  it("refuses a student outright", async () => {
    holder.session = STUDENT;
    const response = await fetch(`${server.url}/api/v1/students`);
    expect(response.status).toBe(403);
  });
});

describe("roster board", () => {
  it("returns the roster page and its bucket stats in one call", async () => {
    const body = await get("/students/board?scope=mine");
    expect(
      body.data.roster.data.map(
        (row: { studentName: string }) => row.studentName,
      ),
    ).toEqual(["Ana", "Ben", "Cara"]);
    expect(body.data.roster.total).toBe(3);
    expect(body.data.stats.stats).toMatchObject({
      total: 3,
      distribution: {
        NOT_STARTED: 0,
        IN_PROGRESS: 1,
        READY_FOR_QUEUE: 1,
        ENROLLED: 1,
      },
    });
  });

  it("applies the filters to the page and the year to the stats", async () => {
    const body = await get(
      "/students/board?scope=mine&buckets=READY_FOR_QUEUE",
    );
    expect(
      body.data.roster.data.map(
        (row: { studentName: string }) => row.studentName,
      ),
    ).toEqual(["Ana"]);
    expect(body.data.stats.year).toMatchObject({ label: "2025-2026" });
  });

  it("refuses a role without the instructor surface", async () => {
    holder.session = OFFICER;
    const response = await fetch(`${server.url}/api/v1/students/board`);
    expect(response.status).toBe(403);
  });
});

describe("roster reports", () => {
  it("caps the roster report and carries its stats", async () => {
    const body = await get("/reports/roster");
    expect(body.data).toMatchObject({ matchedCount: 3, truncated: false });
    expect(body.data.year).toMatchObject({ label: "2025-2026" });
    expect(body.data.stats).toMatchObject({
      total: 3,
      unassignedTotal: 1,
      distribution: {
        NOT_STARTED: 0,
        IN_PROGRESS: 1,
        READY_FOR_QUEUE: 1,
        ENROLLED: 1,
      },
    });
    expect(body.data.stats.byCourse[0]).toMatchObject({
      departmentCode: "CT",
      count: 3,
    });
  });

  it("aggregates roster stats per course and year level", async () => {
    const body = await get("/reports/roster-stats?scope=all");
    expect(body.data.stats.byCourseYearLevel[0]).toMatchObject({
      departmentCode: "CT",
      total: 3,
      counts: { FIRST: 2, SECOND: 1 },
    });
  });

  it("returns the step register for one step", async () => {
    holder.session = OFFICER;
    const body = await get("/reports/step-register?step=ASSESSMENT");
    // Seed step names are their codes; the payload echoes the stored name.
    expect(body.data.step).toEqual({ code: "ASSESSMENT", name: "ASSESSMENT" });
    expect(body.data.matchedCount).toBe(2);
    // `submittedAt` ascending sorts by status first, so SUBMITTED leads.
    expect(
      body.data.rows.map(
        (row: { student: { name: string } }) => row.student.name,
      ),
    ).toEqual(["Ben", "Ana"]);
    expect(body.data.rows[0]).toMatchObject({
      status: "SUBMITTED",
      evidenceCount: 0,
      verifiedByName: null,
    });
    expect(body.data.rows[1]).toMatchObject({ status: "VERIFIED" });
  });

  it("lists the user directory for an admin", async () => {
    holder.session = {
      user: {
        id: "adm1",
        name: "Admin",
        email: "admin@buksu.edu.ph",
        role: "ADMIN",
      },
    };
    const body = await get("/reports/user-directory?sort=name&dir=asc");
    expect(body.data.matchedCount).toBe(5);
    expect(body.data.rows.map((row: { name: string }) => row.name)).toEqual([
      "Admin",
      "Ana",
      "Ben",
      "Cara",
      "Dan",
    ]);
    expect(
      body.data.rows.find((row: { name: string }) => row.name === "Ana"),
    ).toMatchObject({
      studentNumber: "12345",
      department: { id: "dept-1", code: "CT" },
      yearLevel: "FIRST",
    });
  });
});
