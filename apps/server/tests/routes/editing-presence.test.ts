import express from "express";
import type { AddressInfo } from "node:net";
import type { Db } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { guardDb } from "../../src/lib/db/timestamp-ordering.js";
import { sweepPresence } from "../../src/lib/db/editing-presence.js";
import { timestampOrdering } from "../../src/middleware/timestamp.js";
import { auditTrail } from "../../src/middleware/audit.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../src/config/auth.js", () => ({ auth: { api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-test-user");
  return id ? { user: { id, name: id, email: `${id}@test.invalid`, role: id.startsWith("admin") ? "ADMIN" : id === "officer" ? "SBO_OFFICER" : "STUDENT" } } : null;
} } } }));
vi.mock("../../src/lib/db/db.js", async (original) => ({ ...(await original<typeof import("../../src/lib/db/db.js")>()), getDbSync: () => holder.db }));

let context: ReturnType<typeof fakeDb>;
let server: ReturnType<express.Express["listen"]>;
let url: string;
beforeEach(async () => {
  context = fakeDb({
    [COLLECTIONS.academicYear]: [{ _id: "year1", isActive: true }],
    [COLLECTIONS.department]: [{ _id: "dept1", name: "Science", readTs: 12, writeTs: 10, updatedAt: new Date(0) }],
    [COLLECTIONS.studentProfile]: [{ _id: "profile1", userId: "student1" }],
  });
  holder.db = guardDb(context.db as unknown as Db);
  const app = express();
  app.use(express.json());
  app.use("/api/v1", timestampOrdering, auditTrail, v1Router);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/editing-presence`;
});
afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
const call = (path: string, method = "GET", user = "admin1", body?: object) => fetch(url + path, {
  method, headers: { "x-test-user": user, "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("editing presence", () => {
  it("preserves simultaneous editors and independently removes one user's tab", async () => {
    const results = await Promise.all([
      call("/department/dept1/tab-a", "PUT", "admin1"),
      call("/department/dept1/tab-b", "PUT", "admin2"),
      call("/department/dept1/tab-c", "PUT", "admin1"),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const read = await (await call("/department/dept1")).json();
    expect(read.data.editors).toHaveLength(3);
    // The same editorId from another user must not remove this user's lease.
    await call("/department/dept1/tab-a", "DELETE", "admin2");
    expect((await (await call("/department/dept1")).json()).data.editors).toHaveLength(3);
    await call("/department/dept1/tab-a", "DELETE", "admin1");
    expect((await (await call("/department/dept1")).json()).data.editors.map((e: { editorId: string }) => e.editorId).sort()).toEqual(["tab-b", "tab-c"]);
    expect(context.store[COLLECTIONS.editingPresence]).toHaveLength(1);
  });
  it("renews a lease without duplication or business timestamp/audit changes", async () => {
    const before = structuredClone(context.store[COLLECTIONS.department]);
    await call("/department/dept1/tab-a", "PUT");
    await call("/department/dept1/tab-a", "PUT");
    await call("/department/dept1");
    const row = context.store[COLLECTIONS.editingPresence][0];
    expect(row.editors).toHaveLength(1);
    expect(row.readTs).toBeUndefined();
    expect(row.writeTs).toBeUndefined();
    expect(context.store[COLLECTIONS.department]).toEqual(before);
    expect(context.store[COLLECTIONS.auditLog] ?? []).toHaveLength(0);
  });
  it("filters expired editors and sweeps expired array members", async () => {
    await call("/department/dept1/tab-a", "PUT");
    const row = context.store[COLLECTIONS.editingPresence][0];
    (row.editors as { expiresAt: Date }[])[0].expiresAt = new Date(0);
    expect((await (await call("/department/dept1")).json()).data.editors).toEqual([]);
    expect((await (await call("")).json()).total).toBe(0);
    await sweepPresence(holder.db as Db);
    expect(context.store[COLLECTIONS.editingPresence]).toHaveLength(0);
  });
  it("requires session, allowlisted resources, record access and admin overview", async () => {
    expect((await call("/department/dept1", "GET", "")).status).toBe(401);
    expect((await call("/session/secret/tab", "PUT")).status).toBe(400);
    expect((await call("/department/dept1/tab", "PUT", "student1")).status).toBe(403);
    expect((await call("/department/missing/tab", "PUT")).status).toBe(404);
    expect((await call("", "GET", "student1")).status).toBe(403);
    expect((await call("/student-profile/me/tab", "PUT", "student1")).status).toBe(200);
    expect((await call("/student-profile/profile1/tab", "PUT", "student2")).status).toBe(403);
    expect((await call("/department/dept1/tab", "PUT", "admin1", { userId: "other" })).status).toBe(400);
  });
});
