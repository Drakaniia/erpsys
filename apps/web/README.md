# ERPSYS web app

The Vite + React 19 single-page app that talks to `apps/server`. Repository-wide conventions live in `../../AGENTS.md`; design docs and runbooks live in `../../docs/README.md`.

## Architecture (read this before adding routes)

This is a plain Vite SPA with a hand-written router — no framework-level file routing:

- `src/app/router.tsx` holds the hand-written route table (`createBrowserRouter`), with `guards.tsx`, `layouts.tsx` and the `*-page.tsx` components beside it. URLs are **not** derived from the filesystem.
- `$lib` is an alias for `src/lib` (see `vite.config.ts` and `tsconfig.app.json`); client code imports through it.
- `src/lib/` holds client logic grouped by surface (`student/`, `instructor/`, `officer/`, `admin/`, `auth/`, `report/`, `chat/`); `src/components/` holds React components grouped the same way.
- The client URL table is `src/lib/api-routes.ts` — hand-written, the source of truth for paths.

## The server boundary

The web imports **nothing** from `@erpsys/server`; there is no workspace dependency on it. What both sides must agree on is copied into `src/lib/domain/`:

- `constants.ts` — step codes, year levels, labels, the student-number rule (mirror of `apps/server/src/config/constants.ts`).
- `roles.ts` — the surface matrix and landing rules (mirror of `apps/server/src/config/roles.ts`).
- `report.ts` — `REPORT_ROW_CAP` and the truncation sentence (mirror of `apps/server/src/config/report.ts`).
- `types.ts` — the response payloads the UI renders (student record, roster, step register, user list, SSE events, integrations, storage).

Edit the server copy first, then mirror it here. `src/lib/auth-client.ts` declares the student-sign-up plugin shape locally, because better-auth's plugin itself lives on the server.

## Commands

Run from the repo root so the pnpm workspace resolves:

```bash
pnpm --filter web dev      # vite dev server on :5173; /api and every top-level REST resource prefix proxy to :3001
pnpm --filter web check    # tsc -p tsconfig.app.json && tsc -p tsconfig.node.json
pnpm --filter web build    # vite build
pnpm test                  # vitest; the web project runs under jsdom
```

`vite.config.ts` sets `envDir` to the monorepo root, so `.env` files are read from there.
