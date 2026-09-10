# Rate Limiting — Implementation Spec

**Status:** Draft (interview complete 2026-09-07)
**Deployment target:** Single VPS, systemd Node process (`apps/web` via `adapter-node`), MongoDB Atlas — no horizontal scaling in scope
**Repo:** `steps` — SvelteKit 5 + oRPC + Prisma/MongoDB + better-auth (Bun workspaces, Turborepo)
**Author intent:** Implementation-only spec (not an educational explainer). Queue burst resilience is the primary driver: 50 students hitting `joinQueue` at once must not crash the server nor corrupt FIFO order.

---

## 1. Context & Current State

### 1.1 What exists today

| Surface | Current protection | Location | Notes |
|---------|--------------------|----------|-------|
| `POST /api/chat/stream` | Student-only gate + per-`user\|IP` sliding-window `10 req / 60s`, in-memory `Map<string, number[]>` with opportunistic pruning at 10k keys | `apps/web/src/routes/api/chat/stream/+server.ts:29-49,103-114` | Single-node only; comment explicitly says "move to Redis if scaled horizontally". Returns `429 { error }` with no `Retry-After` header. Zod-validated body (20 msgs, 2KB each). |
| `POST /rpc/[...rest]` (all oRPC) | No rate limiting. `POST`-only + `Origin` check added recently, but any authenticated user can call any procedure at arbitrary rate | `apps/web/src/routes/rpc/[...rest]/+server.ts:43-83` | `handleRpc` builds context via `createContext` (`packages/api/src/context.ts:7`) and delegates to `RPCHandler`. No middleware. `GET/HEAD` only serves OpenAPI reference. |
| better-auth (`/api/auth/*`, `student-signup` plugin) | No `rateLimit` config set | `packages/auth/src/index.ts` (`createAuth()` / `auth` export) | better-auth supports `rateLimit: { window, max, storage }` and per-endpoint overrides, but the project leaves it at defaults (effectively disabled). Password reset currently logs link to stdout. |
| Queue procedures (`student.joinQueue`, `leaveQueue`, `getMyQueueStatus`, `getMySteps`, etc.) | No limiter; FIFO correctness relies on DB constraints but burst of 50 concurrent `joinQueue` calls is unthrottled | `packages/api/src/routers/student/queue/queue.ts`, `packages/api/src/index.ts:20` (`protectedProcedure`) | Instructor sweep jobs (`sweepStaleAvailability` / `sweepStaleServing`) run inline on every poll — extra scans under burst. |
| Upload (`/api/uploadthing` + `evidence.uploadEvidence` / `submitEvidence`) | UploadThing 4 MB server cap, but no per-user rate limit on evidence mutations | `packages/api/src/routers/student/evidence/*`, `apps/web/src/routes/api/uploadthing/+server.ts` | Out of scope for Phase 1 per interview (focus is auth+chat+queue), but spec reserves the extension point. |
| Gemini pacing | Token-bucket pacer at `GEMINI_RPM` (default 15) + per-model health demotion | `apps/web/src/lib/chat/model-router.ts:99-168` | Protects outbound Gemini calls, not inbound client abuse. |
| Reverse proxy | Caddy or nginx recommended in `docs/server-deployment.md:7`, but no rate-limit directives required | — | Spec is app-level only by decision; proxy remains a plain reverse proxy. |

### 1.2 Interview decisions (binding)

- **Audience:** implementation engineers, not stakeholders.
- **Topology:** single node only. In-memory is authoritative; Redis mention stays as a future note, not a requirement.
- **Enforcement layer:** app-level only. No `limit_req` in Caddy/nginx.
- **Priority surfaces (Phase 1):** auth (`better-auth` native), chat (refine existing), **queue** (`joinQueue` burst handling is the load-bearing requirement). Uploads deferred unless trivial to add.
- **Auth tool:** `better-auth` native `rateLimit`.
- **Queue correctness + overload:** both matter equally; 50-at-once must be safe end-to-end.
- **Limit shape for queue:** spec proposes concrete numbers (env-overridable); not "per-user only" nor "global only" — both.
- **Client on 429:** `429` + `Retry-After` header + typed `ORPCError` (`TOO_MANY_REQUESTS`); UI shows countdown + manual retry (no auto-retry).
- **Identity key:** `userId` primary + IP secondary net (`user:{id}|ip:{ip}`) for authed routes; IP-only for anon auth routes. Trust `X-Forwarded-For` then `getClientAddress()`.
- **Algorithm:** sliding window everywhere (consistent with chat), not token bucket.
- **Middleware placement:** oRPC middleware per procedure (`studentProcedure.use(rateLimit)`), not a catch-all `hooks.server.ts` guard.
- **Tunability:** every window/max is an env var in `packages/env/src/server.ts` with validated defaults.
- **Observability:** log every `429` + maintain in-memory counters for future admin surface / `healthz` extension.
- **Verification:** runnable k6 (or autocannon) load test for 50 concurrent queue joins, must pass locally and on staging VPS. Criteria: p95 < 500 ms, zero `5xx`, monotonic position assignment.

---

## 2. Goals / Non-Goals

### Goals

1. Throttle abusive/accidental bursts on auth, chat, and queue without degrading normal use.
2. Guarantee 50 concurrent `joinQueue` calls complete with correct FIFO positions, bounded latency, and no `5xx`.
3. Provide operators with env-tunable knobs and clear `429` semantics (`Retry-After` + typed error).
4. Add zero new infrastructure (no Redis, no proxy plugin, no extra process).
5. Ship with a repeatable load test that gates releases.

### Non-Goals

- Horizontal scaling / shared state.
- Proxy-level WAF / DDoS at edge.
- Upload throttling beyond a reserved extension point.
- Captcha/Turnstile challenge step (may be Phase 2 if 429 metrics show sustained abuse).
- Changing Gemini pacing (already correct via token bucket).

---

## 3. Design

### 3.1 Principles

- **Single-node in-memory sliding window** — one pattern reused across chat, queue, and (where not using better-auth native) oRPC. Predictable, no deps, matches the deployment doc's single-process model.
- **Per-procedure opt-in** — each sensitive procedure composes a rate-limit middleware with its own `windowMs`/`max` derived from env. Non-sensitive reads stay unlimited unless later needed.
- **Identity-aware keys** — authed routes bucket by `user:{userId}|ip:{clientIp}`, anon routes by `ip:{clientIp}`. This preserves per-student fairness while still tying a shared-IP classroom/bulk-abuse to a network.
- **Fail-open on key-extraction error, fail-closed on limit** — if `getClientAddress()` and `X-Forwarded-For` both unavailable, fall back to `user:{id}` alone (for authed) or a single `anon:global` bucket (rate-limited more strictly) rather than bypassing.
- **`Retry-After` is mandatory** — every `429` carries `Retry-After: <ceil(seconds to window reset)>`. oRPC errors also carry `data: { retryAfterSeconds }` so the Svelte client can render a countdown without parsing headers.

### 3.2 Storage & lifecycle

Reuse the chat pattern verbatim so there is one limiter implementation:

```ts
// packages/api/src/lib/rate-limit.ts  (new)
type Bucket = number[]; // epoch ms of requests inside window
const buckets = new Map<string, Bucket>();

export function isRateLimited(key: string, windowMs: number, max: number): { limited: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = (buckets.get(key) ?? []).filter(t => now - t < windowMs);
  if (bucket.length >= max) {
    buckets.set(key, bucket);
    const oldest = bucket[0] ?? now;
    return { limited: true, retryAfterMs: oldest + windowMs - now };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 10_000) { /* opportunistic prune as in +server.ts:43-47 */ }
  return { limited: false, retryAfterMs: 0 };
}

export function resetRateLimits() { buckets.clear(); } // tests
export function getRateLimitSize() { return buckets.size; }
```

- **Window/max from env** — `packages/env/src/server.ts` adds the vars listed in §3.6. No hardcoded numbers remain in route files; they import `env`.
- **Counters for observability** — `Map<string, number>` of `429` hits per route per window, incremented on every `limited:true`, exposed via a helper for logging and (future) admin query.
- **No timers** — window expiry is lazy on next hit (same as chat), so there are no interval handles to leak.

> Future switch to Redis is a one-file swap: replace the `Map` with `INCR` + `EXPIRE` in `secondaryStorage` or an explicit `ioredis` client, preserving the same middleware surface.

### 3.3 Auth — better-auth native

Configure `rateLimit` directly in `packages/auth/src/index.ts` `createAuth()`:

- **Store:** default in-memory (single node). No `secondaryStorage`.
- **Global defaults:** `window: 60_000` (or env), `max: 100` generic (high — specific endpoints override stricter).
- **Overrides (must exist after ship):**

| Endpoint / purpose | Window | Max | Key |
|--------------------|--------|-----|-----|
| `POST /api/auth/sign-in/email` (password login) | `15 min` | `5` | IP + account (`email` lowercased) — prevents credential stuffing while not locking unrelated users behind NAT |
| `POST /api/auth/sign-up/email` (blocked path — still rate-limit) | `60 min` | `5` | IP |
| `POST /sign-up/student` (student-number registration plugin) | `60 min` | `10` | IP |
| `POST /api/auth/forget-password` / `reset-password` | `60 min` | `3` | IP + email |
| `GET /api/auth/callback/google` | `1 min` | `20` | IP |
| `POST /api/auth/sign-out` | `1 min` | `30` | userId|IP |

- **Response:** better-auth's built-in `429` already includes `Retry-After`; ensure it propagates through `svelteKitHandler` in `apps/web/src/hooks.server.ts:25-43` (no extra work, but verify no header stripping).
- **Env:** `RATE_LIMIT_AUTH_LOGIN_WINDOW_MS`, `RATE_LIMIT_AUTH_LOGIN_MAX`, `RATE_LIMIT_AUTH_SIGNUP_WINDOW_MS`, `RATE_LIMIT_AUTH_SIGNUP_MAX`, `RATE_LIMIT_AUTH_RESET_WINDOW_MS`, `RATE_LIMIT_AUTH_RESET_MAX` — all with defaults matching table, validated via `z.coerce.number().int().min(1)`.

### 3.4 Chat — refine existing limiter

Keep `apps/web/src/routes/api/chat/stream/+server.ts` pattern but:

1. Move window/max to env: `RATE_LIMIT_CHAT_WINDOW_MS` (default `60_000`) and `RATE_LIMIT_CHAT_MAX` (default `10`) — validated in `packages/env/src/server.ts`.
2. Extract `isRateLimited` to the shared module (§3.2) so chat and oRPC share pruning logic and tests.
3. On `limited:true`, return:

```ts
return json(
  { error: "Too many requests — try again in a minute." },
  { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
);
```

4. Preserve composite key `user:{id}|ip:{ip}` — use helper `getClientIp(request, getClientAddress)` that prefers `X-Forwarded-For` first value, then `getClientAddress()`, then omitted suffix.

No change to Gemini pacing; it stays token-bucket and independent.

### 3.5 Queue — the load-bearing surface

#### Surfaces & limits (proposed — interview: "spec proposes tested values", env-overridable)

| Procedure | Window | Max | Key | Rationale |
|-----------|--------|-----|-----|-----------|
| `student.joinQueue` | `30 s` | `1` per user, and global `50 / 10 s` (two buckets, either can 429) | per-user: `user:{id}` (+ optional `|ip:{ip}` for logging); global: `global:joinQueue` | Per-user stops retry-loop spam; global burst cap absorbs the exact "50 at once" event without DB thundering herd. |
| `student.leaveQueue` | `30 s` | `5` per user | `user:{id}` | Allows correcting a misclick but not flap spam. |
| `student.getMyQueueStatus` | `60 s` | `30` per user | `user:{id}` | Polling is legitimate; `30/min` caps runaway tabs while keeping the existing `intervalWhileVisible` (~3 polls/min) far below the limit. |
| `student.getMySteps` / `getDepartments` | `60 s` | `60` per user | `user:{id}` | Reads are cheap; limit only prevents pathological loops. |

> Instructor queue reads (`getMyQueues`, `heartbeat`) and admin reads are not limited in Phase 1. If post-launch metrics show adviser polling pressure, add `instructor.*` limits in Phase 2 with the same middleware.

#### Two-bucket check for `joinQueue`

```ts
// packages/api/src/routers/student/queue/queue.ts
const perUser = isRateLimited(`queue:join:user:${ctx.session.user.id}`, env.RATE_LIMIT_QUEUE_JOIN_WINDOW_MS, env.RATE_LIMIT_QUEUE_JOIN_MAX);
if (perUser.limited) throw rateLimitError(perUser.retryAfterMs);

const global = isRateLimited(`queue:join:global`, env.RATE_LIMIT_QUEUE_JOIN_GLOBAL_WINDOW_MS, env.RATE_LIMIT_QUEUE_JOIN_GLOBAL_MAX);
if (global.limited) throw rateLimitError(global.retryAfterMs);

// ... then the existing atomic join logic (transaction / conditional update)
```

`rateLimitError` is a helper that throws `new ORPCError("TOO_MANY_REQUESTS", { message: "...", data: { retryAfterSeconds } })` and ensures the HTTP layer will map to `429` with `Retry-After`.

#### Global bucket semantics

- The global bucket is intentionally *shared across users* and windowed short (10 s) so a single classroom of 50 can enqueue within ~10 s across two windows if they all arrive at the same millisecond, but a bot hammering `joinQueue` in a loop cannot hold the lock.
- Because it is in-memory, it resets on process restart — acceptable for single-node; restart clears burst pressure.

#### Correctness under concurrency

Rate limiting is an overload guard, not the correctness mechanism. FIFO correctness must be enforced atomically at the DB layer *after* the limiter passes:

- The join procedure must assign `position` inside a transaction or via an atomic `findOneAndUpdate`/`updateMany` conditional that guarantees monotonic position (no duplicate positions when 50 transactions interleave). The spec does not redesign the queue algorithm, but it requires that the existing `I1–I4` conditional-update discipline (`H5` fixes in `audit.md:69` and `remediation status:173`) is preserved for `joinQueue` and verified under concurrent load.
- The load test (§5) asserts: after 50 concurrent successful joins, positions are `1..N` with no gaps/duplicates and the queue's DB state matches the returned positions.

### 3.6 oRPC middleware shape

New module `packages/api/src/lib/rate-limit.ts` exports:

```ts
export type RateLimitOpts = { windowMs: number; max: number; keyPrefix: string; globalKey?: string; globalWindowMs?: number; globalMax?: number };
export function createRateLimitMiddleware(opts: RateLimitOpts);
```

Usage (per procedure file):

```ts
import { protectedProcedure } from "@steps/api";
import { createRateLimitMiddleware } from "@steps/api/lib/rate-limit";
import { env } from "@steps/env/server";

// joinQueue — per-user + global
const joinQueueLimit = createRateLimitMiddleware({
  windowMs: env.RATE_LIMIT_QUEUE_JOIN_WINDOW_MS,
  max: env.RATE_LIMIT_QUEUE_JOIN_MAX,
  keyPrefix: "queue:join:user",
  globalKey: "queue:join:global",
  globalWindowMs: env.RATE_LIMIT_QUEUE_JOIN_GLOBAL_WINDOW_MS,
  globalMax: env.RATE_LIMIT_QUEUE_JOIN_GLOBAL_MAX,
});
export const joinQueue = protectedProcedure.use(joinQueueLimit).route(/* ... existing handler ... */);
```

- The middleware extracts `ctx.session.user.id` for authed procedures and IP via `getClientIp` helper injected through `context` (or read from `request.headers` if oRPC exposes it; otherwise resolve IP at the SvelteKit `+server.ts` layer and pass via context).
- IP resolution helper `getClientIp(request, getClientAddress?)` lives in `packages/api/src/lib/get-client-ip.ts` and is imported by both the oRPC middleware and `apps/web/src/routes/api/chat/stream/+server.ts` so there is one XFF-aware implementation.
- On limit, middleware throws `ORPCError("TOO_MANY_REQUESTS")`; an oRPC error interceptor maps it to HTTP `429` with `Retry-After`.
- Non-auth procedures (currently none rate-limited) would use an `ipOnly` key variant.

### 3.7 HTTP mapping & headers

- **Status:** `429 Too Many Requests` for every limiter.
- **Headers (all 429s):** `Retry-After: <seconds>` (integer, ceil), `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset: <epoch seconds>` (optional, helpful for debugging; include if cheap).
- **Body (oRPC):** `ORPCError` with `code: "TOO_MANY_REQUESTS"`, `message: "Too many requests — try again in Xs."`, `data: { retryAfterSeconds }`. Clients switch on `code`.
- **Body (REST / chat):** `{ error: "Too many requests — try again in a minute." }` plus header.
- **No header stripping:** verify `apps/web/src/hooks.server.ts` does not strip `Retry-After`/`X-RateLimit-*` on the way out (it sets CSP/HSTS but should pass through custom headers).

### 3.8 Client UX (Svelte)

- Shared helper `apps/web/src/lib/rate-limit.ts` exports `parseRetryAfter(response)` (reuse `parseRetryAfterSeconds` from `apps/web/src/lib/chat/model-router.ts:176` and `stream-helpers.ts:133`).
- Queue UI (`apps/web/src/lib/student/state.svelte.ts`, `apps/web/src/components/student/*`): on `TOO_MANY_REQUESTS` / `429`, render an inline message `"The queue is busy — retry in Xs"` with a live countdown derived from `retryAfterSeconds`. No auto-retry. The button stays disabled until countdown hits 0, then re-enables.
- Auth UI (`apps/web/src/components/auth/*`): same countdown pattern for login/reset forms; failed attempts show remaining attempts when headers include `X-RateLimit-Remaining`.
- Chat UI (`apps/web/src/components/student/ChatTab.svelte`): already surfaces server error; upgrade to prefer `Retry-After` countdown when `429`.

### 3.9 Observability

- **Log every 429** (interview decision): `console.warn("[rate-limit] 429", { route, keyPrefix, userId, ip, retryAfterSeconds, timestamp })`. Use a single call site inside the shared limiter so log shape is uniform.
- **In-memory counters:** `Map<string, { count, firstAt, lastAt }>` keyed by `route|window`. Increment on each 429. Expose via:
  - `GET /healthz` extension is out of scope for Phase 1, but the module exports `getRateLimitStats()` so a future `admin.getRateLimitStats` procedure can read it without code churn.
  - Counters are best-effort (lost on restart), acceptable for single-node.
- **No PII beyond id/IP in logs** — ensure logs do not include email or message bodies.
- **Journal visibility:** `journalctl -u erpsys -f | grep rate-limit` is the operator's quick check (document in `docs/server-deployment.md:11` verification section).

### 3.10 Environment variables (new)

All added to `packages/env/src/server.ts:25-46` with `z.coerce.number().int().min(1)` and defaults:

| Var | Default | Purpose |
|-----|---------|---------|
| `RATE_LIMIT_CHAT_WINDOW_MS` | `60000` | Chat sliding window |
| `RATE_LIMIT_CHAT_MAX` | `10` | Chat max per window per `user|IP` |
| `RATE_LIMIT_AUTH_LOGIN_WINDOW_MS` | `900000` (`15 min`) | Login window |
| `RATE_LIMIT_AUTH_LOGIN_MAX` | `5` | Login max per window per IP+email |
| `RATE_LIMIT_AUTH_SIGNUP_WINDOW_MS` | `3600000` | Student signup window |
| `RATE_LIMIT_AUTH_SIGNUP_MAX` | `10` | Signup max per IP |
| `RATE_LIMIT_AUTH_RESET_WINDOW_MS` | `3600000` | Password reset window |
| `RATE_LIMIT_AUTH_RESET_MAX` | `3` | Reset max per IP+email |
| `RATE_LIMIT_QUEUE_JOIN_WINDOW_MS` | `30000` | `joinQueue` per-user window |
| `RATE_LIMIT_QUEUE_JOIN_MAX` | `1` | `joinQueue` per-user max |
| `RATE_LIMIT_QUEUE_JOIN_GLOBAL_WINDOW_MS` | `10000` | `joinQueue` global window |
| `RATE_LIMIT_QUEUE_JOIN_GLOBAL_MAX` | `50` | `joinQueue` global max |
| `RATE_LIMIT_QUEUE_STATUS_WINDOW_MS` | `60000` | `getMyQueueStatus` window |
| `RATE_LIMIT_QUEUE_STATUS_MAX` | `30` | `getMyQueueStatus` max per user |
| `RATE_LIMIT_QUEUE_LEAVE_WINDOW_MS` | `30000` | `leaveQueue` window |
| `RATE_LIMIT_QUEUE_LEAVE_MAX` | `5` | `leaveQueue` max per user |

Document every var in `docs/server-deployment.md:2` (env table) and `.env.example` with the same defaults.

---

## 4. File & Module Map

| File | Action | Notes |
|------|--------|-------|
| `packages/api/src/lib/rate-limit.ts` | **Create** | Shared sliding-window `isRateLimited`, `createRateLimitMiddleware`, `resetRateLimits`, `getRateLimitStats`, `rateLimitError` |
| `packages/api/src/lib/get-client-ip.ts` | **Create** | `getClientIp(request, getClientAddress?)` — prefers `X-Forwarded-For` first IP, falls back to `getClientAddress()`, trims/lowercases, validates IPv4/IPv6 vaguely |
| `packages/api/src/routers/student/queue/queue.ts` | **Modify** | Wrap `joinQueue`, `leaveQueue`, `getMyQueueStatus` with new middleware; map errors to 429+Retry-After |
| `packages/api/src/routers/student/evidence/*` | **No change Phase 1** | Reserved — add `evidenceLimit` middleware later if adopted |
| `packages/auth/src/index.ts` | **Modify** | Add `rateLimit` object to `createAuth()` with the table in §3.3; driven by env |
| `apps/web/src/routes/api/chat/stream/+server.ts` | **Modify** | Import shared `isRateLimited`/`getClientIp`, read window/max from `env`, add `Retry-After` header |
| `apps/web/src/routes/rpc/[...rest]/+server.ts` | **Verify only** | Ensure `Retry-After`/`X-RateLimit-*` headers are not stripped; no new limiting here (oRPC middleware covers it) |
| `apps/web/src/hooks.server.ts` | **Verify only** | Same header pass-through check |
| `packages/env/src/server.ts` | **Modify** | Add all vars in §3.10 |
| `apps/web/src/lib/rate-limit.ts` | **Create** | Client helper `parseRetryAfter` + maybe `formatRateLimitMessage` |
| `apps/web/src/lib/student/state.svelte.ts` + queue components | **Modify** | Countdown + disabled state for `TOO_MANY_REQUESTS` |
| `apps/web/src/components/auth/*` | **Modify** | Countdown for login/reset 429s |
| `docs/server-deployment.md` | **Modify** | Env table, verification `curl` showing `Retry-After`, troubleshooting 429, log grep |
| `docs/gemini-api-rate-limits.md` | **No change** | Keep as Gemini-specific reference |
| `scripts/k6-queue-burst.js` (or `scripts/load-queue.mjs`) | **Create** | k6 script for §5 |
| `package.json` / `.env.example` | **Modify** | Add `k6` dev note, populate new env examples |

---

## 5. Verification — Load Test for 50 Concurrent

### 5.1 Tool

- Primary: `k6` (`https://k6.io`) — `k6 run scripts/k6-queue-burst.js`. Fallback/local-light: `autocannon` via `bunx autocannon`.
- No new runtime dep; `k6` is a single binary downloaded in CI/staging, or use `npm:k6` wrapper.

### 5.2 Script contract (`scripts/k6-queue-burst.js`)

- Setup: seed a clean academic year + department + 60 test student users (or reuse seeded ones) with `ADMIN_EMAILS` + `SEED_PASSWORD` flow. Seed script already at `packages/api/src/seed/*` (wired as `bun db:seed`).
- Scenario: `50` virtual users (VUs), each calls `student.joinQueue` via `POST /rpc/student.joinQueue` (or the actual oRPC route name) with valid session cookie (obtain via `auth.api.signInEmail` per VU or pre-minted session tokens).
- Duration: `30 s` burst, plus a `ramp` variant: `0→50 VUs in 5 s, hold 10 s, spike to 50 concurrent single-shot`.
- Assertions (all must pass):
  - HTTP: zero `5xx`, zero `ECONNRESET`, `429` rate is tolerated (global bucket) but successful joins after retry still counted; test asserts p50/p95 join latency `< 500 ms` for non-429 paths.
  - Correctness: after burst, `prisma.enrollmentQueue.findMany({ where: { academicYearId, departmentId }, orderBy: { position: "asc" } })` yields contiguous positions `1..N` (where `N` = count of successful joins), no duplicate `position` or `studentProfileId`, every joined student appears exactly once.
  - Logs: no unhandled promise rejections, no `MongoServerSelectionError`, warnings only for expected `429`s.

### 5.3 Environments

- **Must pass:** local dev (Windows/Linux) against `bun run dev` + local Mongo replica set (`data/db-replset`), and staging VPS (systemd + Caddy) against the deployed build. The VPS run is the gate for the "accommodate 50 at once without making server down" claim.
- CI: run the autocannon-light variant (10 VUs, 5 s) as `bun run test:load` or `k6 run --vus 10 --duration 5s` — do not run the full 50-VU burst in GitHub Actions (resource constrained), but keep the script runnable.

### 5.4 Existing tests to keep green

- `bun run lint`, `bun run check-types`, `bun run format:check`, `bun run test` (Vitest) — all currently 95/95 per `audit.md:160`.
- The rate-limit unit tests (new) must cover: window expiry, bucket isolation per key, global bucket interaction, `Retry-After` ceiling, prune at 10k, and IP extraction with/without `X-Forwarded-For`.

---

## 6. Deployment & Ops

- **Deploy order (per `docs/server-deployment.md:10` safe update):**
  1. `git pull --ff-only; bun install --frozen-lockfile`
  2. `bun run build` (while old version serves)
  3. Verify env file has the new `RATE_LIMIT_*` vars (or rely on defaults) — `bun run check-types` will fail if any required var is added without default, so keep defaults.
  4. `systemctl restart erpsys` (1–3 s downtime)
  5. `curl -s http://127.0.0.1:3000/healthz` and `curl -i -X POST http://127.0.0.1:3000/rpc/student.joinQueue -H 'Cookie: ...'` probe for `429` header behavior via a 2x rapid repeat.

- **Reverse proxy note:** Caddy/nginx stay unchanged. The `X-Forwarded-For` header must be forwarded (Caddy `reverse_proxy 127.0.0.1:3000` does; nginx template already has `X-Forwarded-For` via `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` per `docs/server-deployment.md:7.2`). Verify this forwarding is present; if not, add it — otherwise all IPs appear as `127.0.0.1` and per-IP nets collapse.

- **Firewall / TLS:** no change.

---

## 7. Phases

| Phase | Scope | Gate |
|-------|-------|------|
| **Phase 0 — Foundation** | Create `rate-limit.ts` + `get-client-ip.ts`, add env vars + `.env.example` + `docs/server-deployment.md` updates, wire chat to shared module, keep existing `10/min` semantics but with `Retry-After`. Unit tests for limiter + IP helper. | `lint`, `check-types`, `format:check`, `test` green; no behavior change beyond headers. |
| **Phase 1a — Auth** | Configure `better-auth` `rateLimit` with table in §3.3, verify headers pass through handlers. | Manual: 6 rapid failed logins → `429` with `Retry-After`; unit test for config shape. |
| **Phase 1b — Queue burst (load-bearing)** | Wrap `joinQueue`/`leaveQueue`/`getMyQueueStatus` with middleware per §3.5, implement global bucket, verify correctness under concurrency, author k6 script. | `k6` 50-VU burst passes locally **and** on staging VPS (p95 < 500 ms, zero 5xx, contiguous positions). |
| **Phase 1c — Client UX** | Countdown + disabled state for queue + auth 429s using `Retry-After`. | Manual UI: trigger 429 (rapid join attempt) → countdown renders, button re-enables at 0. |
| **Phase 1d — Observability & docs** | Log every 429 + counters, document `journalctl` grep, add load-test runbook to `docs/server-deployment.md`. | `journalctl -u erpsys | grep rate-limit` shows structured warnings after a 429. |
| **Phase 2 (deferred)** | Upload throttling, instructor poll limits, Turnstile challenge on repeated 429s, admin dashboard for counters, persistent store if ever needed. | Based on post-launch metrics. |

Each phase is independently shippable; Phase 1b is the blocker for the "50 at once" requirement.

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| In-memory buckets reset on restart → short burst window after deploy | Low | Acceptable for single-node; restart is rare (1–3 s). Document that a deploy immediately before enrollment opening could clear global burst cap for ~10 s. |
| NAT classroom (many students one public IP) hit global `50/10s` unfairly | Medium | Global cap is intentionally short (10 s) and high (50); per-user bucket is the binding limit for well-behaved users. If complaints arise, raise global `max` via env. Keep per-user at `1/30s` to avoid penalizing NAT. |
| IP spoofing via forged `X-Forwarded-For` | Low | Trust only the leftmost value and still combine with `userId`; a student cannot spoof another student's `userId` bucket. Consider `trustProxy: true` guard (only trust XFF when `req` came from `127.0.0.1`/Caddy). Document. |
| Sweep jobs still run inline on every poll during burst | Medium | Not changed in Phase 1 (per `audit.md:184` deferred), but measure; if `sweepStale*` shows in k6 latency, debouncing to ~1/min is the agreed next step (`M6`). |
| better-auth `rateLimit` storage mismatch with shared limiter | Low | They are independent stores by design — auth uses better-auth's own memory, queue/chat uses `rate-limit.ts`. Document that they reset independently. |
| `getClientAddress()` throws on some platforms (per `+server.ts:110`) | Low | Shared helper catches and falls back to `user:{id}`-only key (still rate-limited). |

---

## 9. Alternatives Considered & Rejected

| Alternative | Why rejected |
|-------------|--------------|
| **Redis / Upstash** | Single-node VPS has no Redis; adding one is operational cost for no current scaling need. Roadmap note kept, not required. Decision: interview chose single node. |
| **Proxy-level `limit_req`** | Would protect before Node, but Caddy's rate module is less flexible per-user/role, cannot introspect `session.user.id`, and the team chose app-level only (simpler, testable, oRPC-aware). |
| **Token-bucket for all** | Allows bursts up to capacity silently, which is good for Gemini but undesirable for queue where strict `1/30s` per user is the intent. Sliding window chosen for consistency and stricter fairness. |
| **`hooks.server.ts` catch-all** | Cannot differentiate `joinQueue` (strict) from `getMyQueueStatus` (looser) without URL/path coupling to oRPC internals. oRPC middleware keeps limits co-located with procedure logic. |
| **Captcha / Turnstile on 429** | Useful for bot resistance but heavier UX + secret wiring; deferred to Phase 2 if log metrics show abuse. Current answer is countdown + manual retry. |

---

## 10. Acceptance Criteria

- [ ] `packages/env/src/server.ts` validates all vars in §3.10 with defaults; `lint`/`check-types`/`test`/`format:check` green; `.env.example` updated.
- [ ] Shared limiter module exists with unit tests covering window expiry, per-key isolation, global bucket interaction, `Retry-After` math, pruning.
- [ ] `auth` config throttles `sign-in/email` `5/15 min` per IP+email and renders `Retry-After`.
- [ ] `POST /api/chat/stream` still enforces `10/60s` per `user|IP` but now returns `Retry-After` and shares the limiter module.
- [ ] `student.joinQueue` enforces per-user `1/30s` and global `50/10s`, returns `429` + `Retry-After` + `TOO_MANY_REQUESTS` with `data.retryAfterSeconds`; UI shows countdown and disables retry until expiry.
- [ ] `student.leaveQueue` and `student.getMyQueueStatus` enforce their windows.
- [ ] Log + counters: every `429` is `console.warn` + counted in `getRateLimitStats()`.
- [ ] Load test `scripts/k6-queue-burst.js` (or equivalent) exists, is documented, and passes locally + on staging VPS: 50 VUs, 30 s, p95 < 500 ms, zero `5xx`, contiguous positions, no duplicate positions.
- [ ] `docs/server-deployment.md` documents new env vars, `curl` verification with `Retry-After`, `journalctl` grep, and `X-Forwarded-For` forwarding check.
- [ ] No proxy config change required; no new runtime dependency added (k6 is a binary/script, not a production dep).

---

## 11. Open Questions (Resolved or Deferred)

- **Resolved:** all interview rounds answered — see §1.2.
- **Deferred:** upload throttling (add when evidence abuse observed), instructor poll limits (`sweep` debouncing), persistent store (if scaling beyond one VPS), Turnstile integration (if 429 counters show sustained abuse).
- **For reviewer:** confirm global `50/10s` feels right for opening-day burst. If enrollment day expects >100 students queuing within 10 s, raise default to `100/10s` via env before Phase 1b ships.

---

## 12. References

- Current limiter: `apps/web/src/routes/api/chat/stream/+server.ts:29-49,103-114`
- oRPC routing: `apps/web/src/routes/rpc/[...rest]/+server.ts:43-83`
- Auth instance: `packages/auth/src/index.ts:163`
- Procedure base: `packages/api/src/index.ts:20`
- Context: `packages/api/src/context.ts:7`
- Gemini limits doc: `docs/gemini-api-rate-limits.md`
- Deployment & proxy: `docs/server-deployment.md:7,11`
- Student queue procedures: `packages/api/src/routers/student/index.ts` → `queue/queue.ts`
- Gemini pacer (token bucket reference): `apps/web/src/lib/chat/model-router.ts:99-168`

---

*End of spec — implementation may begin at Phase 0. No code changes in this commit.*
