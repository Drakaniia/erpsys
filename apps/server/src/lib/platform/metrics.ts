import { monitorEventLoopDelay } from "node:perf_hooks";
import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";
import { poolStats } from "../db/db.js";
import { env } from "./env.js";
import { totalSubscriberCount } from "./sse.js";

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const MAX_ROUTES = 500;

type RequestObservation = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

type RouteSeries = {
  method: string;
  route: string;
  count: number;
  sumMs: number;
  buckets: number[];
};

const seriesByKey = new Map<string, RouteSeries>();
const statusClassByKey = new Map<string, { labels: string; count: number }>();
let overflowCount = 0;
let overflowSumMs = 0;
let overflowBuckets = new Array<number>(BUCKETS_MS.length).fill(0);

function idLike(segment: string): boolean {
  return (
    /^[0-9a-f]{24}$/i.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      segment,
    ) ||
    /^\d{6,}$/.test(segment)
  );
}

function sanitise(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "_";
}

export function normaliseRoute(rawPath: string): string {
  const path = rawPath.split("?")[0]!.split("#")[0]!;
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const head = segments[0]!;
  const out = segments.map((segment, index) => {
    if (index === 0) return head === "rpc" ? "rpc" : sanitise(segment);
    if (head === "rpc") return sanitise(segment);
    if (head === "api") {
      if (index === 1) return sanitise(segment);
      if (index === 2 && segment === "auth") {
        return sanitise(segment);
      }
      return "*";
    }
    return idLike(segment) ? ":id" : sanitise(segment);
  });

  const collapsed: string[] = [];
  for (const segment of out) {
    if (segment === "*" && collapsed[collapsed.length - 1] === "*") continue;
    collapsed.push(segment);
  }

  return `/${collapsed.join("/")}`;
}

export function recordRequest(observation: RequestObservation): void {
  const route = normaliseRoute(observation.path);
  const key = `${observation.method} ${route}`;
  const duration = Math.max(0, observation.durationMs);

  const classKey = `${key} ${statusClass(observation.status)}`;
  const existingClass = statusClassByKey.get(classKey);
  if (existingClass) existingClass.count += 1;
  else
    statusClassByKey.set(classKey, {
      labels: `route="${route}",method="${observation.method}",status="${statusClass(observation.status)}"`,
      count: 1,
    });

  let series = seriesByKey.get(key);
  if (!series) {
    if (seriesByKey.size >= MAX_ROUTES) {
      overflowCount += 1;
      overflowSumMs += duration;
      bucketInto(overflowBuckets, duration);
      return;
    }
    series = {
      method: observation.method,
      route,
      count: 0,
      sumMs: 0,
      buckets: new Array<number>(BUCKETS_MS.length).fill(0),
    };
    seriesByKey.set(key, series);
  }

  series.count += 1;
  series.sumMs += duration;
  bucketInto(series.buckets, duration);
}

function bucketInto(buckets: number[], durationMs: number): void {
  for (let i = 0; i < BUCKETS_MS.length; i += 1) {
    if (durationMs <= BUCKETS_MS[i]!) {
      buckets[i] = (buckets[i] ?? 0) + 1;
    }
  }
}

let storageQuotaBlockedTotal = 0;

export function recordStorageQuotaBlocked(bucket: string, key: string): void {
  storageQuotaBlockedTotal += 1;
  const scrub = (s: string): string =>
    s.replace(/[\r\n"]/g, "_").slice(0, 256) || "_";
  console.log(
    `[storage] quota blocked bucket="${scrub(bucket)}" key="${scrub(key)}"`,
  );
}

export function resetMetricsForTest(): void {
  seriesByKey.clear();
  statusClassByKey.clear();
  overflowCount = 0;
  overflowSumMs = 0;
  overflowBuckets = new Array<number>(BUCKETS_MS.length).fill(0);
  storageQuotaBlockedTotal = 0;
}

let eventLoopDelay: ReturnType<typeof monitorEventLoopDelay> | null = null;

function ensureEventLoopDelay(): ReturnType<typeof monitorEventLoopDelay> {
  if (!eventLoopDelay) {
    eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
    eventLoopDelay.enable();
  }
  return eventLoopDelay;
}

export function nsToMs(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value / 1e6) * factor) / factor;
}

function ms(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function statusClass(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  return "2xx";
}

export function renderMetrics(): string {
  const loop = ensureEventLoopDelay();
  const memory = process.memoryUsage();
  const pool = poolStats();

  const lines: string[] = [];

  lines.push("# HELP erpsys_event_loop_delay_ms Event loop delay.");
  lines.push("# TYPE erpsys_event_loop_delay_ms gauge");
  lines.push(
    `erpsys_event_loop_delay_ms{quantile="0.5"} ${nsToMs(loop.percentile(50))}`,
  );
  lines.push(
    `erpsys_event_loop_delay_ms{quantile="0.99"} ${nsToMs(loop.percentile(99))}`,
  );
  lines.push(`erpsys_event_loop_delay_ms{quantile="max"} ${nsToMs(loop.max)}`);

  lines.push("# HELP erpsys_process_resident_memory_bytes Resident set size.");
  lines.push("# TYPE erpsys_process_resident_memory_bytes gauge");
  lines.push(`erpsys_process_resident_memory_bytes ${memory.rss}`);

  lines.push("# HELP erpsys_nodejs_heap_size_total_bytes V8 heap size.");
  lines.push("# TYPE erpsys_nodejs_heap_size_total_bytes gauge");
  lines.push(`erpsys_nodejs_heap_size_total_bytes ${memory.heapTotal}`);

  lines.push("# HELP erpsys_nodejs_heap_size_used_bytes V8 heap bytes in use.");
  lines.push("# TYPE erpsys_nodejs_heap_size_used_bytes gauge");
  lines.push(`erpsys_nodejs_heap_size_used_bytes ${memory.heapUsed}`);

  lines.push(
    "# HELP erpsys_nodejs_external_memory_bytes Memory used by objects held outside the V8 heap.",
  );
  lines.push("# TYPE erpsys_nodejs_external_memory_bytes gauge");
  lines.push(`erpsys_nodejs_external_memory_bytes ${memory.external}`);

  lines.push(
    "# HELP erpsys_mongo_pool_checked_out Mongo connections checked out.",
  );
  lines.push("# TYPE erpsys_mongo_pool_checked_out gauge");
  lines.push(`erpsys_mongo_pool_checked_out ${pool.checkedOut}`);

  lines.push(
    "# HELP erpsys_mongo_pool_available Mongo connections idle in the pool.",
  );
  lines.push("# TYPE erpsys_mongo_pool_available gauge");
  lines.push(`erpsys_mongo_pool_available ${pool.available}`);

  lines.push("# HELP erpsys_mongo_pool_max Configured maximum pool size.");
  lines.push("# TYPE erpsys_mongo_pool_max gauge");
  lines.push(`erpsys_mongo_pool_max ${pool.maxPoolSize}`);

  lines.push("# HELP erpsys_sse_subscribers Live SSE connections.");
  lines.push("# TYPE erpsys_sse_subscribers gauge");
  lines.push(`erpsys_sse_subscribers ${totalSubscriberCount()}`);

  lines.push(
    "# HELP erpsys_storage_quota_blocked_total Storage session-mints refused by the quota guard or kill switch.",
  );
  lines.push("# TYPE erpsys_storage_quota_blocked_total counter");
  lines.push(`erpsys_storage_quota_blocked_total ${storageQuotaBlockedTotal}`);

  lines.push(
    "# HELP erpsys_http_responses_total Completed HTTP responses by route and status class.",
  );
  lines.push("# TYPE erpsys_http_responses_total counter");
  for (const entry of statusClassByKey.values()) {
    lines.push(`erpsys_http_responses_total{${entry.labels}} ${entry.count}`);
  }

  lines.push(
    "# HELP erpsys_http_requests_total Completed HTTP requests by route.",
  );
  lines.push("# TYPE erpsys_http_requests_total counter");

  lines.push(
    "# HELP erpsys_http_request_duration_ms HTTP request duration by route.",
  );
  lines.push("# TYPE erpsys_http_request_duration_ms histogram");

  const series = [
    ...seriesByKey.values(),
    ...(overflowCount > 0
      ? [
          {
            method: "*",
            route: "/other",
            count: overflowCount,
            sumMs: overflowSumMs,
            buckets: overflowBuckets,
          } satisfies RouteSeries,
        ]
      : []),
  ];

  for (const entry of series) {
    const labels = `route="${entry.route}",method="${entry.method}"`;
    lines.push(`erpsys_http_requests_total{${labels}} ${entry.count}`);
    for (let i = 0; i < BUCKETS_MS.length; i += 1) {
      lines.push(
        `erpsys_http_request_duration_ms_bucket{${labels},le="${BUCKETS_MS[i]}"} ${entry.buckets[i] ?? 0}`,
      );
    }
    lines.push(
      `erpsys_http_request_duration_ms_bucket{${labels},le="+Inf"} ${entry.count}`,
    );
    lines.push(
      `erpsys_http_request_duration_ms_sum{${labels}} ${ms(entry.sumMs)}`,
    );
    lines.push(
      `erpsys_http_request_duration_ms_count{${labels}} ${entry.count}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  if (LOOPBACK.has(address)) return true;
  return address.startsWith("127.");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

type MetricsGateRequest = {
  headers: IncomingHttpHeaders;
  ip?: string | undefined;
  query?: Record<string, unknown> | undefined;
  socket?: { remoteAddress?: string | undefined } | undefined;
};

export function isMetricsRequestAllowed(request: MetricsGateRequest): boolean {
  const token = env.METRICS_TOKEN.trim();
  if (!token) {
    const address = request.socket?.remoteAddress ?? request.ip;
    return isLoopback(address);
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    if (constantTimeEquals(authorization.slice(7).trim(), token)) return true;
  }

  const queryToken = request.query?.token;
  if (typeof queryToken === "string" && constantTimeEquals(queryToken, token)) {
    return true;
  }

  return false;
}

export const metricsHandler: RequestHandler = (req, res) => {
  if (!isMetricsRequestAllowed(req)) {
    res.status(404).send("Not found");
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", CONTENT_TYPE);
  res.end(renderMetrics());
};
