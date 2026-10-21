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
vi.mock("../../src/lib/google/forms.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/google/forms.js")>()),
  createForm: vi.fn(async () => ({
    formId: "gf-1",
    responderUri: "https://docs.google.com/forms/d/e/gf-1/viewform",
  })),
}));

const ADMIN = {
  user: { id: "admin1", email: "admin@buksu.edu.ph", role: "ADMIN" },
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
      {
        _id: "ay-2",
        label: "2026-2027",
        semesterLabel: "First",
        isActive: false,
        createdAt: new Date("2026-06-01"),
      },
    ],
    [COLLECTIONS.enrollmentQueue]: [],
    [COLLECTIONS.stepVerification]: [],
    [COLLECTIONS.profilingForm]: [],
    [COLLECTIONS.adminActionLog]: [],
    [COLLECTIONS.socialMediaLink]: [
      {
        _id: "sml-1",
        name: "Facebook",
        url: "https://fb.test",
        order: 1,
        isActive: true,
      },
    ],
    [COLLECTIONS.chatbotKnowledge]: [],
    [COLLECTIONS.integrationSetting]: [],
    [COLLECTIONS.adminStepUp]: [
      {
        _id: "admin1",
        unlockedUntil: new Date(Date.now() + 60 * 60_000),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    ],
    [COLLECTIONS.user]: [
      {
        _id: "admin1",
        name: "Admin",
        email: "admin@buksu.edu.ph",
        role: "ADMIN",
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
  holder.session = ADMIN;
  context = fakeDb(seed());
  holder.db = context.db;
  vi.spyOn(console, "error").mockImplementation(() => {});
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

describe("academic years", () => {
  it("blocks activation while the current year still has an open queue", async () => {
    context.store[COLLECTIONS.enrollmentQueue].push({
      _id: "q1",
      academicYearId: "ay-1",
      departmentId: "dept-1",
      status: "WAITING",
    });
    context.store[COLLECTIONS.department] = [
      { _id: "dept-1", name: "COT", isActive: true },
    ];

    const response = await call("/academic-years/ay-2/activation", {
      method: "POST",
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("still has 1 student");
  });

  it("creates and activates a year", async () => {
    const response = await call("/academic-years", {
      method: "POST",
      body: JSON.stringify({
        label: "2026-2027",
        semesterLabel: "First",
        activate: true,
      }),
    });
    expect(response.status).toBe(201);
    const years = context.store[COLLECTIONS.academicYear];
    expect(years.find((y) => y._id === "ay-1")?.isActive).toBe(false);
    expect(years.filter((y) => y.isActive)).toHaveLength(1);
  });

  it("refuses to delete a year that holds records", async () => {
    context.store[COLLECTIONS.profilingForm].push({
      _id: "form-1",
      academicYearId: "ay-1",
      fields: [],
      updatedAt: new Date(),
    });
    const response = await call("/academic-years/ay-1", { method: "DELETE" });
    expect(response.status).toBe(409);
  });
});

describe("content", () => {
  const create = (title: string) =>
    call("/profiling-form", {
      method: "POST",
      body: JSON.stringify({ title }),
    });

  it("creates the year's Google Form, shares it with the caller, and reads it back", async () => {
    const { createForm } = await import("../../src/lib/google/forms.js");
    const saved = await create(" Student Profiling ");
    expect(saved.status).toBe(201);
    expect(createForm).toHaveBeenCalledWith(
      "Student Profiling",
      "admin@buksu.edu.ph",
    );

    const read = (await (await call("/profiling-form")).json()).data;
    expect(read).toMatchObject({
      formId: "gf-1",
      title: "Student Profiling",
      responderUri: "https://docs.google.com/forms/d/e/gf-1/viewform",
      editUrl: "https://docs.google.com/forms/d/gf-1/edit",
      updatedByName: "Admin",
    });

    // A second create would orphan the first form's responses.
    expect((await create("Again")).status).toBe(409);
  });

  it("unlinks the form", async () => {
    await create("Student Profiling");
    const removed = await call("/profiling-form", { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect((await (await call("/profiling-form")).json()).data).toBeNull();
  });

  it("refuses to create the form while Google Forms is turned off", async () => {
    const toggle = (enabled: boolean) =>
      call("/integrations/googleForms", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
    expect((await toggle(false)).status).toBe(200);
    // The admin switch must stop the Forms API call, not just hide a button.
    expect((await create("Student Profiling")).status).toBe(503);
    // Flags are cached per process; turn it back on so later tests see the default.
    expect((await toggle(true)).status).toBe(200);
  });

  it("rejects a blank title", async () => {
    expect((await create("  ")).status).toBe(400);
  });

  it("requires an active year to create the form", async () => {
    context.store[COLLECTIONS.academicYear][0]!.isActive = false;
    expect((await create("Student Profiling")).status).toBe(412);
  });

  it("appends a social link and reorders the list", async () => {
    const created = await call("/social-links", {
      method: "POST",
      body: JSON.stringify({ name: "Instagram", url: "https://ig.test" }),
    });
    expect(created.status).toBe(201);
    const createdId = (await created.json()).data.id as string;

    const reordered = await call("/social-links/order", {
      method: "PUT",
      body: JSON.stringify({ orderedIds: [createdId, "sml-1"] }),
    });
    expect(reordered.status).toBe(200);

    const list = await (await call("/social-links")).json();
    expect(list.data.map((l: Row) => l.id)).toEqual([createdId, "sml-1"]);
  });

  it("bumps the knowledge doc version", async () => {
    await call("/chatbot-knowledge", {
      method: "PUT",
      body: JSON.stringify({ content: "first" }),
    });
    const second = await call("/chatbot-knowledge", {
      method: "PUT",
      body: JSON.stringify({ content: "second" }),
    });
    expect((await second.json()).data.version).toBe(2);
  });

  it("serves signup options publicly", async () => {
    holder.session = null;
    context.store[COLLECTIONS.department] = [
      { _id: "dept-1", name: "College of Technologies", isActive: true },
      { _id: "dept-2", name: "Inactive", isActive: false },
    ];
    const body = await (await call("/signup-options")).json();
    expect(body.data.academicYears).toHaveLength(2);
    expect(body.data.departments.map((d: Row) => d.name)).toEqual([
      "College of Technologies",
    ]);
  });
});

describe("integrations", () => {
  it("answers booleans when signed out and rows for an admin", async () => {
    holder.session = null;
    const anon = await (await call("/integrations")).json();
    expect(anon.data.flags).toEqual({
      turnstile: true,
      r2: true,
      googleAuth: expect.any(Boolean),
      cloudflareChat: true,
      email: true,
      googleForms: true,
      googleCalendar: expect.any(Boolean),
    });
    expect(typeof anon.data.turnstileSiteKey).toBe("string");
    expect(anon.data.overridesLoaded).toBe(true);
    expect(anon.data.credentials).toBeUndefined();

    holder.session = ADMIN;
    const admin = await (await call("/integrations")).json();
    expect(admin.data.map((row: Row) => row.key)).toEqual([
      "googleAuth",
      "googleForms",
      "googleCalendar",
      "turnstile",
      "r2",
      "cloudflareChat",
      "email",
    ]);
    const google = admin.data[0];
    expect(google.version).toBe(0);
    expect(google.pendingRestart).toBe(false);
    expect(google.credentials.map((f: Row) => f.envKey)).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]);
    expect(google.credentials[0].source).not.toBe("stored");
  });

  it("toggles a known key and rejects an unknown one", async () => {
    const toggled = await call("/integrations/r2", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    expect(toggled.status).toBe(200);
    expect((await toggled.json()).data).toEqual({ key: "r2", enabled: false });
    expect(context.store[COLLECTIONS.adminActionLog]).toHaveLength(1);

    const unknown = await call("/integrations/sms", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    expect(unknown.status).toBe(404);
  });
});
