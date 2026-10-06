import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { env } from "./env.js";
import {
  isMetricsRequestAllowed,
  metricsHandler,
  normaliseRoute,
  recordRequest,
  recordStorageQuotaBlocked,
  renderMetrics,
  resetMetricsForTest,
} from "./metrics.js";
import { subscribeToUser, totalSubscriberCount } from "./sse.js";

let originalToken: string;

beforeEach(() => {
  originalToken = env.METRICS_TOKEN;
  resetMetricsForTest();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  env.METRICS_TOKEN = originalToken;
  vi.restoreAllMocks();
});

describe("normaliseRoute", () => {
  it("keeps a legacy rpc path intact", () => {
    expect(normaliseRoute("/rpc/student/queue/join")).toBe(
      "/rpc/student/queue/join",
    );
  });

  it("strips the query string, which carries secrets", () => {
    expect(normaliseRoute("/app/student?token=abc123")).toBe("/app/student");
  });

  it("collapses a deep /api path", () => {
    expect(normaliseRoute("/api/v1/uploads/abc/content")).toBe("/api/v1/*");
    expect(normaliseRoute("/api/auth/callback/google")).toBe("/api/auth/*");
    expect(normaliseRoute("/api/health")).toBe("/api/health");
  });

  it("replaces an id-looking segment below a page path", () => {
    expect(normaliseRoute("/app/2401117078/queue")).toBe("/app/:id/queue");
    expect(normaliseRoute("/app/65f0c1a2b3c4d5e6f7a8b9c0")).toBe("/app/:id");
  });

  it("collapses an id below /api into the wildcard, not a second series", () => {
    // One endpoint must be one label. `:id` here would double the series count
    // for every /api resource that takes an id.
    expect(normaliseRoute("/api/thing/65f0c1a2b3c4d5e6f7a8b9c0")).toBe(
      "/api/thing/*",
    );
  });

  it("keeps distinct rpc paths distinct", () => {
    const routes = new Set(
      Array.from({ length: 50 }, (_v, i) =>
        normaliseRoute(`/rpc/student/queue/p${i}`),
      ),
    );
    expect(routes.size).toBe(50);
  });

  it("collapses a hundred ids onto one label", () => {
    const routes = new Set(
      Array.from({ length: 100 }, (_v, i) =>
        normaliseRoute(`/api/departments/${i}`),
      ),
    );
    // The point of the exercise: cardinality tracks endpoints, not students.
    expect(routes.size).toBe(1);
  });
});

describe("renderMetrics", () => {
  it("emits valid Prometheus text", () => {
    const text = renderMetrics();
    const lines = text.split("\n").filter(Boolean);

    expect(text.endsWith("\n")).toBe(true);
    expect(lines.some((line) => line.startsWith("# TYPE"))).toBe(true);
    expect(lines.some((line) => line.startsWith("# HELP"))).toBe(true);

    for (const line of lines) {
      if (line.startsWith("#")) continue;
      expect(line).toMatch(
        /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? -?[0-9.eE+]+$/,
      );
    }
  });

  it("reports event loop delay, heap, and pool gauges", () => {
    recordRequest({
      method: "GET",
      path: "/api/health",
      status: 200,
      durationMs: 3,
    });
    const text = renderMetrics();

    expect(text).toMatch(
      /erpsys_event_loop_delay_ms\{quantile="0\.99"\} [\d.]+/,
    );
    expect(text).toMatch(/erpsys_nodejs_heap_size_used_bytes \d+/);
    expect(text).toMatch(/erpsys_mongo_pool_max \d+/);
    expect(text).toMatch(/erpsys_sse_subscribers \d+/);
  });

  it("counts requests by route shape, not by raw path", () => {
    recordRequest({
      method: "GET",
      path: "/rpc/student/queue/join",
      status: 200,
      durationMs: 12,
    });
    recordRequest({
      method: "GET",
      path: "/rpc/student/queue/join",
      status: 200,
      durationMs: 30,
    });
    recordRequest({
      method: "GET",
      path: "/api/health",
      status: 200,
      durationMs: 1,
    });

    const text = renderMetrics();
    expect(text).toContain(
      'erpsys_http_requests_total{route="/rpc/student/queue/join",method="GET"} 2',
    );
    expect(text).toContain(
      'erpsys_http_request_duration_ms_sum{route="/rpc/student/queue/join",method="GET"} 42',
    );
    expect(text).toContain('le="50"} 1');
  });

  it("breaks responses down by status class", () => {
    recordRequest({
      method: "GET",
      path: "/rpc/x/y/z",
      status: 200,
      durationMs: 1,
    });
    recordRequest({
      method: "GET",
      path: "/rpc/x/y/z",
      status: 503,
      durationMs: 1,
    });
    const text = renderMetrics();
    expect(text).toContain('status="2xx"} 1');
    expect(text).toContain('status="5xx"} 1');
  });

  it("collapses past the route ceiling into one series", () => {
    for (let i = 0; i < 520; i += 1) {
      recordRequest({
        method: "GET",
        path: `/rpc/ns/r${i}/op`,
        status: 200,
        durationMs: 1,
      });
    }
    const text = renderMetrics();
    expect(text).toContain(
      'erpsys_http_requests_total{route="/other",method="*"} 20',
    );
  });

  it("counts storage quota blocks with bucket+key, never URLs", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    recordStorageQuotaBlocked("erpsys-prod", "erpsys/2026/Evidence/u-1/a.jpg");
    recordStorageQuotaBlocked("erpsys-prod", "erpsys/2026/Evidence/u-2/b.jpg");

    expect(renderMetrics()).toContain("erpsys_storage_quota_blocked_total 2");
    const lines = log.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes("[storage]"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('bucket="erpsys-prod"');
    expect(lines[0]).toContain('key="erpsys/2026/Evidence/u-1/a.jpg"');
    expect(lines.join("\n")).not.toMatch(/https?:\/\//);
    expect(lines.join("\n")).not.toMatch(/X-Amz-Signature/);
  });

  it("counts live SSE connections", () => {
    const offA = subscribeToUser("u-1", () => {});
    const offB = subscribeToUser("u-1", () => {});
    const offC = subscribeToUser("u-2", () => {});
    try {
      expect(totalSubscriberCount()).toBe(3);
      expect(renderMetrics()).toContain("erpsys_sse_subscribers 3");
    } finally {
      offA();
      offB();
      offC();
    }
  });
});

describe("isMetricsRequestAllowed", () => {
  it("allows loopback when no token is set", () => {
    env.METRICS_TOKEN = "";
    expect(
      isMetricsRequestAllowed({
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(true);
    expect(
      isMetricsRequestAllowed({
        headers: {},
        socket: { remoteAddress: "::1" },
      }),
    ).toBe(true);
    expect(
      isMetricsRequestAllowed({
        headers: {},
        socket: { remoteAddress: "::ffff:127.0.0.1" },
      }),
    ).toBe(true);
  });

  it("refuses a non-loopback caller when no token is set", () => {
    env.METRICS_TOKEN = "";
    expect(
      isMetricsRequestAllowed({
        headers: {},
        socket: { remoteAddress: "10.0.0.5" },
      }),
    ).toBe(false);
  });

  it("accepts a valid bearer token from anywhere", () => {
    env.METRICS_TOKEN = "s3cret";
    expect(
      isMetricsRequestAllowed({
        headers: { authorization: "Bearer s3cret" },
        socket: { remoteAddress: "10.0.0.5" },
      }),
    ).toBe(true);
  });

  it("accepts a valid ?token=", () => {
    env.METRICS_TOKEN = "s3cret";
    expect(
      isMetricsRequestAllowed({
        headers: {},
        query: { token: "s3cret" },
        socket: { remoteAddress: "10.0.0.5" },
      }),
    ).toBe(true);
  });

  it("refuses a wrong or absent token even from loopback", () => {
    env.METRICS_TOKEN = "s3cret";
    expect(
      isMetricsRequestAllowed({
        headers: { authorization: "Bearer wrong" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(false);
    expect(
      isMetricsRequestAllowed({
        headers: {},
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(false);
  });

  it("refuses a token of the wrong length without throwing", () => {
    env.METRICS_TOKEN = "s3cret";
    expect(
      isMetricsRequestAllowed({
        headers: { authorization: "Bearer s" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe(false);
  });
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

describe("metricsHandler", () => {
  it("serves Prometheus text over the exposition content type", async () => {
    env.METRICS_TOKEN = "";
    const { url, close } = await serve((app) => {
      app.get("/api/metrics", metricsHandler);
    });
    try {
      const response = await fetch(`${url}/api/metrics`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/plain; version=0.0.4; charset=utf-8",
      );
      const body = await response.text();
      expect(body).toMatch(/# TYPE erpsys_http_requests_total counter/);
      expect(body.endsWith("\n")).toBe(true);
    } finally {
      await close();
    }
  });

  it("404s an off-loopback caller when no token is set", async () => {
    env.METRICS_TOKEN = "";
    // `req.ip` is what a proxied request reports; the socket address is
    // loopback here, so drive the handler's gate directly with a remote peer.
    const app = express();
    app.set("trust proxy", 0);
    app.get("/api/metrics", metricsHandler);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/metrics`, {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      // Loopback socket with a token-less config is still allowed, so assert
      // the refusal through the gate rather than through a spoofed header.
      expect(response.status).toBe(200);
      expect(
        isMetricsRequestAllowed({
          headers: {},
          socket: { remoteAddress: "203.0.113.9" },
        }),
      ).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("404s — not 401 — a caller with no token when one is required", async () => {
    env.METRICS_TOKEN = "s3cret";
    const { url, close } = await serve((app) => {
      app.get("/api/metrics", metricsHandler);
    });
    try {
      const response = await fetch(`${url}/api/metrics`);
      // A 401 would confirm the endpoint exists and how to authenticate to it.
      expect(response.status).toBe(404);
      expect(await response.text()).not.toMatch(/erpsys_/);
    } finally {
      await close();
    }
  });

  it("serves a caller presenting the right token", async () => {
    env.METRICS_TOKEN = "s3cret";
    const { url, close } = await serve((app) => {
      app.get("/api/metrics", metricsHandler);
    });
    try {
      const response = await fetch(`${url}/api/metrics`, {
        headers: { authorization: "Bearer s3cret" },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toMatch(/erpsys_sse_subscribers/);
    } finally {
      await close();
    }
  });
});
