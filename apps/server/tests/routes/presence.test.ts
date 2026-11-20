import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { guardDb } from "../../src/lib/db/timestamp-ordering.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { timestampOrdering } from "../../src/middleware/timestamp.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({
  session: null as unknown,
  db: null as unknown,
  raw: null as unknown,
}));
vi.mock("../../src/config/auth.js", () => ({
  auth: { api: { getSession: async () => holder.session } },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/db/db.js")>()),
  getDbSync: () => holder.db,
  rawDb: () => holder.raw,
}));

const lease1 = "11111111-1111-4111-8111-111111111111";
const lease2 = "22222222-2222-4222-8222-222222222222";
const lease3 = "33333333-3333-4333-8333-333333333333";
const updatedAt = new Date("2025-01-01");
const actor = (role = "ADMIN", id = "admin1", name = "Ada") => ({
  user: { id, role, name, email: `${id}@example.com` },
});
function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.academicYear]: [
      { _id: "year1", isActive: true, updatedAt, readTs: 40, writeTs: 30 },
    ],
    [COLLECTIONS.department]: [
      {
        _id: "dept1",
        name: "Science",
        code: "SCI",
        isActive: true,
        advisers: [{ adviserId: "adv1", yearLevels: ["FIRST"] }],
      },
      { _id: "dept2", name: "Arts", code: "ART", isActive: true, advisers: [] },
    ],
    [COLLECTIONS.user]: [
      { _id: "adv1", role: "ENROLLMENT_ADVISER" },
      { _id: "adv2", role: "ENROLLMENT_ADVISER" },
      { _id: "officer1", role: "SBO_OFFICER" },
      { _id: "user1", role: "STUDENT" },
    ],
    [COLLECTIONS.content]: [
      { _id: "req1", kind: "requirement", updatedAt, readTs: 50, writeTs: 20 },
      { _id: "link1", kind: "socialLink" },
    ],
    [COLLECTIONS.stepVerification]: [
      { _id: "sub1", academicYearId: "year1", stepId: "PROFILING" },
      { _id: "old", academicYearId: "year0", stepId: "PROFILING" },
      { _id: "enrolled", academicYearId: "year1", stepId: "ENROLLMENT" },
    ],
    [COLLECTIONS.enrollmentQueue]: [
      {
        _id: "queue1",
        studentProfileId: "profile1",
        academicYearId: "year1",
        departmentId: "dept1",
        servedById: "adv1",
        status: "IN_PROGRESS",
      },
      {
        _id: "otherQueue",
        studentProfileId: "profile1",
        academicYearId: "year1",
        departmentId: "dept1",
        servedById: "adv2",
        status: "IN_PROGRESS",
      },
    ],
    [COLLECTIONS.studentEnrollment]: [
      {
        _id: "enrollment1",
        studentProfileId: "profile1",
        academicYearId: "year1",
        departmentId: "dept1",
        yearLevel: "FIRST",
      },
    ],
    [COLLECTIONS.adviserSchedule]: [
      {
        _id: "schedule1",
        adviserId: "adv1",
        departmentId: "dept1",
        academicYearId: "year1",
        kind: "window",
      },
    ],
    [COLLECTIONS.departmentTransferRequest]: [
      {
        _id: "transfer1",
        departmentId: "dept1",
        requesterId: "adv2",
        ownerId: "adv1",
      },
    ],
    [COLLECTIONS.integrationSetting]: [{ _id: "integration1", key: "r2" }],
    [COLLECTIONS.chatbotKnowledge]: [{ _id: "knowledge1", updatedAt }],
  };
}
let context: ReturnType<typeof fakeDb>;
let base: string;
let close: () => Promise<void>;
beforeEach(async () => {
  holder.session = actor();
  context = fakeDb(seed());
  holder.raw = context.db;
  holder.db = guardDb(context.db as never);
  const app = express();
  app.use(express.json());
  app.use("/api/v1", timestampOrdering, v1Router);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/presence`;
  close = () => new Promise<void>((resolve) => server.close(() => resolve()));
});
afterEach(async () => {
  await close();
  vi.restoreAllMocks();
});
async function call(body: unknown, method = "POST") {
  const response = await fetch(base, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get("cache-control"),
  };
}
const touch = (resource: string, id?: string, leaseId = lease1) =>
  call({ resource, id, leaseId });
const scope = (resource: string, value?: string, leaseId = lease1) =>
  call({ resource, scope: value, leaseId });
const editors = (collection: string, id: string) =>
  context.store[collection].find((row) => row._id === id)
    ?.activeEditors as Row[];

describe("presence leases", () => {
  it("gives the first tab ownership, blocks same-user tabs, and trusts only the session identity", async () => {
    expect((await touch("requirement", "req1", lease1)).body.data).toEqual([]);
    expect((await touch("requirement", "req1", lease2)).body.data).toEqual([
      { userId: "admin1", name: "Ada", expiresAt: expect.any(String) },
    ]);
    holder.session = actor("ADMIN", "admin2", "$name");
    const joined = await call({
      resource: "requirement",
      id: "req1",
      leaseId: lease3,
      userId: "forged",
      name: "forged",
    });
    expect(joined.status).toBe(200);
    expect(joined.body.data).toEqual([
      { userId: "admin1", name: "Ada", expiresAt: expect.any(String) },
    ]);
    expect(joined.body.ts).toBeUndefined();
    expect(joined.cache).toBe("no-store");
    expect(editors(COLLECTIONS.content, "req1")).toHaveLength(3);
    expect(editors(COLLECTIONS.content, "req1")[2]).toMatchObject({
      userId: "admin2",
      name: "$name",
      leaseId: lease3,
    });
    expect(joined.body.data[0].leaseId).toBeUndefined();
  });

  it("uses literal strings even when authenticated ids and names look like Mongo expressions", async () => {
    holder.session = actor("ADMIN", "$userId", "$$ROOT.name");
    expect((await touch("requirement", "req1")).status).toBe(200);
    expect(editors(COLLECTIONS.content, "req1")[0]).toMatchObject({
      userId: "$userId",
      name: "$$ROOT.name",
    });
    await touch("requirement", "req1");
    expect(editors(COLLECTIONS.content, "req1")).toHaveLength(1);
  });

  it("renews to a 30-second lease and cleans expired entries without touching business timestamps", async () => {
    const row = context.store[COLLECTIONS.content][0];
    row.activeEditors = [
      {
        userId: "stale",
        name: "Old",
        leaseId: lease2,
        expiresAt: new Date(Date.now() - 1),
      },
    ];
    const before = Date.now();
    await touch("requirement", "req1");
    const list = editors(COLLECTIONS.content, "req1");
    expect(list).toHaveLength(1);
    expect((list[0].expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + 30_000,
    );
    expect((list[0].expiresAt as Date).getTime()).toBeLessThanOrEqual(
      Date.now() + 30_000,
    );
    expect(row).toMatchObject({ updatedAt, readTs: 50, writeTs: 20 });
    expect(context.store[COLLECTIONS.academicYear][0]).toMatchObject({
      readTs: 40,
      writeTs: 30,
    });
  });

  it("removes only the caller's tab, retaining other users and other same-user tabs", async () => {
    await touch("requirement", "req1", lease1);
    await touch("requirement", "req1", lease2);
    holder.session = actor("ADMIN", "admin2");
    await touch("requirement", "req1", lease3);
    await call(
      { resource: "requirement", id: "req1", leaseId: lease1 },
      "DELETE",
    );
    expect(editors(COLLECTIONS.content, "req1")).toHaveLength(3);
    holder.session = actor();
    const left = await call(
      { resource: "requirement", id: "req1", leaseId: lease1 },
      "DELETE",
    );
    expect(left.body.data).toEqual([
      { userId: "admin1", name: "Ada", expiresAt: expect.any(String) },
    ]);
    expect(editors(COLLECTIONS.content, "req1").map((e) => e.leaseId)).toEqual([
      lease2,
      lease3,
    ]);
    expect(context.store[COLLECTIONS.content][0]).toMatchObject({
      updatedAt,
      readTs: 50,
      writeTs: 20,
    });
  });

  it("bounds the active array to 100 leases without evicting the earliest editor", async () => {
    context.store[COLLECTIONS.content][0].activeEditors = Array.from(
      { length: 120 },
      (_, index) => ({
        userId: `other${index}`,
        name: "Other",
        leaseId: `tab${index}`,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    expect((await touch("requirement", "req1")).status).toBe(200);
    const list = editors(COLLECTIONS.content, "req1");
    expect(list).toHaveLength(100);
    expect(list[0]).toMatchObject({ userId: "other0", leaseId: "tab0" });
    expect(list.at(-1)).toMatchObject({ userId: "other99", leaseId: "tab99" });
  });

  it("keeps first-arrival order through renewals and promotes waiting tabs on release or expiry", async () => {
    await touch("requirement", "req1", lease1);
    holder.session = actor("ADMIN", "admin2", "Bob");
    await touch("requirement", "req1", lease2);
    holder.session = actor("ADMIN", "admin3", "Carol");
    await touch("requirement", "req1", lease3);
    holder.session = actor();
    expect((await touch("requirement", "req1", lease1)).body.data).toEqual([]);
    expect(
      editors(COLLECTIONS.content, "req1").map((entry) => entry.leaseId),
    ).toEqual([lease1, lease2, lease3]);
    await call(
      { resource: "requirement", id: "req1", leaseId: lease1 },
      "DELETE",
    );
    holder.session = actor("ADMIN", "admin2", "Bob");
    expect((await touch("requirement", "req1", lease2)).body.data).toEqual([]);
    editors(COLLECTIONS.content, "req1")[0].expiresAt = new Date(
      Date.now() - 1,
    );
    holder.session = actor("ADMIN", "admin3", "Carol");
    expect((await touch("requirement", "req1", lease3)).body.data).toEqual([]);
    holder.session = actor("ADMIN", "admin2", "Bob");
    expect((await touch("requirement", "req1", lease2)).body.data).toEqual([
      { userId: "admin3", name: "Carol", expiresAt: expect.any(String) },
    ]);
  });

  it("elects one owner when tabs arrive together", async () => {
    const results = await Promise.all([
      touch("department", "dept1", lease1),
      touch("department", "dept1", lease2),
    ]);
    expect(results.map((result) => result.body.data.length).sort()).toEqual([
      0, 1,
    ]);
    expect(editors(COLLECTIONS.department, "dept1")).toHaveLength(2);
  });

  it("rejects missing records on join and leave, and validates the input contract", async () => {
    for (const method of ["POST", "DELETE"])
      expect(
        (
          await call(
            { resource: "user", id: "missing", leaseId: lease1 },
            method,
          )
        ).status,
      ).toBe(404);
    for (const body of [
      { resource: "session", leaseId: lease1 },
      { resource: "requirement", leaseId: "bad" },
      { resource: "requirement" },
      { resource: "user", scope: "$bad", leaseId: lease1 },
      { resource: "user", scope: "x".repeat(121), leaseId: lease1 },
      { resource: "user", id: "user1", scope: "new", leaseId: lease1 },
      { resource: "user", id: "@edit-presence:user:new", leaseId: lease1 },
    ])
      expect((await call(body)).status).toBe(400);
    holder.session = null;
    expect((await touch("requirement", "req1")).status).toBe(401);
  });
});

describe("exclusive mutation access", () => {
  async function rename(leaseIds?: string[], ts?: number) {
    const response = await fetch(
      base.replace(/presence$/, "departments/dept1"),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(leaseIds ? { "x-edit-leases": JSON.stringify(leaseIds) } : {}),
        },
        body: JSON.stringify({ name: "Engineering", ...(ts ? { ts } : {}) }),
      },
    );
    return { status: response.status, body: await response.json() };
  }

  it("rejects waiting tabs and requests without the owner lease, including same-account tabs", async () => {
    await touch("department", "dept1", lease1);
    await touch("department", "dept1", lease2);
    for (const leaseIds of [undefined, [], [lease2]]) {
      const result = await rename(leaseIds);
      expect(result.status).toBe(409);
      expect(result.body.data.code).toBe("EDIT_LOCKED");
    }
    holder.session = actor("ADMIN", "admin2", "Bob");
    expect((await rename([lease1])).status).toBe(409);
    expect(context.store[COLLECTIONS.department][0].name).toBe("Science");
    holder.session = actor();
    expect((await rename([lease1])).status).toBe(200);
    expect(context.store[COLLECTIONS.department][0].name).toBe("Engineering");
  });

  it("promotes the next tab for saves and still rejects stale timestamp writes", async () => {
    await touch("department", "dept1", lease1);
    await touch("department", "dept1", lease2);
    await call(
      { resource: "department", id: "dept1", leaseId: lease1 },
      "DELETE",
    );
    expect((await rename([lease1])).status).toBe(409);
    expect((await rename([lease2])).status).toBe(200);
    const row = context.store[COLLECTIONS.department][0];
    const stale = await rename([lease2], Number(row.writeTs) - 1);
    expect(stale.status).toBe(409);
    expect(stale.body.data.code).toBe("TS_ABORTED");
  });

  it("preflights every batch target before mutating any account", async () => {
    await touch("user", "user1", lease1);
    holder.session = actor("ADMIN", "admin2", "Bob");
    const response = await fetch(base.replace(/presence$/, "users"), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-edit-leases": JSON.stringify([lease2]),
      },
      body: JSON.stringify({ userIds: ["officer1", "user1"], role: "STUDENT" }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).data.code).toBe("EDIT_LOCKED");
    expect(
      context.store[COLLECTIONS.user].find((row) => row._id === "officer1")
        ?.role,
    ).toBe("SBO_OFFICER");
  });

  it("enforces ownership on case-insensitive business route matches", async () => {
    await touch("department", "dept1", lease1);
    const response = await fetch(
      base.replace(/presence$/, "DEPARTMENTS/dept1"),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Engineering" }),
      },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).data.code).toBe("EDIT_LOCKED");
  });

  it("protects existing schedule-row leases when replacing the aggregate", async () => {
    holder.session = actor("ENROLLMENT_ADVISER", "adv1");
    await touch("schedule", "schedule1", lease1);
    const response = await fetch(base.replace(/presence$/, "me/schedule"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId: "dept1", windows: [] }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).data.code).toBe("EDIT_LOCKED");
  });

  it("protects an academic year from another admin's save", async () => {
    await touch("academic-year", "year1", lease1);
    holder.session = actor("ADMIN", "admin2", "Bob");
    const response = await fetch(
      base.replace(/presence$/, "academic-years/year1"),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "2026–2027" }),
      },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).data.code).toBe("EDIT_LOCKED");
  });

  it("protects collection creation scopes and rejects malformed lease headers", async () => {
    await scope("department", undefined, lease1);
    const url = base.replace(/presence$/, "departments");
    const create = (header?: string) =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(header ? { "x-edit-leases": header } : {}),
        },
        body: JSON.stringify({ name: "Engineering" }),
      });
    expect((await create(JSON.stringify([lease2]))).status).toBe(409);
    expect((await create("not-json")).status).toBe(400);
    expect((await create(JSON.stringify([lease1]))).status).toBe(201);
  });
});

describe("presence authorization", () => {
  it.each(["STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER"])(
    "denies %s on admin-only resources",
    async (role) => {
      holder.session = actor(role);
      for (const [resource, id] of [
        ["academic-year", "year1"],
        ["user", "user1"],
        ["requirement", "req1"],
        ["chatbot-knowledge", "knowledge1"],
        ["integration", "integration1"],
      ])
        expect((await touch(resource, id)).status).toBe(403);
    },
  );

  it("limits officer submissions to active-year pre-enrollment steps and checks content kinds", async () => {
    holder.session = actor("SBO_OFFICER", "officer1");
    expect((await touch("submission", "sub1")).status).toBe(200);
    for (const id of ["old", "enrolled", "missing"])
      expect((await touch("submission", id)).status).toBe(404);
    expect((await touch("social-link", "link1")).status).toBe(200);
    expect((await touch("social-link", "req1")).status).toBe(404);
    expect((await scope("profiling-form")).status).toBe(200);
    expect((await scope("stamp")).status).toBe(200);
    expect(editors(COLLECTIONS.user, "officer1")).toHaveLength(1);
    expect((await touch("stamp", "adv1")).status).toBe(403);
    expect((await scope("profiling-form", "year0")).status).toBe(403);
    expect(editors(COLLECTIONS.academicYear, "year1")).toHaveLength(1);
  });

  it("checks instructor department assignment, queue ownership, levels, schedules and transfer participation", async () => {
    holder.session = actor("ENROLLMENT_ADVISER", "adv1");
    for (const [resource, id] of [
      ["department", "dept1"],
      ["queue-entry", "queue1"],
      ["schedule", "schedule1"],
      ["transfer", "transfer1"],
    ])
      expect((await touch(resource, id)).status).toBe(200);
    expect((await touch("department", "dept2")).status).toBe(403);
    expect((await touch("queue-entry", "otherQueue")).status).toBe(403);
    context.store[COLLECTIONS.studentEnrollment][0].yearLevel = "SECOND";
    expect((await touch("queue-entry", "queue1")).status).toBe(403);
    holder.session = actor("ENROLLMENT_ADVISER", "adv2");
    expect((await touch("schedule", "schedule1")).status).toBe(403);
    expect((await touch("transfer", "transfer1")).status).toBe(200);
    holder.session = actor("ENROLLMENT_ADVISER", "outsider");
    expect((await touch("transfer", "transfer1")).status).toBe(403);
  });

  it("uses queue ids for enrollment reverts and permits assigned advisers other than the serving owner", async () => {
    holder.session = actor("ENROLLMENT_ADVISER", "adv1");
    const row = context.store[COLLECTIONS.enrollmentQueue][0];
    row.status = "COMPLETED";
    row.servedById = "adv2";
    expect((await touch("enrollment", "queue1")).status).toBe(200);
    expect(editors(COLLECTIONS.enrollmentQueue, "queue1")).toHaveLength(1);
    expect((await touch("enrollment", "enrollment1")).status).toBe(404);
    context.store[COLLECTIONS.studentEnrollment][0].yearLevel = "SECOND";
    expect((await touch("enrollment", "queue1")).status).toBe(403);
    context.store[COLLECTIONS.studentEnrollment][0].yearLevel = "FIRST";
    row.status = "IN_PROGRESS";
    expect((await touch("enrollment", "queue1")).status).toBe(403);
    expect((await touch("queue-entry", "queue1")).status).toBe(403);
  });

  it("allows instructor self mapping but not mapping another instructor, stored in department", async () => {
    holder.session = actor("ENROLLMENT_ADVISER", "adv1");
    expect((await touch("adviser", "adv1")).status).toBe(200);
    expect((await touch("adviser", "adv2")).status).toBe(403);
    expect(
      context.store[COLLECTIONS.department].some(
        (row) => row._id === "@edit-presence:adviser:adv1",
      ),
    ).toBe(true);
    expect(context.store[COLLECTIONS.user][0].activeEditors).toBeUndefined();
    holder.session = actor();
    expect((await touch("adviser", "adv2")).status).toBe(200);
    expect((await touch("adviser", "user1")).status).toBe(404);
  });
});

describe("collection-owned creation and shared scopes", () => {
  it("creates isolated markers in owning collections and reserves user emails without account roles", async () => {
    expect((await scope("user")).status).toBe(200);
    for (const resource of [
      "user",
      "department",
      "requirement",
      "social-link",
      "academic-year",
    ])
      expect((await scope(resource, "other")).status).toBe(400);
    expect((await scope("requirement")).status).toBe(200);
    const marker = context.store[COLLECTIONS.user].find(
      (row) => row._id === "@edit-presence:user:new",
    )!;
    expect(marker).toMatchObject({
      kind: "edit-presence",
      email: "@edit-presence:user:new@edit-presence.invalid",
    });
    expect(marker.role).toBeUndefined();
    expect(marker.studentProfile).toBeUndefined();
    expect(marker.updatedAt).toBeUndefined();
    expect(marker.readTs).toBeUndefined();
    expect(marker.writeTs).toBeUndefined();
    expect(
      context.store[COLLECTIONS.content].some(
        (row) => row._id === "@edit-presence:requirement:new",
      ),
    ).toBe(true);
    expect(Object.keys(context.store)).not.toContain("presence");
    await scope("user", undefined, lease2);
    expect(editors(COLLECTIONS.user, "@edit-presence:user:new")).toHaveLength(
      2,
    );
    expect(
      (await call({ resource: "user", leaseId: lease1 }, "DELETE")).status,
    ).toBe(200);
    expect(editors(COLLECTIONS.user, "@edit-presence:user:new")).toHaveLength(
      1,
    );
    expect(
      (await call({ resource: "department", leaseId: lease1 }, "DELETE"))
        .status,
    ).toBe(404);
  });

  it("keeps singleton ownership on stable scopes even when a save creates a business record", async () => {
    expect((await scope("integration", "r2")).status).toBe(200);
    expect(
      editors(COLLECTIONS.integrationSetting, "@edit-presence:integration:r2"),
    ).toHaveLength(1);
    expect((await scope("integration", "email")).status).toBe(200);
    expect(
      context.store[COLLECTIONS.integrationSetting].find(
        (row) => row._id === "@edit-presence:integration:email",
      ),
    ).toMatchObject({ key: "@edit-presence:integration:email" });
    expect((await scope("integration", "unknown")).status).toBe(400);
    expect((await scope("chatbot-knowledge", "default")).status).toBe(200);
    expect(
      editors(
        COLLECTIONS.chatbotKnowledge,
        "@edit-presence:chatbot-knowledge:new",
      ),
    ).toHaveLength(1);
    context.store[COLLECTIONS.chatbotKnowledge].push({
      _id: "knowledge2",
      updatedAt: new Date(),
    });
    holder.session = actor("ADMIN", "admin2", "Bob");
    expect(
      (await scope("chatbot-knowledge", undefined, lease2)).body.data[0].userId,
    ).toBe("admin1");
    context.store[COLLECTIONS.integrationSetting].push({
      _id: "email1",
      key: "email",
    });
    expect(
      (await scope("integration", "email", lease2)).body.data[0].userId,
    ).toBe("admin1");
  });

  it("scopes schedule aggregates to authenticated instructor, department and active year", async () => {
    holder.session = actor("ENROLLMENT_ADVISER", "adv1");
    expect((await scope("schedule", "dept1")).status).toBe(200);
    expect(
      context.store[COLLECTIONS.adviserSchedule].some(
        (row) => row._id === "@edit-presence:schedule:year1:adv1:dept1",
      ),
    ).toBe(true);
    expect((await scope("schedule", "dept2")).status).toBe(403);
    expect((await scope("schedule")).status).toBe(400);
    expect((await scope("transfer", "dept2")).status).toBe(200);
    expect((await scope("transfer", "missing")).status).toBe(404);
    expect((await scope("queue-share", "dept1")).status).toBe(200);
    expect((await scope("queue-share", "dept2")).status).toBe(403);
    for (const resource of ["submission", "queue-entry", "enrollment"]) {
      if (resource === "submission")
        holder.session = actor("SBO_OFFICER", "officer1");
      else holder.session = actor("ENROLLMENT_ADVISER", "adv1");
      expect((await scope(resource)).status).toBe(400);
    }
  });
});
