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
  user: {
    id: "adm1",
    name: "Admin",
    email: "admin@buksu.edu.ph",
    role: "ADMIN",
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
const STUDENT = {
  user: {
    id: "u-p1",
    name: "Ana",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
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
      { _id: "dept-1", name: "College of Technologies", isActive: true },
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
        status: "VERIFIED",
        verifiedAt: new Date("2025-07-02T10:00:00Z"),
        createdAt: new Date("2025-07-01"),
      },
      {
        _id: "v-2",
        studentProfileId: "p2",
        stepId: "step-ASSESSMENT",
        academicYearId: "ay-1",
        status: "RETURNED",
        respondedAt: new Date("2025-07-03T10:00:00Z"),
        createdAt: new Date("2025-07-01"),
      },
      {
        _id: "v-3",
        studentProfileId: "p2",
        stepId: "step-PROFILING",
        academicYearId: "ay-1",
        status: "SUBMITTED",
      },
    ],
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "p1",
        status: "WAITING",
        joinedAt: new Date("2025-07-10T01:00:00Z"),
      },
      {
        _id: "q-2",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "p2",
        status: "COMPLETED",
        joinedAt: new Date("2025-07-09T20:00:00Z"),
        completedAt: new Date("2025-07-10T03:00:00Z"),
      },
    ],
    [COLLECTIONS.adminActionLog]: [
      {
        _id: "log-1",
        actorId: "adm1",
        action: "Created department",
        targetRef: "CT — College of Technologies",
        at: new Date("2025-06-02T08:00:00Z"),
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
  holder.session = ADMIN;
  context = fakeDb(seed());
  holder.db = context.db;
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

const call = async (path: string, method = "GET", body?: unknown) => {
  const response = await fetch(`${server.url}/api/v1${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

describe("admin overview", () => {
  it("counts roles, tallies steps and the queue, and lists recent actions", async () => {
    const { body } = await call("/me/overview");
    expect(body.data.roleCounts).toEqual({
      STUDENT: 2,
      SBO_OFFICER: 1,
      ENROLLMENT_ADVISER: 0,
      ADMIN: 1,
    });
    expect(body.data.activeYear).toMatchObject({ label: "2025-2026" });
    const assessment = body.data.stepTotals.find(
      (row: { code: string }) => row.code === "ASSESSMENT",
    );
    expect(assessment).toMatchObject({ verified: 1, unverified: 1 });
    expect(body.data.departmentTallies).toEqual([
      {
        departmentId: "dept-1",
        name: "College of Technologies",
        code: "CT",
        waiting: 1,
        serving: 0,
        enrolled: 1,
      },
    ]);
    expect(body.data.recentActivity[0]).toMatchObject({
      action: "Created department",
      actorName: "Admin",
      at: "2025-06-02T08:00:00.000Z",
    });
  });

  it("buckets the last fourteen campus days of queue joins and completions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-07-10T08:00:00Z"));
    try {
      const { body } = await call("/me/overview");
      const trend = body.data.queueTrend as Array<{
        day: string;
        joined: number;
        completed: number;
      }>;
      expect(trend).toHaveLength(14);
      expect(trend[0]!.day).toBe("2025-06-27");
      // 20:00Z on Jul 9 is already Jul 10 on campus (UTC+8), so both joins land on the last day.
      expect(trend.at(-1)).toEqual({ day: "2025-07-10", joined: 2, completed: 1 });
      expect(trend.slice(0, -1).every((d) => d.joined === 0 && d.completed === 0)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an empty trend when no year is active", async () => {
    context.store[COLLECTIONS.academicYear] = [];
    const { body } = await call("/me/overview");
    expect(body.data.queueTrend).toEqual([]);
    expect(body.data.departmentTallies).toEqual([]);
  });
});

describe("officer overview", () => {
  it("counts only the pre-enrollment steps and shows the last decisions", async () => {
    holder.session = OFFICER;
    const { body } = await call("/me/overview");
    expect(body.data.hasActiveYear).toBe(true);
    expect(body.data.yearLabel).toBe("2025-2026 · First");
    expect(body.data.steps.map((step: { code: string }) => step.code)).toEqual([
      "ASSESSMENT",
      "SOCIAL_MEDIA",
      "PROFILING",
      "MUGSHOT",
      "CONSENT",
    ]);
    expect(body.data.steps[0]).toMatchObject({
      code: "ASSESSMENT",
      verified: 1,
      unverified: 1,
    });
    // Newest decision first: the return (Jul 3) leads the verification (Jul 2).
    expect(body.data.recentActivity).toEqual([
      {
        id: "v-2",
        studentName: "Ben",
        stepCode: "ASSESSMENT",
        stepName: "ASSESSMENT",
        action: "Returned",
        at: "2025-07-03T10:00:00.000Z",
      },
      {
        id: "v-1",
        studentName: "Ana",
        stepCode: "ASSESSMENT",
        stepName: "ASSESSMENT",
        action: "Verified",
        at: "2025-07-02T10:00:00.000Z",
      },
    ]);
  });

  it("splits each step into awaiting review and returned, and dates the oldest wait", async () => {
    holder.session = OFFICER;
    context.store[COLLECTIONS.stepVerification]!.push(
      {
        _id: "v-4",
        studentProfileId: "p1",
        stepId: "step-PROFILING",
        academicYearId: "ay-1",
        status: "APPLIED",
        appliedAt: new Date("2025-07-05T02:00:00Z"),
      },
      {
        _id: "v-5",
        studentProfileId: "p2",
        stepId: "step-MUGSHOT",
        academicYearId: "ay-1",
        status: "SUBMITTED",
        appliedAt: new Date("2025-07-06T02:00:00Z"),
      },
    );
    const { body } = await call("/me/overview");
    const byCode = new Map(
      body.data.steps.map((step: { code: string }) => [step.code, step]),
    );
    expect(byCode.get("ASSESSMENT")).toMatchObject({
      awaitingReview: 0,
      returned: 1,
      oldestAwaitingAt: null,
    });
    // v-3 has no timestamp, so v-4's appliedAt is the only dated wait on Profiling.
    expect(byCode.get("PROFILING")).toMatchObject({
      unverified: 2,
      awaitingReview: 2,
      returned: 0,
      oldestAwaitingAt: "2025-07-05T02:00:00.000Z",
    });
    expect(byCode.get("MUGSHOT")).toMatchObject({ awaitingReview: 1 });
    expect(body.data.students).toEqual({ started: 2, cleared: 0 });
  });

  it("counts a student as cleared only once every pre-enrollment step is verified", async () => {
    holder.session = OFFICER;
    context.store[COLLECTIONS.stepVerification] = [
      "ASSESSMENT",
      "SOCIAL_MEDIA",
      "PROFILING",
      "MUGSHOT",
      "CONSENT",
    ].map((code) => ({
      _id: `c-${code}`,
      studentProfileId: "p1",
      stepId: `step-${code}`,
      academicYearId: "ay-1",
      status: "VERIFIED",
      verifiedAt: new Date("2025-07-02T10:00:00Z"),
    }));
    const { body } = await call("/me/overview");
    expect(body.data.students).toEqual({ started: 1, cleared: 1 });
  });

  it("buckets the last fourteen campus days of submissions and decisions", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-07-10T08:00:00Z"));
    holder.session = OFFICER;
    context.store[COLLECTIONS.stepVerification]!.push({
      _id: "v-6",
      studentProfileId: "p1",
      stepId: "step-CONSENT",
      academicYearId: "ay-1",
      status: "SUBMITTED",
      // 18:00Z on Jul 9 is already Jul 10 on campus (UTC+8).
      appliedAt: new Date("2025-07-09T18:00:00Z"),
    });
    try {
      const { body } = await call("/me/overview");
      const trend = body.data.reviewTrend as Array<{
        day: string;
        submitted: number;
        verified: number;
        returned: number;
      }>;
      expect(trend).toHaveLength(14);
      expect(trend[0]!.day).toBe("2025-06-27");
      expect(trend.find((d) => d.day === "2025-07-01")).toMatchObject({
        submitted: 2,
      });
      expect(trend.find((d) => d.day === "2025-07-02")).toMatchObject({
        verified: 1,
      });
      expect(trend.find((d) => d.day === "2025-07-03")).toMatchObject({
        returned: 1,
      });
      expect(trend.at(-1)).toEqual({
        day: "2025-07-10",
        submitted: 1,
        verified: 0,
        returned: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers with an empty tally when no year is active", async () => {
    holder.session = OFFICER;
    context.store[COLLECTIONS.academicYear] = [];
    const { body } = await call("/me/overview");
    expect(body.data).toMatchObject({
      recentActivity: [],
      reviewTrend: [],
      students: { started: 0, cleared: 0 },
      hasActiveYear: false,
      yearLabel: null,
    });
    expect(body.data.steps[0]).toMatchObject({ verified: 0, unverified: 0 });
  });

  it("refuses a student", async () => {
    holder.session = STUDENT;
    const { status } = await call("/me/overview");
    expect(status).toBe(403);
  });
});

describe("officer stamp", () => {
  it("falls back to the account name and stores the stamp fields", async () => {
    holder.session = OFFICER;
    expect((await call("/me/stamp")).body.data).toEqual({
      name: "Ofel",
      graphicUrl: null,
      signatureUrl: null,
    });

    const patched = await call("/me/stamp", "PATCH", {
      name: "SBO Office",
      graphicUrl: "https://cdn.example.com/stamp.png",
    });
    expect(patched.body.data).toEqual({
      name: "SBO Office",
      graphicUrl: "https://cdn.example.com/stamp.png",
      signatureUrl: null,
    });

    expect((await call("/me/stamp")).body.data).toMatchObject({
      name: "SBO Office",
      graphicUrl: "https://cdn.example.com/stamp.png",
    });
  });

  it("refuses a student", async () => {
    holder.session = STUDENT;
    expect((await call("/me/stamp")).status).toBe(403);
  });
});
