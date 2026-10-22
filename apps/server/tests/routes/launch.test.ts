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
    id: "u-p1",
    name: "Ana",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
  },
};
const OFFICER = {
  user: {
    id: "off1",
    name: "Ofel",
    email: "sbo@buksu.edu.ph",
    role: "SBO_OFFICER",
  },
};
const ADVISER = {
  user: {
    id: "adv1",
    name: "Ada",
    email: "ada@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
  },
};
const ADMIN = {
  user: {
    id: "adm1",
    name: "Admin",
    email: "admin@buksu.edu.ph",
    role: "ADMIN",
  },
};

const STEPS = [
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
    [COLLECTIONS.department]: [
      {
        _id: "dept-1",
        name: "College of Technologies",
        isActive: true,
        yearLevels: ["FIRST"],
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
    [COLLECTIONS.user]: [
      {
        _id: "adm1",
        name: "Admin",
        email: "admin@buksu.edu.ph",
        role: "ADMIN",
      },
      {
        _id: "off1",
        name: "Ofel",
        email: "sbo@buksu.edu.ph",
        role: "SBO_OFFICER",
      },
      {
        _id: "adv1",
        name: "Ada",
        email: "ada@buksu.edu.ph",
        role: "ENROLLMENT_ADVISER",
      },
      {
        _id: "u-p1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
        role: "STUDENT",
      },
      {
        _id: "u-p2",
        name: "Ben",
        email: "12346@student.buksu.edu.ph",
        role: "STUDENT",
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
    ],
    [COLLECTIONS.studentEnrollment]: [
      {
        _id: "enr-1",
        studentProfileId: "p1",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
    ],
    [COLLECTIONS.step]: STEPS.map((code, index) => ({
      _id: `step-${code}`,
      code,
      name: code,
      order: index + 1,
    })),
    [COLLECTIONS.stepVerification]: [
      {
        _id: "v-1",
        studentProfileId: "p1",
        stepId: "step-ASSESSMENT",
        academicYearId: "ay-1",
        status: "SUBMITTED",
        appliedAt: new Date("2025-07-01"),
        createdAt: new Date("2025-07-01"),
      },
      // The bell is the PENDING feed: a step opened but not yet submitted.
      {
        _id: "v-2",
        studentProfileId: "p2",
        stepId: "step-PROFILING",
        academicYearId: "ay-1",
        status: "PENDING",
        createdAt: new Date("2025-07-02"),
      },
    ],
    [COLLECTIONS.adviserAvailability]: [],
    [COLLECTIONS.notification]: [],
    [COLLECTIONS.departmentTransferRequest]: [],
    [COLLECTIONS.adminActionLog]: [],
    [COLLECTIONS.socialMediaLink]: [],
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

const launch = async () =>
  (await fetch(`${server.url}/api/v1/me/launch`)).json();

describe("launch", () => {
  it("seeds the student surface with the same values its endpoint returns", async () => {
    const body = await launch();
    expect(body.data).toMatchObject({
      surface: "student",
      schemaVersion: 1,
    });
    const data = body.data.data;
    expect(data.getMySteps.steps).toHaveLength(6);
    expect(data.getMySteps.steps[0]).toMatchObject({
      code: "ASSESSMENT",
      status: "SUBMITTED",
    });
    expect(data.getMyQueueStatus).toBeNull();
    expect(data.notifications).toEqual({
      data: [],
      page: 1,
      pageSize: 50,
      total: 0,
    });
    expect(data.profileStatus).toEqual({
      hasProfile: true,
      studentNumber: "12345",
    });
    expect(Object.keys(data.integrations)).toEqual(["data"]);
  });

  it("seeds the officer surface with the overview, bell and links", async () => {
    holder.session = OFFICER;
    const { data } = (await launch()).data;
    expect(data.getOverview.hasActiveYear).toBe(true);
    expect(data.getBell).toMatchObject({ total: 1 });
    expect(data.getBell.data[0]).toMatchObject({ status: "PENDING" });
    expect(data.getProfilingForm).toBeNull();
    expect(data.listSocialMediaLinks).toEqual({
      data: [],
      page: 1,
      pageSize: 50,
      total: 0,
    });
  });

  it("seeds the instructor surface with queues, departments and transfers", async () => {
    holder.session = ADVISER;
    const { data } = (await launch()).data;
    expect(data.getMyQueues.hasActiveYear).toBe(true);
    expect(data.getMyQueues.departments[0]).toMatchObject({
      id: "dept-1",
      code: "CT",
    });
    expect(data.listDepartments).toMatchObject({
      page: 1,
      pageSize: 50,
      total: 1,
    });
    expect(data.listDepartments.data[0]).toMatchObject({
      id: "dept-1",
      assigned: true,
      myYearLevels: ["FIRST"],
    });
    expect(data.listMyTransferRequests).toEqual({ incoming: [], outgoing: [] });
    expect(data.notifications.total).toBe(0);
  });

  it("seeds the admin surface with the overview and the profiling form", async () => {
    holder.session = ADMIN;
    const { data } = (await launch()).data;
    expect(data.getOverview.activeYear).toMatchObject({ label: "2025-2026" });
    expect(data.getProfilingForm).toBeNull();
  });
});
