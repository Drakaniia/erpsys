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
    name: "Ada",
    email: "ada@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
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
const ADMIN = {
  user: {
    id: "adm1",
    name: "Admin",
    email: "admin@buksu.edu.ph",
    role: "ADMIN",
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
      { _id: "dept-2", name: "College of Arts", isActive: true, yearLevels: [] },
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
      { _id: "adm1", name: "Admin", email: "admin@buksu.edu.ph", role: "ADMIN" },
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
    ],
    [COLLECTIONS.studentProfile]: [
      { _id: "p1", userId: "u-p1", studentNumber: "12345" },
    ],
    [COLLECTIONS.studentEnrollment]: [
      {
        _id: "e1",
        studentProfileId: "p1",
        academicYearId: "ay-1",
        departmentId: "dept-1",
        yearLevel: "FIRST",
      },
    ],
    [COLLECTIONS.enrollmentQueue]: [],
    [COLLECTIONS.adviserAvailability]: [],
    [COLLECTIONS.availabilityWindow]: [],
    [COLLECTIONS.calendarConnection]: [],
    [COLLECTIONS.notification]: [],
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

const call = async (path: string, method = "GET", body?: unknown) => {
  const response = await fetch(`${server.url}/api/v1${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const monday = { kind: "WEEKLY", weekday: 1, startMinute: 540, endMinute: 720 };

describe("instructor schedule", () => {
  it("saves a weekly window and reads it back", async () => {
    const saved = await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({
      departmentId: "dept-1",
      windows: [monday],
      sync: "NOT_CONNECTED",
    });
    expect(context.store[COLLECTIONS.availabilityWindow]).toHaveLength(1);
    const read = await call("/me/schedule?departmentId=dept-1");
    expect(read.body.data.windows).toEqual([monday]);
  });

  it("replaces the whole schedule on every save", async () => {
    await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday],
    });
    await call("/me/schedule", "PUT", { departmentId: "dept-1", windows: [] });
    expect(context.store[COLLECTIONS.availabilityWindow]).toHaveLength(0);
  });

  it("refuses overlapping hours with a 409", async () => {
    const { status, body } = await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday, { ...monday, startMinute: 600, endMinute: 780 }],
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Overlaps/);
    expect(context.store[COLLECTIONS.availabilityWindow]).toHaveLength(0);
  });

  it("refuses off-grid times with a 400", async () => {
    const { status } = await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [{ ...monday, startMinute: 545 }],
    });
    expect(status).toBe(400);
  });

  it("refuses a department the instructor does not hold", async () => {
    const { status, body } = await call("/me/schedule", "PUT", {
      departmentId: "dept-2",
      windows: [monday],
    });
    expect(status).toBe(403);
    expect(body.error).toBe("Department not assigned to you.");
  });

  it("keeps the schedule after the instructor's department link is gone", async () => {
    // Sign-out deletes adviser_department rows; the posted hours must outlive that.
    await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday],
    });
    context.store[COLLECTIONS.adviserDepartment].length = 0;
    const read = await call("/me/schedule?departmentId=dept-1");
    expect(read.body.data.windows).toEqual([monday]);
  });

  it("rejects a student", async () => {
    holder.session = STUDENT;
    const { status } = await call("/me/schedule?departmentId=dept-1");
    expect(status).toBe(403);
  });
});

describe("student schedule view", () => {
  it("shows department-level hours without naming the instructor", async () => {
    await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday],
    });
    holder.session = STUDENT;
    const { body } = await call("/me/departments");
    expect(body.data.departmentId).toBe("dept-1");
    expect(body.data.schedule.next ?? body.data.schedule.current).toEqual({
      startsAt: expect.any(String),
      endsAt: expect.any(String),
    });
    expect(JSON.stringify(body.data.schedule)).not.toContain("adv1");
  });

  it("reports an empty schedule when nothing is posted", async () => {
    holder.session = STUDENT;
    const { body } = await call("/me/departments");
    expect(body.data.schedule).toEqual({ current: null, next: null });
  });
});

describe("admin remapping", () => {
  it("drops schedules for departments the mapping no longer holds", async () => {
    await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday],
    });
    holder.session = ADMIN;
    await call("/advisers/adv1", "PATCH", {
      assignments: [{ departmentId: "dept-2", yearLevels: [] }],
    });
    expect(context.store[COLLECTIONS.availabilityWindow]).toHaveLength(0);
  });

  it("keeps schedules for departments that stay mapped", async () => {
    await call("/me/schedule", "PUT", {
      departmentId: "dept-1",
      windows: [monday],
    });
    holder.session = ADMIN;
    await call("/advisers/adv1", "PATCH", {
      assignments: [{ departmentId: "dept-1", yearLevels: ["FIRST"] }],
    });
    expect(context.store[COLLECTIONS.availabilityWindow]).toHaveLength(1);
  });
});
