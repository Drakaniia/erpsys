import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQueueShareToken } from "../../src/config/queue-share.js";
import { env } from "../../src/lib/platform/env.js";
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
const STUDENT = {
  user: {
    id: "stud1",
    email: "12345@student.buksu.edu.ph",
    role: "STUDENT",
  },
};

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
      { _id: "link-1", adviserId: "adv1", departmentId: "dept-1" },
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
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        status: "WAITING",
        joinedAt: new Date(),
      },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "adv1",
        name: "Adviser",
        email: "adv@buksu.edu.ph",
        role: "ENROLLMENT_ADVISER",
      },
      { _id: "stud1", email: "12345@student.buksu.edu.ph", role: "STUDENT" },
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

describe("creating a share link", () => {
  it("mints a signed URL for an assigned adviser", async () => {
    const response = await call("/queue-shares", {
      method: "POST",
      body: JSON.stringify({ departmentId: "dept-1" }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.url).toContain("/queue?s=");
    expect(body.data).toMatchObject({
      departmentId: "dept-1",
      departmentName: "College of Technologies",
      inviterName: "Adviser",
      academicYearId: "ay-1",
    });
  });

  it("refuses a department the adviser is not assigned to", async () => {
    const response = await call("/queue-shares", {
      method: "POST",
      body: JSON.stringify({ departmentId: "dept-2" }),
    });
    expect(response.status).toBe(403);
  });
});

describe("opening a share link", () => {
  const token = () =>
    buildQueueShareToken({
      departmentId: "dept-1",
      adviserId: "adv1",
      academicYearId: "ay-1",
      secret: env.QUEUE_SHARE_SECRET,
    });

  it("reports the department, its openness, and the wait", async () => {
    holder.session = STUDENT;
    const body = await (await call(`/queue-shares/${token()}`)).json();
    expect(body.data).toMatchObject({
      status: "OK",
      departmentName: "College of Technologies",
      departmentCode: "CT",
      inviterName: "Adviser",
      isOpen: true,
      openByName: "Adviser",
      waitingCount: 1,
    });
  });

  it("answers INVALID for a tampered token", async () => {
    holder.session = STUDENT;
    const body = await (await call("/queue-shares/not-a-token")).json();
    expect(body.data).toMatchObject({ status: "INVALID", isOpen: false });
  });

  it("answers STALE for a link from another academic year", async () => {
    holder.session = STUDENT;
    const stale = buildQueueShareToken({
      departmentId: "dept-1",
      adviserId: "adv1",
      academicYearId: "ay-old",
      secret: env.QUEUE_SHARE_SECRET,
    });
    const body = await (await call(`/queue-shares/${stale}`)).json();
    expect(body.data).toMatchObject({ status: "STALE" });
  });
});
