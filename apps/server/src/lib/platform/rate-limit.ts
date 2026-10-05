import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";

export const RATE_LIMIT_MAX_KEYS = 10_000;

const DEFAULT_MESSAGE = "Too many requests.";

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitBudget = {
  check(key: string): RateLimitDecision;
  reset(): void;
  readonly size: number;
};

type Store = Map<string, number[]>;

type Registered = { store: Store; windowMs: number };

const registry = new Set<Registered>();

function compact(times: number[], now: number, windowMs: number): void {
  let write = 0;
  for (let read = 0; read < times.length; read += 1) {
    if (now - times[read] < windowMs) {
      times[write] = times[read];
      write += 1;
    }
  }
  times.length = write;
}

function sweepStore(store: Store, now: number, windowMs: number): void {
  for (const [key, times] of store) {
    compact(times, now, windowMs);
    if (times.length === 0) store.delete(key);
  }
}

function touch(store: Store, key: string, times: number[]): void {
  store.delete(key);
  store.set(key, times);
}

function retryAfterSeconds(
  oldest: number,
  now: number,
  windowMs: number,
): number {
  const waitMs = Math.max(0, oldest + windowMs - now);
  return Math.max(1, Math.ceil(waitMs / 1000));
}

function record(
  store: Store,
  key: string,
  now: number,
  windowMs: number,
  max: number,
  maxKeys: number,
): RateLimitDecision {
  const times = store.get(key) ?? [];
  compact(times, now, windowMs);

  if (times.length >= max) {
    touch(store, key, times);
    return {
      allowed: false,
      retryAfterSeconds: retryAfterSeconds(times[0], now, windowMs),
    };
  }

  times.push(now);
  touch(store, key, times);

  if (store.size > maxKeys) {
    sweepStore(store, now, windowMs);
    for (const oldest of store.keys()) {
      if (store.size <= maxKeys) break;
      store.delete(oldest);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function assertPositive(label: string, value: number, integer: boolean): void {
  const usable = integer ? Number.isInteger(value) : Number.isFinite(value);
  if (!usable || value <= 0) {
    throw new Error(
      `slidingWindowRateLimit: ${label} must be a positive ${integer ? "integer" : "number"} (got ${value})`,
    );
  }
}

export function createRateLimitBudget(opts: {
  windowMs: number;
  max: number;
  maxKeys?: number;
}): RateLimitBudget {
  const { windowMs, max, maxKeys = RATE_LIMIT_MAX_KEYS } = opts;
  assertPositive("windowMs", windowMs, false);
  assertPositive("max", max, true);
  assertPositive("maxKeys", maxKeys, true);

  const store: Store = new Map();
  registry.add({ store, windowMs });

  return {
    check(key) {
      return record(store, key, Date.now(), windowMs, max, maxKeys);
    },
    reset() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}

export function slidingWindowRateLimit(opts: {
  windowMs: number;
  max: number;
  key: (req: Request) => string | null | undefined;
  message?: string;
}): RequestHandler {
  const { windowMs, max, key, message = DEFAULT_MESSAGE } = opts;
  const budget = createRateLimitBudget({ windowMs, max });

  return function rateLimit(req, res, next) {
    const keyForRequest = key(req);
    if (!keyForRequest) {
      next();
      return;
    }
    const decision = budget.check(keyForRequest);
    if (decision.allowed) {
      next();
      return;
    }
    res.status(429);
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
    res.json({ error: message });
  };
}

export function clientIp(req: Request): string {
  const ip = req.ip;
  if (typeof ip === "string" && ip.length > 0) return ip;

  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  if (first) return first;

  return req.socket?.remoteAddress || "unknown";
}

export function resetRateLimits(): void {
  for (const { store } of registry) store.clear();
}

export function clearRateLimitKey(key: string): void {
  for (const { store } of registry) store.delete(key);
}

export function sweepRateLimits(): void {
  const now = Date.now();
  for (const { store, windowMs } of registry) sweepStore(store, now, windowMs);
}

const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60_000;
export const AUTH_RATE_LIMIT_MAX = 20;

const AUTH_BASE_PATH = "/api/auth";

const CREDENTIAL_PATHS = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/sign-up/student",

]);

function authSubPath(req: Request): string {
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const at = trimmed.indexOf(AUTH_BASE_PATH);
  return at >= 0 ? trimmed.slice(at + AUTH_BASE_PATH.length) : trimmed;
}

export const authRateLimit: RequestHandler = slidingWindowRateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  key: (req) =>
    CREDENTIAL_PATHS.has(authSubPath(req)) ? `ip:${clientIp(req)}` : null,
  message:
    "Too many sign-in attempts — please wait a few minutes and try again.",
});

const RPC_RATE_LIMIT_WINDOW_MS = 60_000;
const RPC_RATE_LIMIT_MAX = 300;

function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (!pair.slice(0, eq).trim().endsWith("session_token")) continue;
    const value = decodeURIComponent(pair.slice(eq + 1).trim());
    if (value) return value;
  }
  return null;
}

function sessionFingerprint(req: Request): string {
  const token = readSessionCookie(req);
  if (!token) return "anonymous";
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export const rpcRateLimit: RequestHandler = slidingWindowRateLimit({
  windowMs: RPC_RATE_LIMIT_WINDOW_MS,
  max: RPC_RATE_LIMIT_MAX,
  key: (req) => `session:${sessionFingerprint(req)}|ip:${clientIp(req)}`,
  message: "Too many requests — please slow down.",
});

export const restRateLimit: RequestHandler = rpcRateLimit;
