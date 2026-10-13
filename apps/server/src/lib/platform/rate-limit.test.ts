// ponytail: test suite >400 lines; split deferred - shared setup/mocks make scenario boundaries unclear without a module-level refactor; leave intact.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_RATE_LIMIT_MAX,
  authRateLimit,
  clearRateLimitKey,
  clientIp,
  createRateLimitBudget,
  RATE_LIMIT_MAX_KEYS,
  resetRateLimits,
  rpcRateLimit,
  slidingWindowRateLimit,
  sweepRateLimits,
} from "./rate-limit.js";
import type { Request } from "express";

type FakeRes = {
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): FakeRes;
  setHeader(name: string, value: string): FakeRes;
  json(payload: unknown): FakeRes;
};

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function fakeReq(init: {
  ip?: string;
  url?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}): Request {
  return {
    ip: init.ip,
    url: init.url ?? "/",
    originalUrl: init.url ?? "/",
    headers: init.headers ?? {},
    socket: { remoteAddress: init.remoteAddress ?? "10.0.0.1" },
  } as unknown as Request;
}

/** Run a middleware once and report what happened. */
function run(
  handler: ReturnType<typeof slidingWindowRateLimit>,
  req: Request,
): { res: FakeRes; nextCalled: boolean } {
  const res = fakeRes();
  let nextCalled = false;
  handler(
    req,
    res as never,
    (() => {
      nextCalled = true;
    }) as never,
  );
  return { res, nextCalled };
}

const T0 = 1_760_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetRateLimits();
});

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("slidingWindowRateLimit", () => {
  it("passes requests under the limit through to next()", () => {
    const limit = slidingWindowRateLimit({
      windowMs: 60_000,
      max: 3,
      key: () => "k",
    });
    for (let i = 0; i < 3; i += 1) {
      const { res, nextCalled } = run(limit, fakeReq({}));
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBeNull();
      expect(res.body).toBeUndefined();
    }
  });

  it("answers 429 with Retry-After on the request that exceeds the limit", () => {
    const limit = slidingWindowRateLimit({
      windowMs: 60_000,
      max: 2,
      key: () => "k",
    });
    run(limit, fakeReq({}));
    vi.setSystemTime(T0 + 10_000);
    run(limit, fakeReq({}));

    // 10s of the 60s window has passed, so 50s remain.
    const { res, nextCalled } = run(limit, fakeReq({}));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("50");
    expect(res.body).toEqual({ error: "Too many requests." });
  });

  it("uses the supplied message and never reports Retry-After: 0", () => {
    const limit = slidingWindowRateLimit({
      windowMs: 1_000,
      max: 1,
      key: () => "k",
      message: "custom",
    });
    run(limit, fakeReq({}));
    // Exactly one window later: the slot frees on this request, so the *next*
    // one is what gets rejected, one full window from now.
    vi.setSystemTime(T0 + 1_000);
    run(limit, fakeReq({}));
    const { res } = run(limit, fakeReq({}));
    expect(res.body).toEqual({ error: "custom" });
    expect(Number(res.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("tracks keys independently", () => {
    const limit = slidingWindowRateLimit({
      windowMs: 60_000,
      max: 1,
      key: (req) => (req.headers["x-who"] as string) ?? "nobody",
    });
    const alice = fakeReq({ headers: { "x-who": "alice" } });
    const bob = fakeReq({ headers: { "x-who": "bob" } });

    expect(run(limit, alice).nextCalled).toBe(true);
    expect(run(limit, alice).res.statusCode).toBe(429);
    // Bob's first request is untouched by Alice's burst.
    expect(run(limit, bob).nextCalled).toBe(true);
    expect(run(limit, bob).nextCalled).toBe(false);
  });

  it("does not count a request whose key function returns nullish", () => {
    const limit = slidingWindowRateLimit({
      windowMs: 60_000,
      max: 1,
      key: (req) => (req.url === "/free" ? null : "k"),
    });
    for (let i = 0; i < 50; i += 1) {
      expect(run(limit, fakeReq({ url: "/free" })).nextCalled).toBe(true);
    }
    expect(run(limit, fakeReq({ url: "/metered" })).nextCalled).toBe(true);
    expect(run(limit, fakeReq({ url: "/metered" })).res.statusCode).toBe(429);
  });

  it("lets a rejected request's window slide rather than extending it", () => {
    const limit = slidingWindowRateLimit({
      windowMs: 60_000,
      max: 2,
      key: () => "k",
    });
    run(limit, fakeReq({}));
    run(limit, fakeReq({}));

    // Hammer while rejected. If rejections extended the window this would never
    // recover, which is the classic sliding-window self-inflicted DoS.
    for (let t = 1_000; t <= 20_000; t += 1_000) {
      vi.setSystemTime(T0 + t);
      expect(run(limit, fakeReq({})).res.statusCode).toBe(429);
    }

    vi.setSystemTime(T0 + 60_000);
    expect(run(limit, fakeReq({})).nextCalled).toBe(true);
  });

  it("rejects a bad configuration at construction", () => {
    expect(() =>
      slidingWindowRateLimit({ windowMs: 0, max: 1, key: () => "k" }),
    ).toThrow(/windowMs/);
    expect(() =>
      slidingWindowRateLimit({ windowMs: 1_000, max: 0, key: () => "k" }),
    ).toThrow(/max/);
  });
});

describe("createRateLimitBudget", () => {
  it("allows a request just outside the window again", () => {
    const budget = createRateLimitBudget({ windowMs: 60_000, max: 2 });
    expect(budget.check("k").allowed).toBe(true);
    vi.setSystemTime(T0 + 30_000);
    expect(budget.check("k").allowed).toBe(true);
    expect(budget.check("k").allowed).toBe(false);

    // The first hit is 60s old, so exactly one slot has aged out.
    vi.setSystemTime(T0 + 60_000);
    const decision = budget.check("k");
    expect(decision.allowed).toBe(true);
    // ...and the 30s-old hit has not, so the next one is still rejected.
    expect(budget.check("k").allowed).toBe(false);
  });

  it("reports the seconds until the oldest hit expires", () => {
    const budget = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    budget.check("k");
    vi.setSystemTime(T0 + 1_000);
    const decision = budget.check("k");
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(59);
    vi.setSystemTime(T0 + 20_000);
    expect(budget.check("k").retryAfterSeconds).toBe(40);
  });

  it("empties the store on reset()", () => {
    const budget = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    budget.check("a");
    budget.check("b");
    expect(budget.size).toBe(2);
    budget.reset();
    expect(budget.size).toBe(0);
    expect(budget.check("a").allowed).toBe(true);
  });
});

describe("store bounding", () => {
  it("drops fully-expired keys on a sweep", () => {
    const budget = createRateLimitBudget({ windowMs: 1_000, max: 5 });
    budget.check("old");
    vi.setSystemTime(T0 + 2_000);
    budget.check("new");
    expect(budget.size).toBe(2);

    sweepRateLimits();
    expect(budget.size).toBe(1);
    expect(budget.check("new").allowed).toBe(true);
  });

  it("never exceeds maxKeys under sustained unique-key traffic", () => {
    const budget = createRateLimitBudget({
      windowMs: 60_000,
      max: 1,
      maxKeys: 50,
    });
    // Every key is unique and none of them ever ages out inside the window, so
    // the sweep alone cannot free anything — this is exactly the case the
    // inlined chat limiter grew without bound in.
    for (let i = 0; i < 5_000; i += 1) {
      budget.check(`key-${i}`);
      expect(budget.size).toBeLessThanOrEqual(50);
    }
    expect(budget.size).toBe(50);
  });

  it("frees expired keys by sweeping rather than by evicting them", () => {
    const budget = createRateLimitBudget({
      windowMs: 1_000,
      max: 1,
      maxKeys: 10,
    });
    for (let i = 0; i < 10; i += 1) budget.check(`cold-${i}`);
    expect(budget.size).toBe(10);

    // One new key tips the store over the cap. The sweep should drop the ten
    // expired ones, so the store ends at 1 — not at the cap, which is what it
    // would be if eviction had run instead.
    vi.setSystemTime(T0 + 5_000);
    budget.check("warm");
    expect(budget.size).toBe(1);
    expect(budget.check("cold-0").allowed).toBe(true);
  });

  it("defaults maxKeys to the documented ceiling", () => {
    const budget = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    for (let i = 0; i < RATE_LIMIT_MAX_KEYS + 25; i += 1) {
      budget.check(`key-${i}`);
    }
    expect(budget.size).toBeLessThanOrEqual(RATE_LIMIT_MAX_KEYS);
    budget.reset();
  });
});

describe("module-level store helpers", () => {
  it("resetRateLimits() empties every budget", () => {
    const one = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    const two = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    one.check("k");
    two.check("k");
    expect(one.size).toBe(1);
    expect(two.size).toBe(1);
    resetRateLimits();
    expect(one.size).toBe(0);
    expect(two.size).toBe(0);
  });

  it("clearRateLimitKey() drops one key from every budget", () => {
    const one = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    const two = createRateLimitBudget({ windowMs: 60_000, max: 1 });
    one.check("user:1");
    one.check("user:2");
    two.check("user:1");
    clearRateLimitKey("user:1");
    expect(one.size).toBe(1);
    expect(two.size).toBe(0);
  });
});

describe("clientIp", () => {
  it("prefers req.ip, which trust proxy already resolved", () => {
    expect(
      clientIp(
        fakeReq({
          ip: "203.0.113.7",
          headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.9" },
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    expect(
      clientIp(
        fakeReq({
          headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.9" },
          remoteAddress: "10.0.0.9",
        }),
      ),
    ).toBe("198.51.100.1");
  });

  it("falls back to the socket address, then to a placeholder", () => {
    expect(clientIp(fakeReq({ remoteAddress: "10.0.0.9" }))).toBe("10.0.0.9");
    expect(clientIp(fakeReq({ remoteAddress: "" }))).toBe("unknown");
  });
});

describe("authRateLimit", () => {
  const signIn = () =>
    fakeReq({ url: "/api/auth/sign-in/email", ip: "1.1.1.1" });

  it("counts sign-in and sign-up attempts per IP", () => {
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i += 1) {
      expect(run(authRateLimit, signIn()).nextCalled).toBe(true);
    }
    const { res } = run(authRateLimit, signIn());
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.body).toEqual({
      error:
        "Too many sign-in attempts — please wait a few minutes and try again.",
    });
  });

  it("keeps sign-up on the same per-IP bucket as sign-in", () => {
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i += 1)
      run(authRateLimit, signIn());
    const signUp = fakeReq({
      url: "/api/auth/sign-up/student",
      ip: "1.1.1.1",
    });
    expect(run(authRateLimit, signUp).res.statusCode).toBe(429);
  });

  it("does not let one IP exhaust another's budget", () => {
    const other = fakeReq({ url: "/api/auth/sign-in/email", ip: "2.2.2.2" });
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i += 1) {
      run(authRateLimit, signIn());
    }
    expect(run(authRateLimit, other).nextCalled).toBe(true);
  });

  it("ignores the read-only endpoints under /api/auth/*", () => {
    for (const url of [
      "/api/auth/get-session",
      "/api/auth/ok",
      "/api/auth/sign-out",
      "/api/auth/sign-in/social",
      "/api/auth/callback/google",
    ]) {
      for (let i = 0; i < AUTH_RATE_LIMIT_MAX + 5; i += 1) {
        expect(
          run(authRateLimit, fakeReq({ url, ip: "3.3.3.3" })).nextCalled,
        ).toBe(true);
      }
    }
  });

  it("tolerates a query string and a trailing slash", () => {
    const base = fakeReq({ url: "/api/auth/sign-in/email", ip: "4.4.4.4" });
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i += 1) run(authRateLimit, base);
    expect(
      run(
        authRateLimit,
        fakeReq({ url: "/api/auth/sign-in/email/", ip: "4.4.4.4" }),
      ).res.statusCode,
    ).toBe(429);
    expect(
      run(
        authRateLimit,
        fakeReq({
          url: "/api/auth/sign-in/email?callbackURL=/app",
          ip: "4.4.4.4",
        }),
      ).res.statusCode,
    ).toBe(429);
  });
});

describe("rpcRateLimit", () => {
  const cookie = (token: string) => `better-auth.session_token=${token}`;

  it("bounds a single runaway session", () => {
    const req = fakeReq({
      url: "/rpc/student/getMyQueueStatus",
      ip: "5.5.5.5",
      headers: { cookie: cookie("runaway") },
    });
    for (let i = 0; i < 300; i += 1) {
      expect(run(rpcRateLimit, req).nextCalled).toBe(true);
    }
    const { res } = run(rpcRateLimit, req);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("keeps one session's burst off another's", () => {
    const mine = fakeReq({
      ip: "6.6.6.6",
      headers: { cookie: cookie("mine") },
    });
    const theirs = fakeReq({
      ip: "6.6.6.6",
      headers: { cookie: cookie("theirs") },
    });
    for (let i = 0; i < 300; i += 1) run(rpcRateLimit, mine);
    expect(run(rpcRateLimit, theirs).nextCalled).toBe(true);
  });

  it("keys anonymous traffic by IP alone", () => {
    const req = fakeReq({ ip: "7.7.7.7" });
    for (let i = 0; i < 300; i += 1) run(rpcRateLimit, req);
    // A different IP with no cookie is a different bucket.
    expect(run(rpcRateLimit, fakeReq({ ip: "8.8.8.8" })).nextCalled).toBe(true);
    // The same IP still has its own anonymous bucket spent.
    expect(run(rpcRateLimit, fakeReq({ ip: "7.7.7.7" })).res.statusCode).toBe(
      429,
    );
  });

  it("gives a fresh cookie on a throttled IP a fresh bucket", () => {
    // Documented weakness, asserted so it cannot be mistaken for an accident:
    // the session half of the key is free to mint, so cookie-keying stops a
    // runaway client (the stated purpose) but not a determined evader. The
    // durable fix is a second, per-IP bucket inside the handler.
    const anon = fakeReq({ ip: "7.7.7.7" });
    for (let i = 0; i < 300; i += 1) run(rpcRateLimit, anon);
    const rotated = run(
      rpcRateLimit,
      fakeReq({ ip: "7.7.7.7", headers: { cookie: cookie("brand-new") } }),
    );
    expect(rotated.nextCalled).toBe(true);
  });

  it("reads a __Secure- prefixed session cookie", () => {
    const plain = fakeReq({
      ip: "9.9.9.9",
      headers: { cookie: cookie("same-token") },
    });
    const secure = fakeReq({
      ip: "9.9.9.9",
      headers: { cookie: "__Secure-better-auth.session_token=same-token" },
    });
    for (let i = 0; i < 300; i += 1) run(rpcRateLimit, plain);
    // Same token, therefore same fingerprint, therefore the same bucket.
    expect(run(rpcRateLimit, secure).res.statusCode).toBe(429);
  });
});
