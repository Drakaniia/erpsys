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

const session = (id: string, name: string) => ({
  user: { id, name, email: `${id}@buksu.edu.ph`, role: "ENROLLMENT_ADVISER" },
});

const OWNER = session("adv1", "Owner");
const REQUESTER = session("adv2", "Requester");
const THIRD = session("adv3", "Third");

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
        yearLevels: ["FIRST", "SECOND"],
      },
      { _id: "dept-2", name: "College of Arts", isActive: true },
    ],
    [COLLECTIONS.adviserDepartment]: [
      {
        _id: "link-owner",
        adviserId: "adv1",
        departmentId: "dept-1",
        yearLevels: ["FIRST", "SECOND"],
      },
      {
        _id: "link-owner-2",
        adviserId: "adv1",
        departmentId: "dept-2",
        yearLevels: [],
      },
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
        studentProfileId: "profile-1",
        status: "IN_PROGRESS",
        servedById: "adv1",
        joinedAt: new Date("2025-07-01"),
      },
    ],
    [COLLECTIONS.user]: [
      { _id: "adv1", name: "Owner", email: "adv1@buksu.edu.ph" },
      { _id: "adv2", name: "Requester", email: "adv2@buksu.edu.ph" },
      { _id: "adv3", name: "Third", email: "adv3@buksu.edu.ph" },
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
  holder.session = REQUESTER;
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

const ask = (body: Record<string, unknown> = {}) =>
  call("/transfers", {
    method: "POST",
    body: JSON.stringify({
      departmentId: "dept-1",
      yearLevels: ["FIRST"],
      ...body,
    }),
  });

const links = () => context.store[COLLECTIONS.adviserDepartment];

describe("department transfers", () => {
  it("asks the current owner and notifies them", async () => {
    const response = await ask();
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      departmentId: "dept-1",
      departmentCode: "CT",
      status: "PENDING",
      requesterName: "Requester",
      ownerName: "Owner",
      ownerActive: true,
      yearLevels: ["FIRST"],
    });
    const row = context.store[COLLECTIONS.departmentTransferRequest][0]!;
    expect(row.status).toBe("PENDING");
    expect(
      context.store[COLLECTIONS.notification].find(
        (n) => n.type === "DEPARTMENT_TRANSFER_REQUESTED",
      ),
    ).toMatchObject({ userId: "adv1" });
  });

  it("hands the whole department over when every level is accepted", async () => {
    const created = (
      await (await ask({ yearLevels: ["FIRST", "SECOND"] })).json()
    ).data;
    holder.session = OWNER;
    const response = await call(`/transfers/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ accept: true }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      status: "ACCEPTED",
      transferredFromName: "Owner",
    });

    // Every level moved, so the owner's department assignment is gone.
    expect(links().some((row) => row._id === "link-owner")).toBe(false);
    expect(
      links().find(
        (row) => row.adviserId === "adv2" && row.departmentId === "dept-1",
      ),
    ).toMatchObject({ yearLevels: ["FIRST", "SECOND"] });
    // Their queue closes and the student they were serving returns to the line.
    expect(context.store[COLLECTIONS.adviserAvailability][0]).toMatchObject({
      isOpen: false,
    });
    expect(context.store[COLLECTIONS.enrollmentQueue][0]).toMatchObject({
      status: "WAITING",
      servedById: null,
    });
  });

  it("leaves the other levels with the previous owner", async () => {
    const created = (await (await ask()).json()).data;
    holder.session = OWNER;
    await call(`/transfers/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ accept: true }),
    });
    expect(links().find((row) => row._id === "link-owner")).toMatchObject({
      yearLevels: ["SECOND"],
    });
    // Still owning levels means their queue stays open and serving.
    expect(context.store[COLLECTIONS.adviserAvailability][0]).toMatchObject({
      isOpen: true,
    });
  });

  it("keeps the queue when the owner declines", async () => {
    const created = (await (await ask()).json()).data;
    holder.session = OWNER;
    const response = await call(`/transfers/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ accept: false }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      status: "DECLINED",
      transferredFromName: null,
    });
    expect(links().find((row) => row._id === "link-owner")).toMatchObject({
      yearLevels: ["FIRST", "SECOND"],
    });
    expect(links().some((row) => row.adviserId === "adv2")).toBe(false);
  });

  it("takes over the named levels and drops the taker's old assignments", async () => {
    holder.session = THIRD;
    const response = await call("/departments/dept-1/takeover", {
      method: "POST",
      body: JSON.stringify({ yearLevels: ["FIRST"] }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      departmentId: "dept-1",
      code: "CT",
      transferredFromName: "Owner",
    });
    expect(links().find((row) => row._id === "link-owner")).toMatchObject({
      yearLevels: ["SECOND"],
    });
    expect(links().find((row) => row.adviserId === "adv3")).toMatchObject({
      departmentId: "dept-1",
      yearLevels: ["FIRST"],
    });
    // Taking over one department releases the taker's other departments.
    expect(links().filter((row) => row.adviserId === "adv3").length).toBe(1);
  });

  it("transfers automatically when the request expires unanswered", async () => {
    // Owner offline → one-minute grace.
    context.store[COLLECTIONS.adviserAvailability] = [];
    const created = (await (await ask()).json()).data;
    const row = context.store[COLLECTIONS.departmentTransferRequest][0]!;
    expect(new Date(row.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      new Date(created.expiresAt).getTime(),
    );
    row.expiresAt = new Date(Date.now() - 1000);

    const response = await call("/transfers");
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.outgoing[0]).toMatchObject({ status: "AUTO_TRANSFERRED" });
    expect(
      links().find(
        (r) => r.adviserId === "adv2" && r.departmentId === "dept-1",
      ),
    ).toMatchObject({ yearLevels: ["FIRST"] });
  });

  it("refuses a level the department does not offer", async () => {
    const response = await ask({ yearLevels: ["FOURTH"] });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "College of Technologies doesn't offer 4th Year.",
    );
  });
});
