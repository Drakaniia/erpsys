# AGENTS.md

Guidance for agents and contributors working in this repository.

## What this is

ERPSYS — a pnpm monorepo with two apps that deploy as one origin:

| App           | Stack                                                                                                                                 | Check                                                   | Tests                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `apps/server` | Express + REST + MongoDB, Better Auth, Google OAuth, Cloudflare R2 + Workers AI. TypeScript (NodeNext, ESM, `.js` import specifiers). | `tsc --noEmit && tsc -p tsconfig.test.json`             | `*.test.ts`, node environment               |
| `apps/web`    | Vite + React 19 SPA, React Router 7, Tailwind v4, fetch + TanStack Query/Form.                                                        | `tsc -p tsconfig.app.json && tsc -p tsconfig.node.json` | colocated `*.test.ts(x)`, jsdom environment |

## Layering (`apps/server/src`)

`routes/` → (`services/`) → `models/`, with `config/`, `middleware/` and `lib/` beside them. Keep it as flat as the work allows.

- `routes/` holds the handlers: one `express.Router` per resource, `routes/<resource>/index.ts`, mounted in order from `routes/index.ts`. A handler parses input (zod via `middleware/http.ts`), does the work or calls a service function, and responds with `okOne`/`okList`. Logic used only by one router lives in that file as plain functions.
- `services/<resource>.ts` exists only when a resource's logic is too big for its route file or is shared with other resources. It exports plain functions, not classes, and never sees `Request`/`Response`.
- `models/` are the small db helpers, one per collection, wrapping `lib/db`. Delete a method once nothing calls it.
- `config/` holds pure values, the role matrix, `ApiError`, and the Better Auth config; it imports nothing from the layers above it.
- `lib/` is infrastructure only: `db/` (connection, ids, indexes, the minute sweep, timestamp ordering), `platform/` (env, rate limit, integration switches and stored credentials, mailer, Turnstile), `storage/` (R2), `chat/` (Workers AI), `google/` (Forms, Calendar).

Rules:

- No controllers, no one-class-per-use-case services, no view classes. Do not add a layer, interface or wrapper that has a single caller.
- Import the concrete module (`../lib/db/db.js`), never a barrel `index.ts`; the only `index.ts` files are route tables.
- Relative imports need the `.js` extension (NodeNext).
- No model contains HTTP concerns.
- **No cross-app imports.** `apps/server` must never import from `../web`, and `apps/web` must not import server code — it keeps its own copies (see below).
- Route tests in `tests/routes/` are the API contract; they drive `v1Router` over HTTP against `tests/helpers/fakeDb.ts`. Other tests live in `tests/<area>/` or colocated next to `lib/` modules. Run through `tsconfig.test.json`.

## Comments (`apps/server/src`)

Comments document the REST API and concurrency control, nothing else. Every route handler in `routes/<resource>/index.ts` carries one block in this exact shape — method + full URL, access, concurrency (write routes only), what the call is for (body/query), and what comes back:

```ts
/**
 * `POST /api/v1/me/queue`
 * Access: session + student surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: join the line — body `{ departmentId }`.
 * Returns: `201` with `{ data: entry }`.
 */
```

Concurrency code — every function that issues a transaction timestamp, checks or stamps `readTs`/`writeTs`, or handles a timestamp-ordering abort or restart — carries one block in this shape (keep only the lines that apply):

```ts
/**
 * Concurrency: timestamp ordering — write rule.
 * Rule: abort when TS(T) < readTs(X) or TS(T) < writeTs(X).
 * Pass: writeTs(X) = TS(T).
 * Abort: `409` `TS_ABORTED` (client-anchored) / restart up to 3× (server-anchored).
 */
```

- Those blocks, plus one header block per router file naming its mount point (`/api/v1`, `/api/auth`, `/api`, or root), are the only comments allowed in the server. Outside them, `services/`, `models/`, `config/`, `lib/`, `middleware/` and `scripts/` stay comment-free — no other docblocks, no line notes, no TODOs.
- Timestamp ordering is enforced once, in `lib/db/timestamp-ordering.ts` (wrapped around `getDbSync()`); models and services do not thread `ts` by hand.
- `Access:` uses `public`, `session`, or `session + <student|instructor|officer|admin> surface`.
- Add, move, rename or re-slice an endpoint → write or update its block in the same change. A route without a block is an unfinished change.
- Tests keep their comments: they explain why an assertion exists.

## Web app shape (`apps/web/src`)

- `app/` holds the SPA shell: `router.tsx` (hand-written route table via `createBrowserRouter`), `guards.tsx`, `layouts.tsx`, and the page components (`*-page.tsx`, `auth-pages.tsx`, `pages.tsx`). URLs are **not** derived from the filesystem.
- `$lib` is an alias for `src/lib` (see `vite.config.ts`); client components import through it.
- `lib/` holds client logic grouped by surface; `components/` holds React components grouped the same way (`admin/`, `auth/`, `instructor/`, `officer/`, `student/`, `report/`, `ui/`).
- All UI is React — there are no `.svelte` files or SvelteKit shims left.

## Single sources of truth

`apps/server/src/config/constants.ts` owns `PRE_ENROLLMENT_STEP_CODES`, `STEP_CODES`, `STEP_NAMES`, `YEAR_LEVELS`, and the student-number rule; `apps/server/src/config/roles.ts` owns the role matrix. The web app keeps hand-synced copies in `apps/web/src/lib/domain/` (`constants.ts`, `roles.ts`, `report.ts` for the row-cap helpers, `types.ts` for response payloads). Edit the server copy first, then mirror it — the web must not import `@erpsys/server`.

The client URL table is `apps/web/src/lib/api-routes.ts` — hand-written, the source of truth for paths.

## Conventions

- Tests are named after their subject (`routes/queues` → `tests/routes/queues.test.ts`), colocated only for `lib/` modules.
- Keep secrets and live account data out of tracked files. `docs/` is documentation only.
- Docs live in `docs/specs/` (design specs), `docs/ops/` (runbooks) and `docs/plans/` (dated implementation plans); `docs/README.md` indexes them.

## Commands

Run from the repository root:

```bash
pnpm dev                                 # both apps in parallel
pnpm build                               # pnpm -r run build
pnpm check                               # tsc --noEmit (server) + tsc (web)
pnpm test                                # vitest (server + web projects)
pnpm test:watch

pnpm --filter @erpsys/server check       # tight server typecheck
pnpm --filter web check                  # tight web typecheck
pnpm --filter web build                  # vite build (required after CSS changes)
```

## Before finishing a change

Run `pnpm check` and `pnpm test`. For CSS or markup changes, also `pnpm --filter web build`.
