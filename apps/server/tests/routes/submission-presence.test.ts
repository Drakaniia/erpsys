import express from "express";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { guardDb } from "../../src/lib/db/timestamp-ordering.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { timestampOrdering } from "../../src/middleware/timestamp.js";
import { v1Router } from "../../src/routes/index.js";
import { fakeDb } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../src/config/auth.js", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-officer");
        return id && { user: { id, name: id, role: "SBO_OFFICER" } };
      },
    },
  },
}));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/db/db.js")>()),
  getDbSync: () => holder.db,
}));

it("deduplicates two active editors without changing review timestamp ordering", async () => {
  const { db, store } = fakeDb({
    [COLLECTIONS.academicYear]: [{ _id: "year", isActive: true }],

    [COLLECTIONS.stepVerification]: [
      {
        _id: "review",
        stepId: "ASSESSMENT",
        studentProfileId: "student",
        academicYearId: "year",
        status: "SUBMITTED",
        writeTs: 1,
        updatedAt: new Date(0),
      },
    ],
  });
  holder.db = guardDb(db as never);
  const record = store[COLLECTIONS.stepVerification][0];
  const app = express();
  app.use(express.json());
  app.use("/api/v1", timestampOrdering, v1Router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const call = (suffix: string, officer: string, method = "GET", ts?: number) =>
      fetch(`http://127.0.0.1:${port}/api/v1/submissions/review${suffix}`, {
        method,
        signal: AbortSignal.timeout(3_000),
        headers: { "x-test-officer": officer, "content-type": "application/json" },
        body: ts === undefined ? undefined : JSON.stringify({ ts }),
      });
    const { ts } = await (await call("", "Alice")).json();
    expect(typeof ts).toBe("number");
    expect(record.readTs).toBe(ts);

    const renew = (officer: string) => call("/active-editors", officer, "PUT");
    const joined = await Promise.all([renew("Alice"), renew("Bob")]);
    expect(joined.map((response) => response.status)).toEqual([200, 200]);
    const renewed = await renew("Alice");
    expect(renewed.status).toBe(200);
    const editors = [
      { userId: "Alice", name: "Alice" },
      { userId: "Bob", name: "Bob" },
    ];
    expect(await renewed.json()).toEqual({ data: expect.arrayContaining(editors) });
    const viewed = await call("/active-editors", "Carol");
    expect(viewed.status).toBe(200);
    const presence = await viewed.json();
    expect(presence).toEqual({ data: expect.arrayContaining(editors) });
    expect(presence.data).toHaveLength(2);
    expect(record.activeEditors).toHaveLength(2);
    expect(record).toMatchObject({ readTs: ts, writeTs: 1, updatedAt: new Date(0) });

    // Heartbeats must not stale the anchored save; a newer real review write must.
    expect((await call("/verification", "Alice", "POST", ts)).status).toBe(200);
    expect((await call("/verification", "Bob", "DELETE")).status).toBe(200);
    const stale = await call("/verification", "Alice", "POST", ts);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ data: { code: "TS_ABORTED" } });
    expect(record.status).toBe("PENDING");
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
});
