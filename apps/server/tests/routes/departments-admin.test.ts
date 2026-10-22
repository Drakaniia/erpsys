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
const ADVISER = {
  user: {
    id: "adv1",
    name: "Ada",
    email: "ada@buksu.edu.ph",
    role: "ENROLLMENT_ADVISER",
  },
};
const OTHER_ADVISER = {
  user: {
    id: "adv2",
    name: "Bo",
    email: "bo@buksu.edu.ph",
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
      {
        _id: "dept-1",
        name: "College of Technologies",
        isActive: true,
        yearLevels: ["FIRST"],
      },
      {
        _id: "dept-2",
        name: "College of Arts",
        isActive: true,
        yearLevels: [],
      },
    ],
    [COLLECTIONS.adviserDepartment]: [
      {
        _id: "link-1",
        adviserId: "adv1",
        departmentId: "dept-1",
        yearLevels: ["FIRST"],
      },
      {
        _id: "link-2",
        adviserId: "adv2",
        departmentId: "dept-2",
        yearLevels: [],
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
        _id: "adv1",
        name: "Ada",
        email: "ada@buksu.edu.ph",
        role: "ENROLLMENT_ADVISER",
      },
      {
        _id: "adv2",
        name: "Bo",
        email: "bo@buksu.edu.ph",
        role: "ENROLLMENT_ADVISER",
      },
    ],
    [COLLECTIONS.studentProfile]: [
      {
        _id: "p1",
        userId: "u-p1",
        studentNumber: "12345",
        academicYearId: "ay-1",
      },
    ],
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "q-1",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        studentProfileId: "p1",
        status: "WAITING",
        joinedAt: new Date("2025-07-01"),
      },
    ],
    [COLLECTIONS.adminActionLog]: [],
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

describe("department listing", () => {
  it("gives an admin the rows with their owners and mapping counts", async () => {
    const { body } = await call("/departments");
    expect(body.total).toBe(2);
    const tech = body.data.find((row: { id: string }) => row.id === "dept-1");
    expect(tech).toMatchObject({
      id: "dept-1",
      name: "College of Technologies",
      code: "CT",
      yearLevels: ["FIRST"],
      mappingCount: 1,
      assignedToName: "Ada",
      owners: [{ adviserId: "adv1", name: "Ada", yearLevels: ["FIRST"] }],
    });
  });

  it("keeps the adviser-relative flags for the instructor branch", async () => {
    holder.session = ADVISER;
    const { body } = await call("/departments");
    const arts = body.data.find((row: { id: string }) => row.id === "dept-2");
    expect(arts.assigned).toBe(false);
    expect(arts.assignedToName).toBe("Bo");
    expect(arts.mappingCount).toBeUndefined();
  });
});

describe("department writes", () => {
  it("creates a department with its derived code and logs it", async () => {
    const { status, body } = await call("/departments", "POST", {
      name: "College of Nursing",
    });
    expect(status).toBe(201);
    expect(body.data).toMatchObject({ name: "College of Nursing", code: "CN" });
    expect(context.store[COLLECTIONS.adminActionLog]).toHaveLength(1);
    expect(context.store[COLLECTIONS.department]).toHaveLength(3);
  });

  it("rejects a name whose code is already taken", async () => {
    const { status, body } = await call("/departments", "POST", {
      name: "college of technologies",
    });
    expect(status).toBe(409);
    expect(body.error).toBe(
      "A department with that name or code already exists.",
    );
  });

  it("refuses to deactivate a department with students in line", async () => {
    const { status, body } = await call("/departments/dept-1", "PATCH", {
      isActive: false,
    });
    expect(status).toBe(409);
    expect(body.error).toBe(
      "Close the queue first — dept has students still in line.",
    );
  });

  it("lets an admin deactivate an empty department", async () => {
    const { body } = await call("/departments/dept-2", "PATCH", {
      isActive: false,
    });
    expect(body.data).toMatchObject({ id: "dept-2", isActive: false });
  });

  it("refuses a status change from an adviser", async () => {
    holder.session = ADVISER;
    const { status, body } = await call("/departments/dept-2", "PATCH", {
      isActive: false,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("Only an admin can change department status.");
  });

  it("sets year levels for the adviser who holds the department", async () => {
    holder.session = ADVISER;
    const { body } = await call("/departments/dept-1/year-levels", "PUT", {
      yearLevels: ["THIRD", "FIRST", "FIRST"],
    });
    expect(body.data).toEqual({ id: "dept-1", yearLevels: ["FIRST", "THIRD"] });
  });

  it("refuses year levels for a department the adviser does not hold", async () => {
    holder.session = ADVISER;
    const { status, body } = await call(
      "/departments/dept-2/year-levels",
      "PUT",
      {
        yearLevels: ["FIRST"],
      },
    );
    expect(status).toBe(403);
    expect(body.error).toBe(
      "Only this department's adviser (or an admin) can edit it.",
    );
  });

  it("refuses to delete a department that still has queue rows", async () => {
    const { status, body } = await call("/departments/dept-1", "DELETE");
    expect(status).toBe(409);
    expect(body.error).toBe(
      "Cannot delete a department with active queue entries.",
    );
  });

  it("deletes an empty department and its assignments", async () => {
    const { body } = await call("/departments/dept-2", "DELETE");
    expect(body.data).toEqual({ id: "dept-2", deleted: true });
    expect(context.store[COLLECTIONS.adviserDepartment]).toHaveLength(1);
  });

  it("claims a department for the adviser and refuses a clash", async () => {
    holder.session = ADVISER;
    const claimed = await call("/me/departments", "PUT", {
      departmentIds: ["dept-1"],
      yearLevels: ["FIRST"],
    });
    expect(claimed.body.data).toEqual({
      departmentIds: ["dept-1"],
      yearLevels: ["FIRST"],
    });

    const clash = await call("/me/departments", "PUT", {
      departmentIds: ["dept-2"],
      yearLevels: [],
    });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe(
      "CA — the whole department is already served by Bo. Request a transfer to take it over.",
    );
  });

  it("refuses a level the department does not offer", async () => {
    holder.session = OTHER_ADVISER;
    const { status, body } = await call("/me/departments", "PUT", {
      departmentIds: ["dept-1"],
      yearLevels: ["SECOND"],
    });
    expect(status).toBe(409);
    expect(body.error).toBe("College of Technologies doesn't offer 2nd Year.");
  });
});
