# App Launch Performance — Implementation Spec

**Status:** implemented
**Date:** 2026-10-19
**Source techniques:** [docs/ops/app_launch_performance_techniques.md](../ops/app_launch_performance_techniques.md)
**Scope:** all four consoles (`student`, `queue`, `officer`, `instructor`, `admin`)

---

## 1. Problem

ERPSYS is a client-rendered SPA served from one origin. A returning student on a
throttled connection currently has to wait through four dependent stages before
their first useful screen appears:

```
HTML  →  entry JS  →  /api/auth/get-session  →  per-surface data queries
```

Every stage is a hard dependency on the previous one, and the per-surface stage
is itself 3–5 parallel requests. Nothing is cached across visits, so a warm
launch pays the full chain again. On top of that the entry bundle carries every
console, so the slow part is paid even by a student who will never see the
officer or admin screens.

The techniques doc calls this "render first, refresh second". This spec applies
it to this codebase: persist the last useful state, render from it immediately,
collapse the post-session burst into one request, and keep the launch path
measured and budgeted.

---

## 2. Current launch path (verified against the code)

| #   | Stage                 | Where                                                                                                                           | Blocks first screen?                                                              |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `index.html`          | `apps/server/src/routes/errors.ts` `spaFallback` (HTML cached in a module variable)                                             | yes                                                                               |
| 2   | Entry bundle          | `apps/web/index.html` → `apps/web/src/main.tsx`                                                                                 | yes — 407 KB gzip (local build, see §2.1)                                         |
| 3   | Session               | `apps/web/src/app/guards.tsx` `RootGate` → `authClient.useSession()` → `/api/auth/get-session`                                  | yes — renders `<PageLoader label="Loading session" />` until `isPending` is false |
| 4   | Student profile probe | `RootGate` → `api.student.profileStatus` (`/api/v1/me/student/profile`), enabled only when role is `STUDENT`                    | drives the completion gate, not first paint                                       |
| 5   | Surface data          | `apps/web/src/lib/student/state.ts`, `lib/officer/queries.ts`, `lib/instructor/state.ts`, `app/admin-page/use-admin-console.ts` | yes — page renders skeletons/`PageLoader` until the first response                |
| 6   | Flags                 | `lib/integrations/use-integrations.ts` (`/api/v1/integrations`)                                                                 | no, defaults to all-on                                                            |

Session is observed three times (`RootGate`, `RequireApp`/`useSessionGuard`,
`Header`) but TanStack Query dedupes it, so stage 3 is one request.

### 2.1 Bundle baseline

Measured from the current `apps/web/dist` (untracked build output; re-baseline
after enabling the manifest in Phase 0):

| Asset                              | Raw     | Gzip       |
| ---------------------------------- | ------- | ---------- |
| `index-*.js` (entry)               | 1355 KB | **407 KB** |
| `pdfmake-*.js` (already dynamic)   | 948 KB  | 334 KB     |
| `Helvetica-*.js` (already dynamic) | 281 KB  | 52 KB      |
| `index-*.css`                      | 111 KB  | 17 KB      |

`router.tsx` imports every page eagerly, and `app/pages.tsx` re-exports
`OfficerPage`/`InstructorPage`, so all four consoles are in the entry chunk.
`pdfmake` is already lazy (`lib/report/pdf.ts` uses dynamic `import()`) — use it
as the precedent for route splitting.

### 2.2 Per-surface requests at mount

| Surface       | Requests issued on mount                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/student`    | `/api/v1/me/student`, `/api/v1/me/queue`, `/api/v1/me/notifications`, `/api/v1/integrations`, `/api/v1/me/student/profile` (via `RootGate`) |
| `/queue`      | `/api/v1/me/student`, `/api/v1/me/queue`, `/api/v1/me/departments` (conditional)                                                            |
| `/officer`    | `/api/v1/me/overview`, `/api/v1/submissions?status=PENDING…` (bell), `/api/v1/profiling-form`, `/api/v1/social-links`                       |
| `/instructor` | `/api/v1/me/notifications`, `/api/v1/transfers`, `/api/v1/queues`, `/api/v1/departments`                                                    |
| `/admin`      | `/api/v1/me/overview`, `/api/v1/profiling-form`                                                                                             |

All of these are independent and already run in parallel inside TanStack Query.
The win is not intra-surface parallelism — it is removing the session
dependency, collapsing the burst into one request, and persisting the result.

### 2.3 Delivery

- `express.static(webDist)` in `apps/server/src/app.ts` sets no explicit cache
  policy. `docs/ops/deployment.md` shows Nginx serving `/assets/` as
  `immutable, 1y`, so production is already covered; standalone-API mode
  (`SERVE_WEB`, no Nginx) revalidates every hashed asset.
- `spaFallback` sends `index.html` with no `Cache-Control`.
- No service worker anywhere in `apps/web`.

---

## 3. Goals / non-goals

**Goals**

1. A warm launch renders the last useful screen **before any network response**.
2. A cold launch reaches the first useful screen in **one** post-shell round
   trip instead of a session hop plus a surface burst.
3. The entry bundle stops carrying consoles the user cannot open.
4. Launch performance is measured in production and protected by a CI budget.
5. All existing guard, live-update, and authorization behavior is preserved.

**Non-goals**

- No service worker and no offline mode. With no network the app still fails to
  boot; that is a separate future spec.
- No server-side rendering or hydration.
- No redesign of the screens themselves.
- No change to polling cadence or SSE semantics.
- No new runtime flags — phases ship independently and are individually
  revertible by reverting their PR.

---

## 4. Decisions taken during review

| Question                    | Decision                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Surfaces                    | All four consoles, plus the shared shell/guards                                          |
| Cached-first aggressiveness | Cache everything the first screen renders                                                |
| Server changes              | Allowed, including a new aggregate launch endpoint                                       |
| Cache storage               | TanStack Query persistence (`@tanstack/react-query-persist-client`) over `localStorage`  |
| Shared lab machines         | `localStorage` accepted; clear on sign-out, clear on user mismatch, 24h cap              |
| Staleness UX                | Silent stale-while-revalidate                                                            |
| Cache age                   | Hard 24h cap; older entries are dropped, not rendered                                    |
| Session gate                | No role hint — persist the session query result and revalidate behind it                 |
| Aggregate API               | Seed the existing query keys from `GET /api/v1/me/launch`                                |
| Multi-surface roles         | Landing surface only (the surface `homeRouteForRole` sends them to)                      |
| Cache versioning            | Build-id buster **and** a hand-maintained schema version **and** per-entry age check     |
| Multi-tab                   | Clear the persisted cache on the cross-tab sign-out event                                |
| Storage failure             | Silent fallback to today's behavior                                                      |
| Code splitting              | Lazy route chunks **and** manual vendor chunks                                           |
| Measurement                 | In-house `performance.mark`s, `web-vitals`, CI bundle budget                             |
| CI gate                     | Node script over the Vite build manifest (no Lighthouse, no new CI service)              |
| Rollout                     | Phased PRs, no flags                                                                     |
| Tests                       | Unit + RTL integration; the new endpoint gets colocated server tests per repo convention |
| Docs deliverable            | This spec only; the README index and any runbook land with implementation                |

---

## 5. Design

### 5.1 The launch queue

Requests are grouped by what they gate, not by resource:

| Priority              | Work                                                                                              | May block first paint?                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **P0 — Restore**      | Hydrate the persisted query cache from `localStorage`; render the app shell and the cached screen | yes (synchronous read, one microtask)                         |
| **P1 — Session**      | `/api/auth/get-session` revalidation; guards re-evaluate against it                               | no — the cached value renders the gate                        |
| **P2 — Landing data** | `GET /api/v1/me/launch`, fired **concurrently with P1**, not after it                             | no — seeds the cache and replaces cached values when it lands |
| **P3 — Live**         | Existing SSE (`/api/events`) and the 20–30s polling backstop                                      | no                                                            |
| **P4 — Secondary**    | Navigation to another console, reports, filtered officer lists, detail sheets                     | no — fetched on demand                                        |

The key structural change: `/me/launch` only needs the **cookie**, not the
client-side session result, so it can be issued at boot alongside
`get-session`. The chain in §1 collapses from four stages to
`HTML → JS` in parallel with `{session, launch}`.

### 5.2 Persisted query cache

**New modules**

| File                                      | Responsibility                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/perf/persist.ts`        | Persister instance, storage key layout, buster, `maxAge`, dehydration allowlist, quota cleanup, `clearPersistedCache()` |
| `apps/web/src/lib/perf/cache-policy.ts`   | `SCHEMA_VERSION`, per-query cacheability, `LAUNCH_STALE_MS`, size caps                                                  |
| `apps/web/src/lib/perf/launch-metrics.ts` | Phase marks and the `window.__erpsysLaunch` snapshot                                                                    |

**Configuration**

```ts
// lib/api.ts — created once at module scope, unchanged call sites
export const queryClient = new QueryClient({
  gcTime: CACHE_MAX_AGE_MS,          // 24h, so persisted entries are never
                                     // garbage-collected before maxAge
  defaultOptions: {
    queries: { retry: /* unchanged */ },   // staleTime stays 0 by default
  },
});
```

- `PersistQueryClientProvider` replaces `QueryClientProvider` in
  `apps/web/src/main.tsx`. `main.tsx` awaits the restore promise (a
  microtask with `localStorage`) before `createRoot`, so the first render
  already has data. Guard with a ~150ms timeout in case a future persister is
  async.
- `maxAge: 24h`; `buster: `${SCHEMA_VERSION}:${APP_BUILD_ID}``;
`throttleTime: 1_000` (localStorage writes are synchronous and must not run on
  every keystroke-driven query update).
- `shouldDehydrateQuery`: allowlist by query-key prefix (keys are
  `[role, procedure, input]` from `makeLeaf` in `lib/api.ts`), reject queries
  whose serialized payload exceeds `MAX_ENTRY_BYTES` (64 KB), and reject entries
  whose `dataUpdatedAt` is older than `CACHE_MAX_AGE_MS`.
- Serialized total is capped at `MAX_CACHE_BYTES` (256 KB). On overflow, drop the
  oldest entries by `dataUpdatedAt` and write once.
- Only the current schema version's storage key is written. At boot, delete keys
  under the `erpsys:query-cache:` prefix that do not match the current
  `SCHEMA_VERSION`; keep at most two (current + previous) so a rollback does not
  start completely cold.
- All reads/writes are wrapped in `try/catch`. Quota errors, private-mode throws,
  and JSON parse failures mean "no cache" — no toast, no banner. In development,
  `console.warn` once per cause.

**Session entry.** Persist the better-auth session query so `RootGate` resolves
from cache. The query key belongs to better-auth internals, so:

1. Pin it in one exported constant next to `authClient` (`lib/auth-client.ts` or
   `lib/perf/cache-policy.ts`).
2. Add a unit test that renders `authClient.useSession()` in a
   `QueryClientProvider` and asserts the key observed by the cache matches the
   constant. A better-auth upgrade that renames the key must fail this test
   rather than silently stop caching.
3. If the key cannot be pinned on the installed version, fall back to **not**
   persisting the session (Phase 2 still delivers most of the win) and record
   the limitation in the spec's implementation notes.

**Cacheability allowlist (initial)**

| Prefix                                                                                                                       | Cached | Rationale                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `["student","getMySteps"]`                                                                                                   | yes    | the student first screen                                                             |
| `["student","getMyQueueStatus"]`                                                                                             | yes    | header chip / queue card                                                             |
| `["student","profileStatus"]`                                                                                                | yes    | completion gate needs it pre-session                                                 |
| `["notifications","listMine"]`                                                                                               | yes    | bell + instructor notices                                                            |
| `["admin","getIntegrations"]`                                                                                                | yes    | login and student surfaces read flags                                                |
| `["officer","getOverview"]`, `["officer","getBell"]`, `["officer","getProfilingForm"]`, `["officer","listSocialMediaLinks"]` | yes    | officer first screen                                                                 |
| `["instructor","getMyQueues"]`, `["instructor","listDepartments"]`, `["instructor","listMyTransferRequests"]`                | yes    | instructor first screen                                                              |
| `["admin","getOverview"]`, `["admin","getProfilingForm"]`                                                                    | yes    | admin first screen                                                                   |
| `["officer","listByStep"]`, `["officer","searchStudents"]`, report/download queries, `getStudentRecord`, upload content      | no     | filtered, large, or capped report payloads (see `REPORT_ROW_CAP` in `lib/report.ts`) |

Filtered queries are excluded because the filter set is in the key: persisting
them multiplies the entry count without improving launch.

### 5.3 Aggregate launch endpoint

**Route**

```
GET /api/v1/me/launch
requireSession
→ 200 { data: { surface, generatedAt, schemaVersion, data: <surface payload> } }
→ 401 when there is no session
```

- `surface` is the landing surface for the session role. Add
  `landingSurfaceForRole(role)` to `apps/server/src/lib/domain/roles.ts`,
  matching the client's `homeRouteForRole` in `apps/web/src/lib/auth/redirect.ts`
  **exactly** — notably `ADMIN → admin` and `SBO_OFFICER → officer`. Note that
  `SURFACES_FOR_ROLE.ADMIN` starts with `officer`; do not use array order for
  this mapping. A colocated test asserts the two functions agree for all roles,
  and the web helper should consume the server-owned function so there is one
  source of truth (`@erpsys/server/roles` is already in the export map).
- Each surface payload is the **exact inner shape** that surface's existing
  endpoints return, so seeding is a straight `setQueryData`:
  - `student`: `getMySteps`, `getMyQueueStatus`, `notifications.listMine`,
    `profileStatus`, `integrations` (flags only)
  - `officer`: `getOverview`, `getBell`, `getProfilingForm`,
    `listSocialMediaLinks`
  - `instructor`: `getMyQueues`, `listDepartments`,
    `listMyTransferRequests`, `notifications.listMine`
  - `admin`: `getOverview`, `getProfilingForm`
- For roles that can enter more than one surface (`ADMIN`, `SBO_OFFICER`) only
  the landing surface is included. Visiting another console keeps today's query
  flow, starting from whatever the persisted cache already holds.
- No authorization changes: the builder reuses the same `requireSurface`-guarded
  read functions, so a payload can never contain data the corresponding route
  would refuse.

**Layering**

Register in `apps/server/src/routes/v1/launch.ts` and add the handlers under
`apps/server/src/routes/v1/launch/` (one file per surface builder), mounted from
`apps/server/src/routes/v1/index.ts` per the established registrar/subdirectory
pattern.

Read logic must move out of the route handlers into `lib/queries/` so the
aggregate endpoint and the existing routes share one implementation:

| Current handler                                                                             | Extract to                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `routes/v1/me/profile.ts` `GET /me/student` (line 47), `GET /me/student/profile` (line 304) | `lib/queries/student-launch.ts`                      |
| `routes/v1/me/queue.ts` `GET /me/queue` (line 38)                                           | `lib/queries/student-queue.ts`                       |
| `routes/v1/me/activity.ts` notifications read                                               | `lib/queries/notifications.ts`                       |
| `routes/v1/overview/summary.ts`                                                             | already a `handleOverview`; export the read function |
| `routes/v1/instructor/*` queue/department/transfer reads                                    | existing `lib/queries/*`, extend as needed           |

No new DB round trips are introduced: the endpoint runs the same reads, in
parallel with `Promise.all`, that the surface would have run itself. It replaces
2–5 browser requests with 1.

**Headers**

`Cache-Control: private, no-store`, `Vary: Cookie`. The response is
personalized; the browser-side cache is the `localStorage` snapshot, not HTTP.
Freshness comes from SSE and the polling backstop, so an ETag round trip buys
nothing.

### 5.4 Rendering rules

- A restored screen renders exactly as fresh data would; there is no banner,
  shimmer, or dimming.
- Entries older than 24h are dropped before render, never shown.
- The queue **position** is the one field where silence can mislead. The spec
  keeps the silent rule, but the queue card and header chip must show position
  only when `dataUpdatedAt` is within 2 minutes; older cached values render the
  card without a number ("checking your place…") until the launch/poll refresh
  lands. (This is a display rule on top of the silent policy, not a new
  loading state. See Open Question 1.)
- Cached data never authorizes anything: every mutation and every non-GET still
  goes to the server, and a 401 follows the existing sign-out/expiry path in
  `lib/auth/session-guard.ts`.
- The completion gate (`RootGate` + `lib/auth/completion-gate.ts`) keeps its
  semantics. A seeded `profileStatus` resolves it immediately; if the value is
  stale by more than 24h it is not rendered and the gate waits as it does today.

### 5.5 Seeding and de-duplication

`apps/web/src/lib/perf/launch-seed.ts`:

1. `prefetchLaunch()` is called from `main.tsx` when `location.pathname` is an
   app path (`/student`, `/queue`, `/officer`, `/instructor`, `/admin`,
   `/settings/*`, `/complete-profile`). It is not called on `/login`, `/auth/*`,
   or `/`.
2. On success it calls `queryClient.setQueryData` for each seeded key and marks
   them fresh for `LAUNCH_STALE_MS` (60s) — set through each query's
   `staleTime` in its `useQuery` call, not globally, so unrelated queries keep
   today's behavior.
3. A 401/403 is swallowed (the guards handle session loss); network errors fall
   back to the persisted snapshot plus the normal per-surface queries. Retries
   for this query are disabled.
4. If the persisted cache is absent, the launch response populates the screen
   before the per-surface queries mount.

`LAUNCH_STALE_MS` is what prevents a duplicate burst: without it, seeded
entries would immediately refetch because `staleTime` defaults to 0.

### 5.6 Bundle splitting and delivery

**Routes.** In `apps/web/src/app/router.tsx`, replace the eager page imports with
React Router's `lazy` on each child route, and remove the re-exports that pull
consoles into `app/pages.tsx`. Keep the shell eager: `HashRedirect`, `RootGate`,
`layouts.tsx`, `AppToaster`, and the login/realm pages (the signed-out cold entry
point). Wrap each lazy route in the existing `PageLoader` via a route-level
`HydrateFallback`/`Suspense` boundary.

**Prefetch.** Route-level laziness would otherwise add a chunk hop after the
session resolves. `lib/perf/preload-surface.ts` keeps a static
`Record<SurfaceId, () => Promise<unknown>>` of the same dynamic imports; the
launch seed calls the loader for the resolved landing surface at boot, so the
chunk downloads while the session and launch requests are in flight.

**Vendor chunks.** `vite.config.ts`:

- `build.manifest: true` (the budget gate consumes it)
- `build.rollupOptions.output.manualChunks`: `react`, `react-dom`,
  `react-router`, `@tanstack/*`, `better-auth`, `marked` + `dompurify`.
  `pdfmake` stays a dynamic chunk owned by `lib/report/pdf.ts`.

**Delivery.** When `SERVE_WEB` serves `apps/web/dist` directly:

- `express.static(webDist, { index: false, maxAge: "1y", immutable: true })`
  for `/assets`, and a separate `express.static` for the rest with
  `maxAge: 0`. Hashed filenames make the long TTL safe.
- `spaFallback` sets `Cache-Control: no-cache` on `index.html` so a deploy is
  picked up on the next navigation.
- Do not duplicate Nginx's gzip/brotli work; verify in deployment that Nginx is
  the front door, and leave compression out of Express.

**Boot placeholder.** Add a static markup block inside `#app` in
`apps/web/index.html` (same shape as `components/ui/PageLoader`) so the first
paint is not blank while the entry chunk parses. It is replaced when `createRoot`
renders.

### 5.7 Cross-tab and storage failure

- **Sign-out.** `components/UserMenu.tsx` already calls `queryClient.clear()`
  after a successful sign-out. Add `clearPersistedCache()` there and in
  `lib/auth/session-guard.ts` `switchAccount()`.
- **Cross-tab.** The sign-out path writes `erpsys:signed-out` through
  `markSignedOut()`. Add a `storage` listener (mounted once in `main.tsx`) that,
  on that key, calls `queryClient.clear()` + `clearPersistedCache()`. The
  existing flag is consumed by the login page, so the listener must only read it.
- **User mismatch.** After session revalidation, if
  `session.user.id !== persisted.ownerId`, clear the cache before rendering any
  personalized data. This covers the case where a different account signs in
  without an explicit sign-out in this tab.
- **Storage unavailable.** All failures degrade to no cache. No user-facing
  notice.

### 5.8 Measurement

`lib/perf/launch-metrics.ts` records, as `performance.mark`s and a
`window.__erpsysLaunch` object:

| Mark                                     | Recorded when                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `erpsys:boot`                            | first line of `main.tsx`                                                      |
| `erpsys:hydrated`                        | cache restore resolved                                                        |
| `erpsys:session`                         | session query settles (with `cached: boolean`)                                |
| `erpsys:launch`                          | launch query settles (with `cached: boolean`)                                 |
| `erpsys:first-surface`                   | first paint after the surface component has data (`useEffect` in `AppLayout`) |
| `erpsys:lcp`, `erpsys:inp`, `erpsys:cls` | `web-vitals` callbacks                                                        |

- `cold` vs `warm` is derived from `erpsys:hydrated` (any restored entries) and
  stored alongside the snapshot.
- Development: one `console.table` per launch.
- Production v1: no upload — the snapshot stays local and is read by the manual
  measurement procedure. A sampled `POST` to a client-metrics endpoint is a
  possible Phase 7 extension, not part of this spec.
- Add `web-vitals` to `apps/web` dependencies.

**CI budget gate.** `scripts/bundle-budget.mjs` reads
`apps/web/dist/.vite/manifest.json` and fails when:

| Budget                                      | Limit (gzip) |
| ------------------------------------------- | ------------ |
| entry (`src/main.tsx`)                      | 150 KB       |
| any route chunk                             | 80 KB        |
| total JS for the entry + its static imports | 220 KB       |
| CSS                                         | 25 KB        |

Wired into `.github/workflows/ci.yml` after `pnpm --filter web build`. It prints
a table even on success so growth is visible before it fails.

---

## 6. Performance targets

Proposed; confirm or adjust at review.

| Metric                                                     | Target                                 |
| ---------------------------------------------------------- | -------------------------------------- |
| Warm launch, first useful content (desktop, no throttling) | ≤ 400 ms                               |
| Warm launch, first useful content (Slow 4G, 4× CPU)        | ≤ 900 ms                               |
| Cold LCP (Slow 4G, 4× CPU)                                 | ≤ 2.5 s                                |
| Cold time to first useful screen                           | ≤ 3.5 s                                |
| Sequential launch requests after HTML                      | 0 on warm launch; 1 round trip on cold |
| Entry JS (gzip)                                            | ≤ 150 KB (from 407 KB)                 |
| `/me/launch` p75 server time                               | ≤ 800 ms                               |
| Broken-by-cache incidents                                  | 0                                      |

---

## 7. Phased plan

Each phase is a standalone PR. Phases 1 and 2 are independent; 3 depends on 2
(seeding needs a hydrated client); 4 depends on 3; 5 depends on 2; 6 depends on 1
and 2 being in place to measure.

### Phase 0 — Baseline and instrumentation

**Files:** `apps/web/src/lib/perf/launch-metrics.ts` (new), `apps/web/src/main.tsx`,
`apps/web/src/app/guards.tsx`, `apps/web/src/app/layouts.tsx`,
`apps/web/src/app/router.test.tsx` (only if fixtures need it),
`apps/web/package.json`, `apps/web/vite.config.ts`

**Changes:** add `web-vitals`; add marks and the snapshot object; enable
`build.manifest`; record the baseline table (cold/warm × Fast 3G/Slow 4G/desktop)
in this spec's §2.1 before any optimization lands.

**Acceptance:** `pnpm check` and `pnpm test` pass; marks appear in the dev
console; a baseline row exists for every surface; no behavior change.

### Phase 1 — Bundle and delivery

**Files:** `apps/web/src/app/router.tsx`, `apps/web/src/app/pages.tsx`,
`apps/web/src/main.tsx`, `apps/web/src/lib/perf/preload-surface.ts` (new),
`apps/web/vite.config.ts`, `apps/web/index.html`,
`apps/server/src/app.ts`, `apps/server/src/routes/errors.ts`,
`apps/server/src/routes/errors.test.ts` (if a fallback-header test fits there)

**Changes:** lazy console routes with a `PageLoader` boundary; remove eager
re-exports; vendor `manualChunks`; route-chunk prefetch for the landing surface;
Express static cache headers; boot placeholder.

**Acceptance:** entry ≤ 150 KB gzip; each console chunk ≤ 80 KB gzip; a signed-out
cold load of `/login` still renders without waiting on any console chunk;
client-side navigation to each console works; route tests pass.

### Phase 2 — Persisted cache

**Files:** `apps/web/src/lib/perf/persist.ts`, `lib/perf/cache-policy.ts` (new),
`apps/web/src/lib/api.ts`, `apps/web/src/main.tsx`,
`apps/web/src/components/UserMenu.tsx`, `apps/web/src/lib/auth/session-guard.ts`,
`apps/web/src/lib/auth-client.ts`

**Changes:** `PersistQueryClientProvider` with a localStorage persister;
24h `gcTime`/`maxAge`; buster + schema version; allowlist and size caps; stale-key
cleanup; restore-before-render; clear on sign-out and account switch; cross-tab
clear; session-key pinning test.

**Acceptance:** reloading `/student` (or any console) paints the previous screen
before `get-session` resolves; clearing `localStorage` reproduces today's
behavior exactly; a simulated quota error changes nothing for the user; sign-out
in one tab removes the snapshot and the second tab's next render is cached-clean.

### Phase 3 — Aggregate endpoint

**Files:** `apps/server/src/routes/v1/launch.ts` + `routes/v1/launch/*` (new),
`apps/server/src/routes/v1/index.ts`, `apps/server/src/lib/domain/roles.ts`,
`apps/server/src/lib/domain/roles.test.ts`,
`apps/server/src/lib/queries/student-launch.ts` + `student-queue.ts` +
`notifications.ts` (new/extended), `apps/server/src/routes/v1/me/profile.ts`,
`routes/v1/me/queue.ts`, `routes/v1/me/activity.ts`,
`apps/server/src/routes/v1/launch.test.ts` (new),
`apps/web/src/lib/api-routes.ts`, `apps/web/src/lib/api.ts`

**Changes:** `landingSurfaceForRole`; extract shared read functions; one endpoint
returning the landing surface's payload in existing envelopes; route entry in the
client URL table; no-store headers.

**Acceptance:** for each role the response's `surface` equals
`homeRouteForRole`'s destination; each payload validates against the shape the
existing endpoint returns for the same user (assert deep equality in tests);
`STUDENT` cannot receive officer/admin data; unauthenticated → 401; existing
endpoint tests unchanged.

### Phase 4 — Launch seeding

**Files:** `apps/web/src/lib/perf/launch-seed.ts` (new), `apps/web/src/main.tsx`,
`apps/web/src/lib/student/state.ts`, `apps/web/src/lib/officer/queries.ts`,
`apps/web/src/lib/instructor/state.ts`,
`apps/web/src/app/admin-page/use-admin-console.ts`,
`apps/web/src/lib/integrations/use-integrations.ts`,
`apps/web/src/lib/student/live-refresh.ts` (only if the seeded keys need a
targeted refresh)

**Changes:** fire launch at boot concurrent with the session; `setQueryData` for
every seeded key; `staleTime: LAUNCH_STALE_MS`; swallow 401; disable retries for
this query; prefetch the landing route chunk.

**Acceptance:** network panel shows one `/me/launch` and no duplicate surface
requests in the first 60s; cold launch shows the first surface after a single
round trip; SSE and the 20s backstop still refresh as before; a 401 on launch
leaves the guards and redirects untouched.

### Phase 5 — Hardening

**Files:** `apps/web/src/app/guards.tsx` (mismatch check),
`apps/web/src/lib/perf/persist.ts`, `apps/web/src/components/student/QueueChip.tsx`
and `apps/web/src/app/queue-cards.tsx` (position freshness rule)

**Changes:** user-id mismatch clears the cache; 2-minute queue-position display
rule; storage-failure logging in dev.

**Acceptance:** signing in as a different account never renders the previous
account's data after revalidation; a 6-hour-old snapshot shows the queue card
without a position number; private-mode run works.

### Phase 6 — Budget gate

**Files:** `scripts/bundle-budget.mjs` (new), `.github/workflows/ci.yml`,
`package.json` (script entry if the workflow calls one)

**Changes:** manifest budget with the §5.8 limits; fail CI on regression.

**Acceptance:** the gate passes on the merged tree and fails when a synthetic
oversized import is added locally (verified once, then removed).

---

## 8. Testing strategy

- **Unit (web, jsdom):**
  - `cache-policy.test.ts` — allowlist decisions, size caps, 24h expiry boundary.
  - `persist.test.ts` — buster/key layout, stale-key cleanup, quota throw,
    corrupt JSON, `clearPersistedCache()`.
  - `launch-metrics.test.ts` — marks recorded once, snapshot shape.
  - session query-key pinning test (Phase 2).
- **Integration (RTL):** render `StudentPage` / `OfficerPage` with a pre-seeded
  `QueryClient` and a fetch that never resolves; assert the cached content is on
  screen and no loader is shown. Same for the queue position freshness rule.
- **Server (colocated):** `launch.test.ts` — per-role payload equality, 401,
  surface confusion rejection, `roles.test.ts` agreement with the web redirect.
- **Guards:** existing `router.test.tsx` must keep passing; add a case proving a
  cached session still redirects on realm mismatch once revalidation lands.
- **Manual:** cold vs warm, Fast 3G / Slow 4G / offline, four consoles, shared
  account switch, second-tab sign-out.

Run `pnpm check` and `pnpm test` at every phase, plus
`pnpm --filter web build` for Phase 1 and 6.

---

## 9. Risks and mitigations

| Risk                                                | Mitigation                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Personalized data left on a shared lab machine      | 24h cap; clear on sign-out, account switch, and cross-tab sign-out; mismatch check after revalidation; residual risk accepted and documented  |
| Cached session shows a shell for an expired session | Cached session only chooses what to render, never what is allowed; all actions hit the server; the first 401 follows the existing expiry path |
| Stale queue position misleads a student             | Position hidden when older than 2 minutes; SSE/poll replaces it                                                                               |
| Duplicate requests after seeding                    | `LAUNCH_STALE_MS` on seeded queries; verified in the network panel                                                                            |
| better-auth changes its session query key           | Pinning test; fallback is to stop persisting the session                                                                                      |
| Build-id buster makes every deploy cold             | Accepted; deploys are infrequent and Nginx still serves hashed chunks. Cache keys prune to the last two versions                              |
| localStorage writes block the main thread           | `throttleTime: 1000`, 64 KB per-entry / 256 KB total caps                                                                                     |
| Route splitting adds a chunk hop                    | Landing chunk prefetched at boot                                                                                                              |
| Aggregate endpoint duplicates business rules        | Reads extracted to `lib/queries/*` and shared, not copied                                                                                     |
| Aggregation increases server load                   | One request replaces 2–5; the same reads run, in parallel; covered by the existing rate limiter                                               |
| Cached completion-gate state redirects wrongly      | Only `hasProfile === false` from an entry ≤ 24h triggers the existing redirect; the fresh launch/session revalidation corrects it             |
| Silent staleness hides a broken backend             | Dev-console marks and the `cached` flag on both session and launch marks make it visible without a user-facing banner                         |

---

## 10. Open questions

1. **Queue position silence.** This spec follows the "silent" decision but hides
   the position number after 2 minutes. Confirm that is the desired reading
   rather than showing the stale number with no cue.
2. **Nginx vs Express.** Confirm production always fronts `apps/web/dist` with
   Nginx (per `docs/ops/deployment.md`). If standalone `SERVE_WEB` is a supported
   deployment, the Express cache headers in Phase 1 become mandatory, not
   best-effort.
3. **Admin landing surface.** `homeRouteForRole("ADMIN")` returns `/admin` while
   `SURFACES_FOR_ROLE.ADMIN` begins with `officer`. This spec uses `/admin`.
   Confirm that is the intended admin landing.
4. **`isOutsideOrg` and completion status.** Should the launch payload carry
   these explicitly so `RootGate` can resolve every redirect before the session
   response, or is the profile-status entry enough?
5. **Client metrics.** Is a sampled client-side upload worth a new endpoint, or
   is the local snapshot plus manual measurement enough for the first release?
6. **Kiosk/lab deployment.** Should a browser-policy or build-time switch exist
   to disable persistence entirely for shared machines? (Currently out of scope;
   clearing covers the normal flows.)

---

## 11. Out of scope

- Service worker, offline shell, background sync.
- SSR, streaming HTML, or moving the SPA to a framework with server rendering.
- New database indexes or query-plan work (that belongs to
  `docs/specs/load-resilience-design.md`).
- Redesigning loading states beyond the boot placeholder.
- Changing SSE or polling cadence.
- Report generation, PDF export, uploads, and chat streaming paths.

---

## 12. Implementation notes (2026-10-19)

The phases above landed as one change. Where the code differs from the design,
the reason is recorded here.

- **Session caching.** The installed `better-auth` (1.6.27) exposes
  `useSession()` as a nanostore, not a TanStack Query, so there is no library
  query key to pin. The documented fallback ("do not persist the session") would
  have failed goal 1 — `RootGate` would still wait on `get-session` — so the
  implementation keeps a minimal 24h-capped **session snapshot** behind the live
  store (`lib/perf/session-cache.ts`, `lib/perf/use-launch-session.ts`). It
  chooses what to render, never what is authorized. `writeSessionSnapshot` is
  called when the live session lands; it is cleared on sign-out, account switch,
  cross-tab sign-out, a live signed-out result, and an owner mismatch.
- **Cross-tab signal.** `erpsys:signed-out` is `sessionStorage`, which is
  per-tab by design. `markSignedOut()` therefore also writes
  `erpsys:signed-out-broadcast` to `localStorage`; `connectCacheLifecycle()` in
  `lib/perf/persist.ts` reads and removes it, then clears the query cache and the
  persisted snapshot. The sessionStorage flag remains owned by the login page.
- **Restore timing.** `main.tsx` awaits `restorePersistedCache()` (150ms cap)
  before `createRoot`, rather than using `PersistQueryClientProvider`, whose
  effect-based restore runs after the first render. `persistQueryClient` still
  installs the write subscription, so subsequent cache changes are saved with
  `throttleTime: 1_000`.
- **Bundle budgets.** Measured after the split: entry 64.4 KB gzip, entry +
  static imports 197.6 KB, console route chunks 8.3–30.4 KB, CSS 18.7 KB. All
  inside the §5.8 limits; `scripts/bundle-budget.mjs` prints the table and fails
  CI on regression.
- **Excluded from persistence.** Filtered officer lists, report/download
  queries, `getStudentRecord`, and upload content, exactly as §5.2 lists.
- **`/me/launch` reads.** The student step read, queue status, notifications,
  overview, submission page, instructor queues, department listing, transfer
  listing, profiling form, and social links all moved into `lib/queries/` and are
  called by both the surface route and the launch builder. This is what keeps
  the payloads equal instead of copied.
