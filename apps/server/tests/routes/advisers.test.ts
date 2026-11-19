import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { timestampOrdering } from "../../src/middleware/timestamp.js";
import { guardDb, nextTs } from "../../src/lib/db/timestamp-ordering.js";
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
      {
        _id: "dept-3",
        name: "College of Nursing",
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
      {
        _id: "u-p1",
        name: "Ana",
        email: "12345@student.buksu.edu.ph",
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
    [COLLECTIONS.adviserAvailability]: [],
    [COLLECTIONS.notification]: [],
  };
}

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", timestampOrdering, v1Router);
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

describe("adviser roster", () => {
  it("lists each instructor with the departments they hold", async () => {
    const { body } = await call("/advisers");
    expect(body.total).toBe(2);
    expect(body.data[0]).toMatchObject({
      id: "adv1",
      name: "Ada",
      email: "ada@buksu.edu.ph",
      departments: [{ id: "dept-1", code: "CT", yearLevels: ["FIRST"] }],
    });
  });

  it("rejects a non-adviser", async () => {
    holder.session = ADVISER;
    const { status } = await call("/advisers");
    expect(status).toBe(403);
  });
});

describe("adviser mapping", () => {
  it("replaces the whole mapping in one write", async () => {
    const { body } = await call("/advisers/adv1", "PATCH", {
      assignments: [{ departmentId: "dept-3", yearLevels: ["SECOND"] }],
    });
    expect(body.data).toEqual({
      adviserId: "adv1",
      assignments: [{ departmentId: "dept-3", yearLevels: ["SECOND"] }],
    });
    const links = context.store[COLLECTIONS.adviserDepartment];
    expect(links.filter((link) => link.adviserId === "adv1")).toEqual([
      {
        _id: expect.any(String),
        adviserId: "adv1",
        departmentId: "dept-3",
        yearLevels: ["SECOND"],
      },
    ]);
    expect(context.store[COLLECTIONS.adminActionLog]).toEqual([
      expect.objectContaining({
        actorId: "adm1",
        action: "Updated adviser mapping",
        targetRef: "Ada → 1 department",
      }),
    ]);
  });

  it("refuses levels another adviser already serves", async () => {
    const { status, body } = await call("/advisers/adv1", "PATCH", {
      assignments: [{ departmentId: "dept-2", yearLevels: [] }],
    });
    expect(status).toBe(409);
    expect(body.error).toBe("CA — those year levels are already served by Bo.");
  });

  it("refuses an account that is not an adviser", async () => {
    const { status, body } = await call("/advisers/adm1", "PATCH", {
      assignments: [],
    });
    expect(status).toBe(409);
    expect(body.error).toBe(
      "Only instructor (adviser) accounts can be mapped.",
    );
  });
});

describe("backend operation budgets", () => {
  it("preserves availability and the serving student for an unchanged assignment", async () => {
    holder.session = ADVISER;
    context.store[COLLECTIONS.adviserAvailability].push({
      _id: "open",
      adviserId: "adv1",
      departmentId: "dept-1",
      academicYearId: "ay-1",
      isOpen: true,
    });
    Object.assign(context.store[COLLECTIONS.enrollmentQueue][0], {
      status: "IN_PROGRESS",
      servedById: "adv1",
    });
    const response = await call("/me/departments", "PUT", {
      departmentIds: ["dept-1"],
      yearLevels: ["FIRST"],
    });
    expect(response.status).toBe(200);
    expect(context.store[COLLECTIONS.adviserAvailability][0].isOpen).toBe(true);
    expect(context.store[COLLECTIONS.enrollmentQueue][0]).toMatchObject({
      status: "IN_PROGRESS",
      servedById: "adv1",
    });
  });

  it("still aborts stale availability writes before changing queue state", async () => {
    holder.session = ADVISER;
    const ts = nextTs();
    context.store[COLLECTIONS.adviserAvailability].push({
      _id: "open",
      adviserId: "adv1",
      departmentId: "dept-1",
      academicYearId: "ay-1",
      isOpen: false,
      writeTs: nextTs(),
    });
    holder.db = guardDb(context.db as never);
    const response = await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: true,
      ts,
    });
    expect(response.status).toBe(409);
    expect(response.body.data.code).toBe("TS_ABORTED");
    expect(context.store[COLLECTIONS.adviserAvailability][0].isOpen).toBe(
      false,
    );
  });
  it.each(["assign", "unassign", "unchanged", "open", "close"])(
    "counts guarded database calls for %s",
    async (action) => {
      holder.session = ADVISER;
      const operations: string[] = [];
      const collection = context.db.collection.bind(context.db);
      vi.spyOn(context.db, "collection").mockImplementation((name: string) => {
        const raw = collection(name);
        return new Proxy(raw, {
          get(target, key) {
            const value = Reflect.get(target, key);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              operations.push(`${name}.${String(key)}`);
              return Reflect.apply(value, target, args);
            };
          },
        });
      });
      holder.db = guardDb(context.db as never);
      const availability = action === "open" || action === "close";
      if (action === "close")
        Object.assign(context.store[COLLECTIONS.enrollmentQueue][0], {
          status: "IN_PROGRESS",
          servedById: "adv1",
        });
      const response = await call(
        availability ? "/me/availability" : "/me/departments",
        "PUT",
        availability
          ? { departmentId: "dept-1", isOpen: action === "open" }
          : {
              departmentIds:
                action === "unassign"
                  ? []
                  : [action === "assign" ? "dept-3" : "dept-1"],
              yearLevels: ["FIRST"],
            },
      );
      expect(response.status).toBe(200);
      const budgets = {
        assign: 13,
        unassign: 10,
        unchanged: 4,
        open: 9,
        close: 10,
      };
      expect(operations.length).toBeLessThanOrEqual(
        budgets[action as keyof typeof budgets],
      );
      if (action === "unchanged") {
        expect(
          operations.some(
            (operation) =>
              operation.startsWith(`${COLLECTIONS.adviserAvailability}.`) ||
              operation.startsWith(`${COLLECTIONS.enrollmentQueue}.`),
          ),
        ).toBe(false);
      }
      if (action === "close") {
        expect(context.store[COLLECTIONS.enrollmentQueue][0]).toMatchObject({
          status: "WAITING",
          servedById: null,
        });
      }
    },
  );
});

describe("adviser availability", () => {
  it("opens the queue for the adviser's own department", async () => {
    holder.session = ADVISER;
    const { body } = await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: true,
    });
    expect(body.data).toEqual({
      departmentId: "dept-1",
      myOpen: true,
      isOpen: true,
      openBy: null,
    });
    expect(context.store[COLLECTIONS.adviserAvailability]).toHaveLength(1);
  });

  it("closing releases only my serving student in the active year", async () => {
    holder.session = ADVISER;
    context.store[COLLECTIONS.enrollmentQueue].push(
      {
        _id: "colleague",
        departmentId: "dept-1",
        academicYearId: "ay-1",
        status: "IN_PROGRESS",
        servedById: "adv2",
      },
      {
        _id: "archived",
        departmentId: "dept-1",
        academicYearId: "ay-old",
        status: "IN_PROGRESS",
        servedById: "adv1",
      },
    );
    Object.assign(context.store[COLLECTIONS.enrollmentQueue][0], {
      status: "IN_PROGRESS",
      servedById: "adv1",
    });
    const response = await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: false,
    });
    expect(response.status).toBe(200);
    expect(context.store[COLLECTIONS.enrollmentQueue][0]).toMatchObject({
      status: "WAITING",
      servedById: null,
    });
    expect(
      context.store[COLLECTIONS.enrollmentQueue]
        .slice(1)
        .every((row) => row.status === "IN_PROGRESS"),
    ).toBe(true);
  });

  it("opening does not need to list other availability rows", async () => {
    holder.session = ADVISER;
    const { AdviserAvailabilityModel } =
      await import("../../src/models/AdviserAvailabilityModel.js");
    const list = vi.spyOn(AdviserAvailabilityModel, "listOpenByDepartment");
    const response = await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: true,
    });
    expect(response.status).toBe(200);
    expect(list).not.toHaveBeenCalled();
  });

  it("closing the queue keeps the waiting line", async () => {
    holder.session = ADVISER;
    const { body } = await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: false,
    });
    expect(body.data).toMatchObject({ isOpen: false, myOpen: false });
    expect(context.store[COLLECTIONS.enrollmentQueue]).toHaveLength(1);
    expect(context.store[COLLECTIONS.enrollmentQueue][0].status).toBe(
      "WAITING",
    );
  });

  it("closing the queue hands back the student I was serving", async () => {
    holder.session = ADVISER;
    Object.assign(context.store[COLLECTIONS.enrollmentQueue][0], {
      status: "IN_PROGRESS",
      servedById: "adv1",
      servedAt: new Date(),
    });
    await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: false,
    });
    expect(context.store[COLLECTIONS.enrollmentQueue][0]).toMatchObject({
      status: "WAITING",
      servedById: null,
    });
  });

  it("refuses a department the adviser does not hold", async () => {
    holder.session = ADVISER;
    const { status, body } = await call("/me/availability", "PUT", {
      departmentId: "dept-2",
      isOpen: true,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("Department not assigned to you.");
  });

  it("reports a heartbeat as the number of open rows", async () => {
    holder.session = ADVISER;
    await call("/me/availability", "PUT", {
      departmentId: "dept-1",
      isOpen: true,
    });
    const { body } = await call("/me/availability/heartbeat", "POST");
    expect(body.data).toEqual({ touched: 1 });
  });
});
