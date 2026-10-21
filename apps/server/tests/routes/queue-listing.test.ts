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
    email: "adv@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
    isOutsideOrg: false,
  },
};

const PRE_STEPS = [
  "ASSESSMENT",
  "SOCIAL_MEDIA",
  "PROFILING",
  "MUGSHOT",
  "CONSENT",
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
    [COLLECTIONS.department]: [
      { _id: "dept-1", name: "College of Technologies", isActive: true },
    ],
    [COLLECTIONS.adviserDepartment]: [
      {
        _id: "link-1",
        adviserId: "adv1",
        departmentId: "dept-1",
        yearLevels: ["FIRST"],
      },
    ],
    [COLLECTIONS.adviserAvailability]: [
      {
        _id: "av-1",
        adviserId: "adv2",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        isOpen: true,
        lastActiveAt: new Date(),
      },
    ],
    [COLLECTIONS.studentProfile]: [
      {
        _id: "profile-1",
        userId: "stud1",
        studentNumber: "12345",
        academicYearId: "ay-1",
      },
      {
        _id: "profile-2",
        userId: "stud2",
        studentNumber: "12346",
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
      {
        _id: "enr-2",
        studentProfileId: "profile-2",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "SECOND",
      },
    ],
    [COLLECTIONS.user]: [
      { _id: "stud1", name: "Ana", email: "12345@student.buksu.edu.ph" },
      { _id: "stud2", name: "Ben", email: "12346@student.buksu.edu.ph" },
      { _id: "adv2", name: "Other Adviser", email: "adv2@buksu.edu.ph" },
    ],
    [COLLECTIONS.step]: PRE_STEPS.map((code, index) => ({
      _id: `step-${code}`,
      code,
      name: code,
      order: index + 1,
    })),
    [COLLECTIONS.stepVerification]: PRE_STEPS.map((code) => ({
      _id: `ver-${code}`,
      studentProfileId: "profile-1",
      stepId: `step-${code}`,
      academicYearId: "ay-1",
      status: "VERIFIED",
    })),
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "profile-1",
        status: "WAITING",
        joinedAt: new Date("2025-07-01T00:00:00Z"),
      },
      {
        _id: "q-2",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "profile-2",
        status: "WAITING",
        joinedAt: new Date("2025-07-02T00:00:00Z"),
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

const listing = async () =>
  (await (await fetch(`${server.url}/api/v1/queues`)).json()).data;

describe("instructor queue listing", () => {
  it("lists the line FIFO with verified-step state", async () => {
    const data = await listing();
    expect(data).toMatchObject({
      hasActiveYear: true,
      yearLabel: "2025-2026 · First",
    });
    const [dept] = data.departments;
    expect(dept).toMatchObject({
      id: "dept-1",
      code: "CT",
      myYearLevels: ["FIRST"],
      waitingCount: 2,
      isOpen: true,
      myOpen: false,
    });
    expect(dept.entries.map((e: { name: string }) => e.name)).toEqual([
      "Ana",
      "Ben",
    ]);
    expect(dept.entries[0]).toMatchObject({
      studentNumber: "12345",
      status: "WAITING",
      verifiedSteps: 5,
      missingStepCodes: [],
      locked: false,
      servedById: null,
    });
  });

  it("locks a student outside the adviser's year levels and names gaps", async () => {
    const [dept] = (await listing()).departments;
    expect(dept.entries[1]).toMatchObject({
      yearLevel: "SECOND",
      locked: true,
      verifiedSteps: 0,
      missingStepCodes: PRE_STEPS,
      missingStepNames: [
        "Assessment",
        "Social Media",
        "Profiling",
        "Mugshot",
        "Consent / Medical",
      ],
    });
  });

  it("names the other adviser holding the queue open", async () => {
    const [dept] = (await listing()).departments;
    expect(dept.openBy).toEqual({ id: "adv2", name: "Other Adviser" });
  });

  it("reports an empty board when no year is active", async () => {
    context.store[COLLECTIONS.academicYear] = [];
    expect(await listing()).toMatchObject({
      hasActiveYear: false,
      departments: [],
    });
  });
});
