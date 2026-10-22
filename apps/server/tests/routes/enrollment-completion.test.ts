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
      {
        _id: "enr-2",
        studentProfileId: "profile-2",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
    ],
    [COLLECTIONS.user]: [
      { _id: "stud1", name: "Ana", email: "12345@student.buksu.edu.ph" },
      { _id: "adv1", name: "Adviser", email: "adv@buksu.edu.ph" },
    ],
    [COLLECTIONS.step]: [
      ...PRE_STEPS.map((code, index) => ({
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
    [COLLECTIONS.stepVerification]: PRE_STEPS.map((code) => ({
      _id: `ver-${code}`,
      studentProfileId: "profile-1",
      stepId: `step-${code}`,
      academicYearId: "ay-1",
      status: "VERIFIED",
    })),
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-serving",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "profile-1",
        status: "IN_PROGRESS",
        servedById: "adv1",
        joinedAt: new Date("2025-07-01T00:00:00Z"),
      },
      {
        _id: "q-waiting",
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

const call = (path: string, init?: RequestInit) =>
  fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

const complete = (id = "q-serving") =>
  call(`/enrollments/${id}/completion`, {
    method: "POST",
    body: JSON.stringify({ departmentId: "dept-1" }),
  });

const queueRow = (id: string) =>
  context.store[COLLECTIONS.enrollmentQueue].find((row) => row._id === id);

describe("enrollment completion", () => {
  it("marks the entry completed and verifies ENROLLMENT", async () => {
    const response = await complete();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      entryId: "q-serving",
      studentName: "Ana",
      outcome: "enrolled",
    });
    expect(queueRow("q-serving")).toMatchObject({
      status: "COMPLETED",
      servedById: "adv1",
    });
    expect(queueRow("q-serving")!.completedAt).toBeInstanceOf(Date);
    expect(
      context.store[COLLECTIONS.stepVerification].find(
        (row) => row.stepId === "step-ENROLLMENT",
      ),
    ).toMatchObject({ status: "VERIFIED", verifiedById: "adv1" });
    expect(
      context.store[COLLECTIONS.notification].some(
        (row) => row.type === "ENROLLED" && row.userId === "stud1",
      ),
    ).toBe(true);
  });

  it("is idempotent once the student is already enrolled", async () => {
    await complete();
    const body = await (await complete()).json();
    expect(body.data.outcome).toBe("already");
  });

  it("refuses a student who is still waiting", async () => {
    const response = await complete("q-waiting");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/click Serve/);
  });

  it("refuses while a pre-enrollment step is unverified", async () => {
    context.store[COLLECTIONS.stepVerification] = context.store[
      COLLECTIONS.stepVerification
    ].filter((row) => row.stepId !== "step-PROFILING");
    const response = await complete();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Steps 1–5 must be verified first — missing: PROFILING.",
    );
  });
});

describe("enrollment revert", () => {
  const revert = (id = "q-serving", reason = "Wrong student enrolled.") =>
    call(`/enrollments/${id}/completion`, {
      method: "DELETE",
      body: JSON.stringify({ departmentId: "dept-1", reason }),
    });

  it("returns the student to the front and revokes ENROLLMENT", async () => {
    await complete();
    const response = await revert();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      enrollmentId: "q-serving",
      reverted: true,
    });

    // Same row, flipped back in one guarded write.
    expect(body.data.returnedEntryId).toBe("q-serving");
    const returned = queueRow(body.data.returnedEntryId);
    expect(returned).toMatchObject({
      studentProfileId: "profile-1",
      status: "WAITING",
    });
    // Ahead of the student who was already waiting.
    expect(new Date(returned!.joinedAt as Date).getTime()).toBeLessThan(
      new Date("2025-07-02T00:00:00Z").getTime(),
    );

    expect(
      context.store[COLLECTIONS.stepVerification].find(
        (row) => row.stepId === "step-ENROLLMENT",
      ),
    ).toMatchObject({ status: "PENDING", revokedById: "adv1" });
    expect(
      context.store[COLLECTIONS.notification].some(
        (row) => row.type === "ENROLLED_REVOKED",
      ),
    ).toBe(true);
    expect(context.store[COLLECTIONS.adminActionLog][0]).toMatchObject({
      actorId: "adv1",
      action: "REVERT_ENROLLMENT",
      reason: "Wrong student enrolled.",
    });
  });

  it("refuses to revert an entry that is not completed", async () => {
    const response = await revert();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This enrollment has already been reverted or is not completed.",
    );
  });

  it("reverts a batch in one request", async () => {
    await complete();
    const response = await call("/enrollments/completions", {
      method: "DELETE",
      body: JSON.stringify({
        departmentId: "dept-1",
        enrollmentIds: ["q-serving"],
        reason: "Wrong student enrolled.",
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      revertedCount: 1,
      revertedIds: ["q-serving"],
    });
    expect(queueRow("q-serving")).toMatchObject({ status: "WAITING" });
  });

  it("refuses a second revert of the same enrollment", async () => {
    await complete();
    await revert();
    const response = await revert();
    expect(response.status).toBe(409);
  });

  it("accepts the enrolled table's `ids` payload", async () => {
    await complete();
    const response = await call("/enrollments/completions", {
      method: "DELETE",
      body: JSON.stringify({
        departmentId: "dept-1",
        ids: ["q-serving"],
        reason: "Wrong student enrolled.",
      }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      revertedCount: 1,
      revertedIds: ["q-serving"],
    });
  });
});
