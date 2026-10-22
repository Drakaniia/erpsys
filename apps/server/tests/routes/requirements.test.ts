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

function seed(): Record<string, Row[]> {
  return {
    [COLLECTIONS.requirementItem]: [
      { _id: "req-1", label: "Report Card", order: 0, isActive: true },
      { _id: "req-2", label: "Birth Certificate", order: 1, isActive: true },
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

let server: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  holder.session = {
    user: { id: "admin1", email: "admin@buksu.edu.ph", role: "ADMIN" },
  };
  holder.db = fakeDb(seed()).db;
  vi.spyOn(console, "error").mockImplementation(() => {});
  server = await serve();
});

afterEach(async () => {
  await server.close();
  vi.restoreAllMocks();
});

describe("GET /api/v1/requirements", () => {
  it("lists items in order in a list envelope", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((i: Row) => i.id)).toEqual(["req-1", "req-2"]);
    expect(body.total).toBe(2);
  });
});

describe("POST /api/v1/requirements", () => {
  it("appends a requirement with 201", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Good Moral" }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      label: "Good Moral",
      order: 2,
      isActive: true,
    });
  });
});

describe("PATCH /api/v1/requirements/:id", () => {
  it("toggles isActive", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements/req-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.isActive).toBe(false);
  });

  it("404s a missing requirement", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements/req-9`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "x" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v1/requirements/:id", () => {
  it("deletes the requirement", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements/req-2`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ id: "req-2" });
  });
});

describe("PUT /api/v1/requirements/order", () => {
  it("rewrites positions from orderedIds", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: ["req-2", "req-1"] }),
    });
    expect(response.status).toBe(200);
    const list = await (
      await fetch(`${server.url}/api/v1/requirements`)
    ).json();
    expect(list.data.map((i: Row) => i.id)).toEqual(["req-2", "req-1"]);
  });

  it("404s an unknown id", async () => {
    const response = await fetch(`${server.url}/api/v1/requirements/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: ["req-9"] }),
    });
    expect(response.status).toBe(404);
  });
});
