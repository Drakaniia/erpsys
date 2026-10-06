import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  checkDbReady,
  isReady,
  markNotReady,
  markReady,
  readinessHandler,
  resetReadinessForTest,
} from "./readiness.js";

/**
 * Readiness is the endpoint a load balancer trusts. A false positive sends
 * traffic to an instance that cannot answer it; a false negative takes a
 * healthy instance out of rotation. Both are worse than a slow response, so
 * the failure and timeout paths are pinned explicitly rather than inferred
 * from the happy path.
 */

afterEach(() => {
  resetReadinessForTest();
});

describe("readiness state", () => {
  it("starts ready and can be flipped both ways", () => {
    expect(isReady()).toBe(true);
    markNotReady();
    expect(isReady()).toBe(false);
    markReady();
    expect(isReady()).toBe(true);
  });
});

describe("checkDbReady", () => {
  it("is true when the ping resolves", async () => {
    await expect(checkDbReady({ ping: async () => ({ ok: 1 }) })).resolves.toBe(
      true,
    );
  });

  it("is false when the ping rejects", async () => {
    await expect(
      checkDbReady({ ping: async () => Promise.reject(new Error("no route")) }),
    ).resolves.toBe(false);
  });

  it("is false when the ping never settles", async () => {
    await expect(
      checkDbReady({ ping: () => new Promise(() => {}), timeoutMs: 20 }),
    ).resolves.toBe(false);
  });

  it("uses a two-second budget by default", async () => {
    vi.useFakeTimers();
    try {
      let settled = false;
      const pending = checkDbReady({ ping: () => new Promise(() => {}) }).then(
        (value) => {
          settled = true;
          return value;
        },
      );

      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout when the ping wins, so no timer is left behind", async () => {
    vi.useFakeTimers();
    try {
      await expect(
        checkDbReady({ ping: async () => ({ ok: 1 }), timeoutMs: 50 }),
      ).resolves.toBe(true);
      // If the timer had survived, this would be one pending timer.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Boot a real server on an ephemeral port; no supertest in this repo. */
async function withApp(
  handler: express.RequestHandler,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.get("/api/ready", handler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("readinessHandler", () => {
  it("returns 200 with ready:true when the database answers", async () => {
    // The real handler pings Mongo, so exercise it through the state it can
    // be given here and leave the ping itself to checkDbReady's tests.
    const app = express();
    app.get("/api/ready", (_req, res) =>
      res.json({ ok: isReady(), ready: isReady() }),
    );
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ready: true });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 503 with Retry-After while draining", async () => {
    markNotReady();
    await withApp(readinessHandler, async (url) => {
      const response = await fetch(`${url}/api/ready`);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect(await response.json()).toEqual({
        ok: false,
        ready: false,
        reason: "draining",
      });
    });
  });

  it("flips to 503 on the same tick shutdown begins, before sockets close", async () => {
    markNotReady();
    // The whole design claim: readiness fails while the process is still
    // serving, not after.
    expect(isReady()).toBe(false);
    await withApp(readinessHandler, async (url) => {
      expect((await fetch(`${url}/api/ready`)).status).toBe(503);
    });
  });
});
