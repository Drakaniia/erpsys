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

const STEPS = ["ASSESSMENT", "SOCIAL_MEDIA", "PROFILING", "MUGSHOT", "CONSENT"];

function profile(id: string, userId: string): Row {
  return {
    _id: id,
    userId,
    studentNumber: `1234${id}`,
    academicYearId: "ay-1",
  };
}

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
    [COLLECTIONS.adviserDepartment]: [
      { _id: "link-1", adviserId: "adv1", departmentId: "dept-1" },
    ],
    [COLLECTIONS.user]: ["p1", "p2", "p3"].map((id) => ({
      _id: `u-${id}`,
      name: id,
      email: `${id}@student.buksu.edu.ph`,
    })),
    [COLLECTIONS.studentProfile]: [
      profile("p1", "u-p1"),
      profile("p2", "u-p2"),
      profile("p3", "u-p3"),
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
        departmentId: "dept-2",
        yearLevel: "FIRST",
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
      ...STEPS.map((code, index) => ({
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
      // p1 has nothing verified except assessment.
      {
        _id: "v-1",
        studentProfileId: "p1",
        stepId: "step-ASSESSMENT",
        academicYearId: "ay-1",
        status: "VERIFIED",
      },
      // p3 is fully enrolled, so it must be skipped.
      {
        _id: "v-2",
        studentProfileId: "p3",
        stepId: "step-ENROLLMENT",
        academicYearId: "ay-1",
        status: "VERIFIED",
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

const remind = (studentProfileIds: string[]) =>
  fetch(`${server.url}/api/v1/students/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentProfileIds }),
  });

describe("student reminders", () => {
  it("sends to in-scope students who are not enrolled yet", async () => {
    const response = await remind(["p1", "p2", "p3"]);
    expect(response.status).toBe(200);
    // p1 in scope and pending; p2 out of scope; p3 already enrolled.
    expect((await response.json()).data).toEqual({ sent: 1, skipped: 2 });
    const sent = context.store[COLLECTIONS.notification];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      userId: "u-p1",
      type: "STEPS_REMINDER",
      title: "Pending requirements",
    });
    // Six step codes, one verified — ENROLLMENT counts as pending too.
    expect(sent[0]!.body).toContain("5 requirement(s)");
  });

  it("reports a missing year instead of guessing one", async () => {
    context.store[COLLECTIONS.academicYear] = [];
    const response = await remind(["p1"]);
    expect(response.status).toBe(412);
    expect((await response.json()).error).toContain("No academic year");
  });
});
