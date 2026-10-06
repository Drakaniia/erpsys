import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { renderMetrics, resetMetricsForTest } from "./metrics.js";
import {
  redactHeaders,
  requestLogMiddleware,
  setStructuredLogForTest,
} from "./request-log.js";

beforeEach(() => {
  resetMetricsForTest();
  setStructuredLogForTest(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  setStructuredLogForTest(undefined);
  vi.restoreAllMocks();
});

async function serve(
  mount: (app: express.Express) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  mount(app);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("redactHeaders", () => {
  it("redacts credentials and omits everything else", () => {
    const safe = redactHeaders({
      cookie: "better-auth.session_token=abc",
      authorization: "Bearer secret",
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
    });

    expect(safe.cookie).toBe("[redacted]");
    expect(safe.authorization).toBe("[redacted]");
    // Not logged verbatim either — a header's operational value here is near
    // zero and the risk is not.
    expect(safe["content-type"]).toBe("[omitted]");
    expect(safe["user-agent"]).toBe("[omitted]");
  });
});

describe("requestLogMiddleware", () => {
  it("logs one JSON line in production with no body or headers", async () => {
    setStructuredLogForTest(true);
    const { url, close } = await serve((app) => {
      app.use(express.json());
      app.use(requestLogMiddleware);
      app.post("/rpc/student/queue/join", (req, res) => {
        res.status(201).json({ ok: true });
        void req;
      });
    });

    try {
      await fetch(`${url}/rpc/student/queue/join?token=leak-me`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=abc",
        },
        body: JSON.stringify({ studentNumber: "2401117078" }),
      });

      const lines = vi
        .mocked(console.log)
        .mock.calls.map((call) => String(call[0]));
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain("\n");

      const entry = JSON.parse(lines[0]!);
      expect(entry).toMatchObject({
        level: "info",
        msg: "request",
        method: "POST",
        status: 201,
        requestId: expect.any(String),
      });
      expect(typeof entry.durationMs).toBe("number");

      // The whole point: no token, no cookie, no body.
      expect(lines[0]).not.toContain("leak-me");
      expect(lines[0]).not.toContain("session_token");
      expect(lines[0]).not.toContain("2401117078");
      // Query string dropped, so the path is still useful.
      expect(entry.path).toBe("/rpc/student/queue/join");
    } finally {
      await close();
    }
  });

  it("logs a human-readable line in dev", async () => {
    setStructuredLogForTest(false);
    const { url, close } = await serve((app) => {
      app.use(requestLogMiddleware);
      app.get("/api/health", (_req, res) => res.json({ ok: true }));
    });

    try {
      await fetch(`${url}/api/health`);
      const line = String(vi.mocked(console.log).mock.calls[0]?.[0]);
      expect(line).toMatch(/^\[http\] GET \/api\/health 200 [\d.]+ms rid=/);
    } finally {
      await close();
    }
  });

  it("sets a request id header the client can quote back", async () => {
    setStructuredLogForTest(false);
    const { url, close } = await serve((app) => {
      app.use(requestLogMiddleware);
      app.get("/api/health", (_req, res) => res.json({ ok: true }));
    });

    try {
      const response = await fetch(`${url}/api/health`);
      expect(response.headers.get("x-request-id")).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-/,
      );
    } finally {
      await close();
    }
  });

  it("records the request into the metrics series", async () => {
    setStructuredLogForTest(false);
    const { url, close } = await serve((app) => {
      app.use(requestLogMiddleware);
      app.get("/api/health", (_req, res) => res.json({ ok: true }));
    });

    try {
      await fetch(`${url}/api/health`);
      expect(renderMetrics()).toContain(
        'erpsys_http_requests_total{route="/api/health",method="GET"} 1',
      );
    } finally {
      await close();
    }
  });
});
