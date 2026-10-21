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
        studentNumber: "54321",
        academicYearId: "ay-1",
      },
    ],
    [COLLECTIONS.user]: [
      { _id: "adv1", name: "Adviser", email: "adv@buksu.edu.ph" },
      { _id: "stud1", name: "Ana", email: "12345@student.buksu.edu.ph" },
      { _id: "stud2", name: "Ben", email: "54321@student.buksu.edu.ph" },
    ],
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-old",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "profile-1",
        status: "COMPLETED",
        joinedAt: new Date("2025-07-01T00:00:00Z"),
        completedAt: new Date("2025-07-01T01:00:00Z"),
        servedById: "adv1",
      },
      {
        _id: "q-new",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "profile-2",
        status: "COMPLETED",
        joinedAt: new Date("2025-07-02T00:00:00Z"),
        completedAt: new Date("2025-07-02T01:00:00Z"),
        servedById: "adv1",
      },
      {
        _id: "q-waiting",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "profile-1",
        status: "WAITING",
        joinedAt: new Date("2025-07-03T00:00:00Z"),
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

const call = (path: string) =>
  fetch(`${server.url}/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
  });

describe("department enrollment register", () => {
  it("lists completed enrollments newest first", async () => {
    const response = await call("/departments/dept-1/enrollments");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((row: Row) => row.studentNumber)).toEqual([
      "54321",
      "12345",
    ]);
    expect(body.data[0]).toMatchObject({
      enrollmentId: "q-new",
      studentName: "Ben",
      servedByName: "Adviser",
    });
    expect(body.pageSize).toBe(50);
    expect(body.total).toBe(2);
    expect(response.headers.get("x-next-cursor")).toBe("");
  });

  it("returns the next cursor when the page is full", async () => {
    const response = await call("/departments/dept-1/enrollments?limit=1");
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(response.headers.get("x-next-cursor")).toBe(
      "2025-07-02T01:00:00.000Z",
    );
  });

  it("filters by student number or name, and matches nobody safely", async () => {
    const byNumber = await (
      await call("/departments/dept-1/enrollments?q=12345")
    ).json();
    expect(byNumber.data.map((row: Row) => row.studentNumber)).toEqual([
      "12345",
    ]);

    const byName = await (
      await call("/departments/dept-1/enrollments?q=Ben")
    ).json();
    expect(byName.data.map((row: Row) => row.studentName)).toEqual(["Ben"]);

    const none = await (
      await call("/departments/dept-1/enrollments?q=zzz")
    ).json();
    expect(none.data).toEqual([]);
    expect(none.total).toBe(0);
  });

  it("refuses a department the adviser is not assigned to", async () => {
    const response = await call("/departments/dept-2/enrollments");
    expect(response.status).toBe(403);
  });
});
