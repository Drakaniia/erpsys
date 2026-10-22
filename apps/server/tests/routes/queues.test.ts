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

const ADVISER = {
  user: {
    id: "adv1",
    name: "Adviser",
    email: "adv@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
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
  const recent = new Date();
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
    ],
    [COLLECTIONS.step]: STEP_CODES.map((code, index) => ({
      _id: `step-${index + 1}`,
      code,
      name: code,
      order: index + 1,
    })),
    [COLLECTIONS.stepVerification]: STEP_CODES.slice(0, 5).map(
      (code, index) => ({
        _id: `v-${index + 1}`,
        studentProfileId: "profile-1",
        stepId: `step-${index + 1}`,
        academicYearId: "ay-1",
        status: "VERIFIED",
      }),
    ),
    [COLLECTIONS.adviserAvailability]: [
      {
        _id: "av-1",
        adviserId: "adv1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        isOpen: true,
        lastActiveAt: recent,
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
    [COLLECTIONS.enrollmentQueue]: [],
    [COLLECTIONS.notification]: [],
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
  vi.restoreAllMocks();
  server = await serve();
});

afterEach(async () => {
  await server.close();
});

const call = (path: string, init?: RequestInit) =>
  fetch(`${server.url}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

const join = (departmentId = "dept-1") =>
  call("/me/queue", {
    method: "POST",
    body: JSON.stringify({ departmentId }),
  });

describe("joining the queue", () => {
  it("enqueues the student and notifies them", async () => {
    const response = await join();
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({
      departmentName: "College of Technologies",
      position: 1,
    });

    const row = context.store[COLLECTIONS.enrollmentQueue][0];
    expect(row).toMatchObject({
      departmentId: "dept-1",
      studentProfileId: "profile-1",
      academicYearId: "ay-1",
      status: "WAITING",
    });

    const notification = context.store[COLLECTIONS.notification][0];
    expect(notification.type).toBe("QUEUE_JOINED");
    expect(notification.body).toBe("College of Technologies — position #1.");
  });

  it("refuses while a pre-enrollment step is unverified", async () => {
    context.store[COLLECTIONS.stepVerification].pop();
    const response = await join();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Complete steps 1–5 first — missing: CONSENT.",
    );
  });

  it("refuses a different department than the enrollment", async () => {
    const response = await join("dept-2");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain(
      "not the one on your enrollment record",
    );
  });

  it("refuses when no adviser has the queue open", async () => {
    context.store[COLLECTIONS.adviserAvailability][0].isOpen = false;
    const response = await join();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Queue closed — the adviser is not yet accepting students.",
    );
  });

  it("refuses a year level the live advisers do not cover", async () => {
    context.store[COLLECTIONS.adviserDepartment][0].yearLevels = ["SECOND"];
    const response = await join();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "No adviser is currently serving 1st Year students in College of Technologies — the open advisers cover 2nd Year.",
    );
  });
});

describe("queue status", () => {
  it("is null when the student is not queued", async () => {
    const body = await (await call("/me/queue")).json();
    expect(body.data).toBeNull();
  });

  it("reports position, department openness, and level coverage", async () => {
    await join();
    const body = await (await call("/me/queue")).json();
    expect(body.data).toMatchObject({
      departmentName: "College of Technologies",
      status: "WAITING",
      position: 1,
      deptOpen: true,
      servesMyLevel: true,
      servedByName: null,
    });
  });
});

describe("leaving the queue", () => {
  it("removes a waiting entry", async () => {
    await join();
    const response = await call("/me/queue", { method: "DELETE" });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ left: true });
    expect(context.store[COLLECTIONS.enrollmentQueue]).toHaveLength(0);
  });

  it("is a no-op when there is no entry", async () => {
    const response = await call("/me/queue", { method: "DELETE" });
    expect((await response.json()).data).toEqual({ left: true });
  });

  it("refuses to leave while being served", async () => {
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: "queue-1",
      departmentId: "dept-1",
      studentProfileId: "profile-1",
      academicYearId: "ay-1",
      status: "IN_PROGRESS",
      joinedAt: new Date(),
    });
    const response = await call("/me/queue", { method: "DELETE" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("serving you right now");
  });
});

describe("officer serving", () => {
  const pushWaiting = (id: string, joinedAt: string) => {
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: id,
      departmentId: "dept-1",
      studentProfileId: "profile-1",
      academicYearId: "ay-1",
      status: "WAITING",
      joinedAt: new Date(joinedAt),
    });
  };

  beforeEach(() => {
    holder.session = ADVISER;
  });

  it("serves the head of the line and tells the student", async () => {
    pushWaiting("entry-1", "2025-07-01T00:00:00Z");

    const response = await call("/queues/serving", {
      method: "POST",
      body: JSON.stringify({ departmentId: "dept-1", entryId: "entry-1" }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual({
      entryId: "entry-1",
      status: "IN_PROGRESS",
    });
    expect(context.store[COLLECTIONS.enrollmentQueue][0]).toMatchObject({
      status: "IN_PROGRESS",
      servedById: "adv1",
    });
    expect(context.store[COLLECTIONS.notification][0].type).toBe(
      "QUEUE_SERVING",
    );
  });

  it("refuses to skip the head of the line", async () => {
    pushWaiting("entry-1", "2025-07-01T00:00:00Z");
    pushWaiting("entry-2", "2025-07-01T00:05:00Z");

    const response = await call("/queues/serving", {
      method: "POST",
      body: JSON.stringify({ departmentId: "dept-1", entryId: "entry-2" }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Not next in line — strict FIFO.",
    );
  });

  it("releases the serving slot without enrolling", async () => {
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: "entry-1",
      departmentId: "dept-1",
      studentProfileId: "profile-1",
      academicYearId: "ay-1",
      status: "IN_PROGRESS",
      servedById: "adv1",
      joinedAt: new Date("2025-07-01"),
    });

    const response = await call("/queues/serving", {
      method: "DELETE",
      body: JSON.stringify({ departmentId: "dept-1", entryId: "entry-1" }),
    });
    expect((await response.json()).data).toEqual({
      entryId: "entry-1",
      status: "WAITING",
    });
    expect(context.store[COLLECTIONS.enrollmentQueue][0].servedById).toBeNull();
  });

  it("moves the head of the line to the back", async () => {
    pushWaiting("entry-1", "2025-07-01T00:00:00Z");

    const response = await call("/queues/serving/position", {
      method: "POST",
      body: JSON.stringify({
        departmentId: "dept-1",
        entryId: "entry-1",
        to: "end",
      }),
    });
    expect(response.status).toBe(200);
    const row = context.store[COLLECTIONS.enrollmentQueue][0];
    expect(row.movedToEndById).toBe("adv1");
    expect(context.store[COLLECTIONS.notification][0].type).toBe("QUEUE_MOVED");
  });

  it("removes a waiting student and can restore the entry", async () => {
    pushWaiting("entry-1", "2025-07-01T00:00:00Z");

    const removed = await (
      await call("/queue-entries/entry-1/removal", { method: "POST" })
    ).json();
    expect(removed.data.removed).toBe(true);
    expect(removed.data.snapshot).toMatchObject({
      entryId: "entry-1",
      departmentId: "dept-1",
      studentProfileId: "profile-1",
    });
    expect(context.store[COLLECTIONS.enrollmentQueue]).toHaveLength(0);

    const restored = await call("/queue-entries/entry-1/restoration", {
      method: "POST",
      body: JSON.stringify({
        ...removed.data.snapshot,
        studentName: "Ana",
      }),
    });
    expect(restored.status).toBe(200);
    expect((await restored.json()).data).toEqual({
      restored: true,
      entryId: "entry-1",
    });
    expect(context.store[COLLECTIONS.enrollmentQueue][0].status).toBe(
      "WAITING",
    );
  });

  it("refuses to remove a student being served", async () => {
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: "entry-1",
      departmentId: "dept-1",
      studentProfileId: "profile-1",
      academicYearId: "ay-1",
      status: "IN_PROGRESS",
      servedById: "adv1",
      joinedAt: new Date("2025-07-01"),
    });
    const response = await call("/queue-entries/entry-1/removal", {
      method: "POST",
    });
    expect(response.status).toBe(409);
  });

  const removeEntry = async (id: string) =>
    (await (await call(`/queue-entries/${id}/removal`, { method: "POST" })).json())
      .data.snapshot;
  const restore = (id: string, snapshot: Record<string, unknown>) =>
    call(`/queue-entries/${id}/restoration`, {
      method: "POST",
      body: JSON.stringify(snapshot),
    });

  it("refuses to restore an entry the student already re-joined with", async () => {
    pushWaiting("entry-1", "2025-07-01T00:00:00Z");
    const snapshot = await removeEntry("entry-1");
    pushWaiting("entry-2", "2025-07-01T00:00:00Z");
    const response = await restore("entry-1", snapshot);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "Student already re-joined — cannot undo.",
    );
  });

  it("refuses a restore whose snapshot was tampered with", async () => {
    pushWaiting("entry-1", "2025-07-01T00:00:00Z");
    const snapshot = await removeEntry("entry-1");
    const response = await restore("entry-1", {
      ...snapshot,
      joinedAt: "1970-01-01T00:00:00.000Z",
    });
    expect(response.status).toBe(403);
    expect(context.store[COLLECTIONS.enrollmentQueue]).toHaveLength(0);
  });

  it("serves the first student in my year levels past one I can't serve", async () => {
    context.store[COLLECTIONS.studentProfile].push({
      _id: "profile-2",
      userId: "stud2",
      studentNumber: "22222",
      academicYearId: "ay-1",
    });
    context.store[COLLECTIONS.studentEnrollment].push({
      _id: "enr-2",
      studentProfileId: "profile-2",
      academicYearId: "ay-1",
      departmentId: "dept-1",
      yearLevel: "SECOND",
    });
    context.store[COLLECTIONS.adviserDepartment][0].yearLevels = ["SECOND"];
    pushWaiting("entry-1", "2025-07-01T00:00:00Z"); // 1st year, not mine
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: "entry-2",
      departmentId: "dept-1",
      studentProfileId: "profile-2",
      academicYearId: "ay-1",
      status: "WAITING",
      joinedAt: new Date("2025-07-01T00:05:00Z"),
    });

    const response = await call("/queues/serving", {
      method: "POST",
      body: JSON.stringify({ departmentId: "dept-1", entryId: "entry-2" }),
    });
    expect(response.status).toBe(201);
  });

  it("refuses to serve a student a colleague is already serving", async () => {
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: "entry-1",
      departmentId: "dept-1",
      studentProfileId: "profile-1",
      academicYearId: "ay-1",
      status: "IN_PROGRESS",
      servedById: "adv2",
      joinedAt: new Date("2025-07-01"),
    });
    const response = await call("/queues/serving", {
      method: "POST",
      body: JSON.stringify({ departmentId: "dept-1", entryId: "entry-1" }),
    });
    expect(response.status).toBe(409);
  });
});
