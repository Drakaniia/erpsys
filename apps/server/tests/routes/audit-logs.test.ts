import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { auditTrail } from "../../src/middleware/audit.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  store: {} as Record<string, Row[]>,
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

const admin = {
  user: {
    id: "admin1",
    name: "Ada Admin",
    email: "admin@buksu.edu.ph",
    role: "ADMIN",
  },
};

let url = "";
let close: () => Promise<void>;

beforeEach(async () => {
  holder.session = admin;
  const fake = fakeDb({
    [COLLECTIONS.requirementItem]: [
      { _id: "req-1", label: "Report Card", order: 0, isActive: true },
    ],
    [COLLECTIONS.adminActionLog]: [],
    [COLLECTIONS.auditLog]: [],
  });
  holder.db = fake.db;
  holder.store = fake.store;
  vi.spyOn(console, "error").mockImplementation(() => {});
  const app = express();
  app.use(express.json());
  app.use("/api/v1", auditTrail, v1Router);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(async () => {
  await close();
  vi.restoreAllMocks();
});

describe("audit trail", () => {
  it("records a signed-in write with actor, role and a query-free path", async () => {
    const response = await fetch(`${url}/api/v1/requirements/req-1?x=secret`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Form 138" }),
    });
    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(holder.store[COLLECTIONS.auditLog]).toHaveLength(1),
    );
    expect(holder.store[COLLECTIONS.auditLog][0]).toMatchObject({
      actorId: "admin1",
      actorName: "Ada Admin",
      role: "ADMIN",
      method: "PATCH",
      path: "/api/v1/requirements/req-1",
      status: 200,
    });
  });

  it("skips reads and anonymous calls", async () => {
    await fetch(`${url}/api/v1/requirements`);
    holder.session = null;
    await fetch(`${url}/api/v1/requirements/req-1`, { method: "DELETE" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(holder.store[COLLECTIONS.auditLog]).toHaveLength(0);
  });
});

describe("GET /api/v1/audit-logs", () => {
  beforeEach(() => {
    holder.store[COLLECTIONS.auditLog].push(
      {
        _id: "a1",
        actorId: "s1",
        actorName: "Sam",
        actorEmail: "sam@student.buksu.edu.ph",
        role: "STUDENT",
        method: "POST",
        path: "/api/v1/me/queue",
        status: 201,
        ip: "",
        at: new Date("2026-01-01T00:00:00Z"),
      },
      {
        _id: "a2",
        actorId: "admin1",
        actorName: "Ada Admin",
        actorEmail: "admin@buksu.edu.ph",
        role: "ADMIN",
        method: "DELETE",
        path: "/api/v1/requirements/req-9",
        status: 200,
        ip: "",
        at: new Date("2026-01-02T00:00:00Z"),
      },
    );
  });

  it("lists newest first and filters by role, method and text", async () => {
    const all = await (await fetch(`${url}/api/v1/audit-logs`)).json();
    expect(all.data.map((r: Row) => r.id)).toEqual(["a2", "a1"]);
    expect(all.total).toBe(2);

    const students = await (
      await fetch(`${url}/api/v1/audit-logs?role=STUDENT`)
    ).json();
    expect(students.data.map((r: Row) => r.id)).toEqual(["a1"]);

    const deletes = await (
      await fetch(`${url}/api/v1/audit-logs?method=DELETE&q=req-9`)
    ).json();
    expect(deletes.data.map((r: Row) => r.id)).toEqual(["a2"]);
  });

  it("refuses non-admins", async () => {
    holder.session = { user: { ...admin.user, role: "STUDENT" } };
    const response = await fetch(`${url}/api/v1/audit-logs`);
    expect(response.status).toBe(403);
  });
});
