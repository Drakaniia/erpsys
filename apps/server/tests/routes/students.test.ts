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

const STEP_CODES = [
  "ASSESSMENT",
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
  "ENROLLMENT",
];

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
    [COLLECTIONS.step]: STEP_CODES.map((code, index) => ({
      _id: `step-${index + 1}`,
      code,
      name: code,
      order: index + 1,
    })),
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
      { _id: "dept-1", name: "College of Technologies", isActive: true },
    ],
    [COLLECTIONS.requirementItem]: [
      { _id: "req-1", label: "TOR", order: 1, isActive: true },
    ],
    [COLLECTIONS.socialMediaLink]: [
      {
        _id: "sml-1",
        name: "Facebook",
        url: "https://fb.test",
        order: 1,
        isActive: true,
      },
    ],
    [COLLECTIONS.profilingForm]: [],
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.upload]: [],
    [COLLECTIONS.enrollmentQueue]: [],
    [COLLECTIONS.notification]: [
      {
        _id: "n-1",
        userId: "stud1",
        type: "EVIDENCE_EXPIRED",
        title: "Evidence expired",
        body: "Mugshot",
        readAt: null,
        createdAt: new Date("2025-07-01"),
      },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "stud1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        role: "STUDENT",
        createdAt: new Date("2025-06-02"),
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

describe("student steps", () => {
  it("returns one row per configured step with the step's requirements", async () => {
    const body = await (await call("/me/student")).json();
    expect(body.data.steps).toHaveLength(6);
    expect(body.data.profile.studentNumber).toBe("12345");
    expect(body.data.profile.enrollment.departmentName).toBe(
      "College of Technologies",
    );
    const assessment = body.data.steps[0];
    expect(assessment.code).toBe("ASSESSMENT");
    expect(assessment.status).toBe("PENDING");
    expect(assessment.requirements).toEqual([{ id: "req-1", label: "TOR" }]);
    expect(body.data.readyForQueue).toBe(false);
  });

  it("marks steps verified and the student ready to queue", async () => {
    for (let index = 1; index <= 5; index += 1) {
      context.store[COLLECTIONS.stepVerification].push({
        _id: `v-${index}`,
        studentProfileId: "profile-1",
        stepId: `step-${index}`,
        academicYearId: "ay-1",
        status: "VERIFIED",
        verifiedById: "off1",
        verifiedAt: new Date("2025-07-02"),
      });
    }
    context.store[COLLECTIONS.user].push({
      _id: "off1",
      name: "Officer",
      email: "off@buksu.edu.ph",
      role: "SBO_OFFICER",
      stampName: "SBO Stamp",
    });
    const body = await (await call("/me/student")).json();
    expect(body.data.readyForQueue).toBe(true);
    expect(body.data.verifiedCount).toBe(5);
    expect(body.data.steps[4].stamp).toMatchObject({
      verifiedByName: "Officer",
      stampName: "SBO Stamp",
    });
  });

  it("derives the number for an institutional address with no profile yet", async () => {
    context.store[COLLECTIONS.studentProfile] = [];
    context.store[COLLECTIONS.studentEnrollment] = [];
    context.store[COLLECTIONS.user][0]._id = "stud1";
    const body = await (await call("/me/student")).json();
    expect(body.data.profile.studentNumber).toBeNull();
    expect(body.data.profile.derivedStudentNumber).toBe("12345");
  });

  it("rejects a forbidden surface", async () => {
    holder.session = {
      user: {
        id: "adv1",
        email: "adv@buksu.edu.ph",
        role: "ENROLLMENT_ADVISER",
      },
    };
    const response = await call("/me/student");
    expect(response.status).toBe(403);
  });
});

describe("student number", () => {
  it("creates the profile on first save", async () => {
    context.store[COLLECTIONS.studentProfile] = [];
    context.store[COLLECTIONS.user].push({
      _id: "stud2",
      name: "Ben",
      email: "ben@example.test",
      role: "STUDENT",
    });
    holder.session = {
      user: { id: "stud2", email: "ben@example.test", role: "STUDENT" },
    };

    const response = await call("/me/student", {
      method: "PATCH",
      body: JSON.stringify({ studentNumber: " 54321 " }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ studentNumber: "54321" });
    expect(context.store[COLLECTIONS.studentProfile]).toHaveLength(1);
  });

  it("rejects a non-numeric student number", async () => {
    const response = await call("/me/student", {
      method: "PATCH",
      body: JSON.stringify({ studentNumber: "ABC" }),
    });
    expect(response.status).toBe(400);
  });

  it("refuses a number another live student owns", async () => {
    context.store[COLLECTIONS.user].push({
      _id: "stud2",
      name: "Ben",
      email: "ben@example.test",
      role: "STUDENT",
    });
    holder.session = {
      user: { id: "stud2", email: "ben@example.test", role: "STUDENT" },
    };
    const response = await call("/me/student", {
      method: "PATCH",
      body: JSON.stringify({ studentNumber: "12345" }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("already in use");
  });
});

describe("student record", () => {
  it("stays null until enrollment is verified", async () => {
    const before = await (await call("/me/record")).json();
    expect(before.data).toBeNull();
  });

  it("returns the record once enrollment is verified", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-6",
      studentProfileId: "profile-1",
      stepId: "step-6",
      academicYearId: "ay-1",
      status: "VERIFIED",
      verifiedById: "off1",
      verifiedAt: new Date("2025-07-03"),
    });

    const body = await (await call("/me/record")).json();
    expect(body.data.student.name).toBe("Ana");
    expect(body.data.enrollment.departmentCode).toBe("CT");
    expect(body.data.steps).toHaveLength(6);
    expect(body.data.steps[5].status).toBe("VERIFIED");
    expect(body.data.enrolledAt).toBe("2025-07-03T00:00:00.000Z");
  });
});

describe("assessment", () => {
  it("applies once and stays applied", async () => {
    const first = await call("/me/assessment", { method: "POST" });
    expect(first.status).toBe(200);
    expect((await first.json()).data).toEqual({ status: "APPLIED" });

    const second = await call("/me/assessment", { method: "POST" });
    expect((await second.json()).data).toEqual({ status: "APPLIED" });

    const rows = context.store[COLLECTIONS.stepVerification];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PENDING");
  });

  it("reports an already-verified assessment", async () => {
    context.store[COLLECTIONS.stepVerification].push({
      _id: "v-1",
      studentProfileId: "profile-1",
      stepId: "step-1",
      academicYearId: "ay-1",
      status: "VERIFIED",
      appliedAt: new Date("2025-07-01"),
    });
    const body = await (
      await call("/me/assessment", { method: "POST" })
    ).json();
    expect(body.data).toEqual({ status: "VERIFIED" });
  });
});

describe("notifications", () => {
  it("lists the bell and marks it read", async () => {
    const list = await (await call("/me/notifications")).json();
    expect(list.data[0].title).toBe("Evidence expired");
    expect(list.pageSize).toBe(50);

    const read = await call("/me/notifications/read", { method: "POST" });
    expect((await read.json()).data).toEqual({ count: 1 });
    expect(context.store[COLLECTIONS.notification][0].readAt).toBeInstanceOf(
      Date,
    );
  });
});
