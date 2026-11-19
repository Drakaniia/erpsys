# Documentation

Design docs and runbooks for ERPSYS. Code-level conventions live in `../AGENTS.md`.

## Ops

- [ops/collection-simplification.md](ops/collection-simplification.md) — collection consolidation, safe migration, and browser-local notification read markers.
- [ops/collection-migration-qa.md](ops/collection-migration-qa.md) — applied migration evidence, full-suite results, browser coverage, and remaining QA findings.

- [ops/deployment.md](ops/deployment.md) — deploy to a single Ubuntu server with Nginx, systemd, MongoDB Atlas, and GitHub Actions; also covers releases, incidents, and maintenance.
- [ops/admin-step-up.md](ops/admin-step-up.md) — the four-step confirmation (PIN, password, emailed code, authenticator) before integration changes, its env settings, and the lost-device reset.
- [ops/drive-verification.md](ops/drive-verification.md) — executable manual-E2E checklist for the Google Drive integration (spec §10).
- [ops/cloudflare-ai-verification.md](ops/cloudflare-ai-verification.md) — Workers AI token setup, the manual chatbot smoke checklist, and the log lines to watch.
- [ops/production-env.md](ops/production-env.md) — go-live checklist for `/etc/erpsys.env`: which local `.env` values change, which are dropped, and the Google/Turnstile/R2 steps.
- [ops/google-forms-api-setup.md](ops/google-forms-api-setup.md) — how the Profiling Google Form works, enabling the Forms and Drive APIs, minting the OAuth refresh token, saving it in `.env` or Admin → Integrations, and the Google Forms on/off switch.
- [ops/google-calendar-api-setup.md](ops/google-calendar-api-setup.md) — optional instructor Google Calendar mirror: enabling the Calendar API, the `calendar.app.created` scope, the callback URI, `CALENDAR_TOKEN_KEY`, test users and the Google Calendar on/off switch.
- [specs/google-calendar-availability-spec.md](specs/google-calendar-availability-spec.md) — office-hour schedules per department, shown to students and optionally mirrored to each instructor's Google Calendar.

## Specs

- [specs/normalized-database.md](specs/normalized-database.md) — ERPSYS business data from 1NF to 3NF, with the [standalone SQLite schema](specs/normalized-database.sql). No runtime migration.

- [specs/app-launch-performance-spec.md](specs/app-launch-performance-spec.md) — warm-launch rendering from a persisted cache, the aggregate `/api/v1/me/launch` endpoint, route/vendor chunking, and the CI bundle budget. Status: implemented.
- [specs/load-resilience-design.md](specs/load-resilience-design.md) — surviving 300–1000 concurrent students: process guards, Mongo index-enforced queue correctness, graceful deploys, load shedding, metrics. Status: approved, not yet implemented.
- [specs/cloudflare-ai-spec.md](specs/cloudflare-ai-spec.md) — the student chatbot's move from Gemini to Cloudflare Workers AI, including the daily Neuron guard. Status: implemented.
- [specs/integration-credentials-spec.md](specs/integration-credentials-spec.md) — editable integration credentials: encrypted Mongo overrides over the `.env` floor, provider probes, the restart handshake and the handover export. Status: implemented.

- [specs/open-requests.md](specs/open-requests.md) — backlog of open product requests, derived from a scratch list and unreviewed.

## Plans

- [ops/local.md](ops/local.md) — local app hosting with MongoDB as the only online service; Cloudflare Pages and API Worker have been removed.

- [plans/2026-10-08-svelte-to-react.md](plans/2026-10-08-svelte-to-react.md) — the dated Svelte → React migration plan, including the surfaces still awaiting an RTL port.
- [plans/2026-11-08-timestamp-concurrency.md](plans/2026-11-08-timestamp-concurrency.md) — basic timestamp-ordering concurrency control for every `/api/v1` write, and what shipped versus the original plan. Code map: [`apps/server/CONCURRENCY.md`](../apps/server/CONCURRENCY.md).

## Paper

- [paper/FINAL_PAPER.md](paper/FINAL_PAPER.md) — Chapters 1–5, references, and supporting appendices,
  with plain-language explanations and `TODO` markers for team-supplied evidence.
- [paper/API_DOCUMENTATION.md](paper/API_DOCUMENTATION.md) — current mounted API contracts, request examples,
  response behavior, authentication checks, and external-service documentation.
  Rebuild the manuscript with `python docs/paper/api2paper.py` and check route coverage with
  `python docs/paper/api2paper.py --check`; reviewed endpoint details live in its companion contract modules.
- Word copies: [Final paper](paper/FINAL_PAPER.docx) and [API documentation](paper/API_DOCUMENTATION.docx).
  Rebuild both with `python docs/paper/paper2docx.py`; re-render changed Mermaid diagrams first with
  `python docs/paper/render_diagrams.py`.
- [paper/REFERENCE_OUTLINE.md](paper/REFERENCE_OUTLINE.md) — the full heading/subheading outline of
  `paper/Collab Final Project Documentation.REFERENCE.pdf`, with page numbers.
- [paper/todo.md](paper/todo.md) — checklist of the figures, screenshots and tables the paper still
  needs.

## Reference

- [reference/README.md](reference/README.md) — externally supplied documents, read-only.

## Other

- `../erpsys-audit-2026-10-10.md` — structural audit snapshot (2026-10-10).
