# API Endpoints (JSON)

Base URL: `http://localhost:3001` (dev). All paths are relative to the origin.

Mount points (see `src/app.ts`):

- `/api/auth` — Better Auth surface (mounted before JSON parsers).
- `/api` — chat stream (mounted before global JSON parsers).
- `/api/v1` — resource routers (after `express.json()`).
- `/api` (root) — system router: health, ready, metrics, events, openapi, docs.
- `/` — SPA fallback (HTML, not JSON).

Responses are JSON unless noted. Most `/api/v1` handlers return `{ data, ts }` envelopes; list endpoints also return `page`, `pageSize`, `total`.

## Concurrency (`/api/v1`)

Every `/api/v1` request is one transaction under basic timestamp ordering (`src/lib/db/timestamp-ordering.ts`). Each guarded document carries `readTs` and `writeTs`.

- `ts` in a response envelope is the transaction timestamp the data was read at.
- Writes take an optional body `ts`: send back the `ts` of the response you edited from. The request then runs as that older transaction. Without `ts`, the server stamps a fresh one.
- A read aborts when `ts < writeTs`; a write aborts when `ts < readTs` or `ts < writeTs`. A passing write sets `writeTs = ts`.
- Abort: `409` with `{ error, data: { code: "TS_ABORTED", ts } }`. Server-stamped transactions that have not written yet restart up to 3 times first.
- A `ts` the server never issued (in the future, not a positive integer) gets `400`.
- GETs by instructor, officer and admin surfaces stamp `readTs`; student-surface GETs do not.
- Never guarded: Better Auth state (`session`, `account`, `verification`), `audit_log`, `admin_action_log`, `chat_usage`, `storage_usage`, `admin_step_up`, and everything outside `/api/v1`.

## System (`/api`, `/`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/health | public | `{ ok: true }` |
| GET | /api/ready | public | `{ ok }` (503 when not ready) |
| GET | /api/metrics | public | Prometheus text exposition (not JSON) |
| GET | /api/events | session | SSE stream (not JSON) |
| GET | /openapi.json | public | OpenAPI document (JSON) |
| GET | /docs, /docs/ | public | HTML page (not JSON) |

## Auth (`/api/auth`)

| Method | Path | Access | Returns |
|---|---|---|---|
| ALL | /api/auth/sign-in/social | public | Better Auth response (redirect); 412 while Google integration is off |
| ALL | /api/auth/* | public | Better Auth response (session, sign-up, callback, sign-out) behind rate limit |
| GET | /api/auth/admin-gate/status | session + admin | `{ unlocked, unlockedUntil, next, enrolled }` for the integration confirmation |
| POST | /api/auth/admin-gate/pin | session + admin | Body `{ pin }`; starts the confirmation (8 tries per 15 min) |
| POST | /api/auth/admin-gate/password | session + admin | Body `{ password }`; needs the PIN first. Skipped for admins with no password (Google-only sign-in) |
| POST | /api/auth/admin-gate/code/send | session + admin | Emails a 6-digit code to the admin (10 min, one per minute); needs the password step |
| POST | /api/auth/admin-gate/code/verify | session + admin | Body `{ code }`; 5 tries, single use |
| POST | /api/auth/two-factor/enable, verify-totp, verify-backup-code | session + admin | Authenticator setup (once) and check; needs the emailed code first, 5 wrong tries restart the chain. A pass unlocks integration changes for 5 minutes. Other `/two-factor/*` paths answer `403` |

## Chat (`/api`)

| Method | Path | Access | Returns |
|---|---|---|---|
| POST | /api/chat/stream | session + student | SSE stream (not JSON) |

## Academic years (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/academic-years | session + admin | `{ data, page, pageSize, total }` |
| POST | /api/v1/academic-years | session + admin | `201 { data: year }` |
| PATCH | /api/v1/academic-years/:id | session + admin | `{ data: year }` |
| DELETE | /api/v1/academic-years/:id | session + admin | `{ data: year }` |
| GET | /api/v1/academic-years/:id/activation | session + admin | `{ data: stats }` |
| POST | /api/v1/academic-years/:id/activation | session + admin | `{ data: year }` |

## Requirements (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/requirements | session + admin | `{ data, page, pageSize, total }` |
| POST | /api/v1/requirements | session + admin | `201 { data: row }` |
| PUT | /api/v1/requirements/order | session + admin | `{ data: rows }` |
| PATCH | /api/v1/requirements/:id | session + admin | `{ data: row }` |
| DELETE | /api/v1/requirements/:id | session + admin | `{ data: row }` |

## Reports (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/reports/user-directory | session + admin | `{ data: rows }` |
| GET | /api/v1/reports/roster | session + instructor | `{ data: capped rows + bucket stats }` |
| GET | /api/v1/reports/roster-stats | session + instructor | `{ data: bucket totals }` |
| GET | /api/v1/reports/step-register | session + officer | `{ data: register rows }` |

## Content (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/profiling-form | session + officer | `{ data: { formId, title, responderUri, editUrl, updatedByName, updatedAt } }` or `null` |
| POST | /api/v1/profiling-form | session + officer | body `{ title }`; creates the Google Form via the Forms API; `201 { data: form }`, `409` if linked |
| DELETE | /api/v1/profiling-form | session + officer | unlinks the Google Form; `{ data: { ok: true } }` |
| GET | /api/v1/social-links | session + officer | `{ data, page, pageSize, total }` |
| POST | /api/v1/social-links | session + officer | `201 { data: link }` (or `{ data: link }`) |
| PUT | /api/v1/social-links/order | session + officer | `{ data: { ok: true } }` |
| PATCH | /api/v1/social-links/:id | session + officer | `{ data: link }` |
| DELETE | /api/v1/social-links/:id | session + officer | `{ data: { ok: true } }` |
| GET | /api/v1/chatbot-knowledge | session + admin | `{ data: { content } }` |
| PUT | /api/v1/chatbot-knowledge | session + admin | `{ data: { content } }` |
| GET | /api/v1/signup-options | public | `{ data: { departments, yearLevels } }` |

## Me (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/me/launch | session | `{ data: launch bundle }` |
| GET | /api/v1/me/overview | session | `{ data: overview }` |
| GET | /api/v1/me/stamp | session + officer | `{ data: stamp }` |
| PATCH | /api/v1/me/stamp | session + officer | `{ data: stamp }` |
| GET | /api/v1/me/notifications | session | `{ data, page, pageSize, total }` |
| POST | /api/v1/me/notifications/read | session | `{ data: mark-all result }` |

## Students (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/me/student/profile | session + student | `{ data: profile status }` |
| GET | /api/v1/students | session | `{ data, page, pageSize, total }` |
| GET | /api/v1/students/board | session + instructor | `{ data: { roster, stats } }` |
| POST | /api/v1/students/reminders | session + instructor | `{ data: send result }` |
| GET | /api/v1/me/student | session + student | `{ data: steps }` |
| PATCH | /api/v1/me/student | session + student | `{ data: profile }` |
| GET | /api/v1/students/:id/record | session | `{ data: record }` |
| PUT | /api/v1/students/:id/mugshot | session + officer | `{ data: record }` |
| GET | /api/v1/students/:id | session | `{ data: student }` |
| GET | /api/v1/me/record | session + student | `{ data: record }` |
| POST | /api/v1/me/assessment | session + student | `{ data: assessment }` |

## Submissions (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/submissions | session + officer | `{ data, page, pageSize, total }` |
| GET | /api/v1/submissions/:verificationId | session + officer | `{ data: submission }` |
| POST | /api/v1/submissions/:id/verification | session + officer | `{ data: verification }` |
| DELETE | /api/v1/submissions/:id/verification | session + officer | `{ data: verification }` |
| POST | /api/v1/submissions/:id/replies | session + officer | `{ data: submission }` |

## Transfers (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/transfers | session + instructor | `{ data: transfer list }` |
| POST | /api/v1/transfers | session + instructor | `201 { data: transfer }` |
| PATCH | /api/v1/transfers/:id | session + instructor | `{ data: transfer }` |
| DELETE | /api/v1/transfers/:id | session + instructor | `{ data: transfer }` |
| POST | /api/v1/departments/:id/takeover | session + instructor | `{ data: assignment }` |

## Enrollments (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/me/enrollments | session + student | `{ data, page, pageSize, total }` |
| POST | /api/v1/me/enrollments | session + student | `{ data: enrollment }` |
| DELETE | /api/v1/enrollments/completions | session + instructor | `{ data: revert result }` |
| POST | /api/v1/enrollments/:id/completion | session + instructor | `{ data: enrollment }` |
| DELETE | /api/v1/enrollments/:id/completion | session + instructor | `{ data: enrollment }` |

## Departments (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/me/departments | session + student | `{ data: department \| null }` |
| PUT | /api/v1/me/departments | session + instructor | `{ data: assignment }` |
| GET | /api/v1/departments | session + instructor | `{ data, page, pageSize, total }` |
| POST | /api/v1/departments | session + instructor | `201 { data: department }` |
| PATCH | /api/v1/departments/:id | session + instructor | `{ data: department }` |
| PUT | /api/v1/departments/:id/year-levels | session + instructor | `{ data: department }` |
| DELETE | /api/v1/departments/:id | session + instructor | `{ data: department }` |
| GET | /api/v1/departments/:id/enrollments | session + instructor | `{ data, page, pageSize, total }` |

## Advisers (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/advisers | session + admin | `{ data, page, pageSize, total }` |
| PATCH | /api/v1/advisers/:adviserId | session + admin | `{ data: adviser }` |
| PUT | /api/v1/me/availability | session + instructor | `{ data: availability }` |
| POST | /api/v1/me/availability/heartbeat | session + instructor | `{ data: availability }` |
| GET | /api/v1/me/schedule | session + instructor | `{ data: { departmentId, windows, sync } }` |
| PUT | /api/v1/me/schedule | session + instructor | `{ data: { departmentId, windows, sync } }` |
| GET | /api/v1/me/calendar | session + instructor | `{ data: { available, status, sync, googleEmail, lastSyncAt, lastError } }` |
| GET | /api/v1/me/calendar/connect | session + instructor | `{ data: { url } }` |
| GET | /api/v1/calendar/callback | session + instructor | `302` to `/instructor?calendar=connected\|error` |
| POST | /api/v1/me/calendar/sync | session + instructor | `{ data: status }` |
| DELETE | /api/v1/me/calendar | session + instructor | `{ data: status }` |

## Queues (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/me/queue | session + student | `{ data: queue state \| null }` |
| POST | /api/v1/me/queue | session + student | `201 { data: entry }` |
| DELETE | /api/v1/me/queue | session + student | `{ data: queue state }` |
| GET | /api/v1/queues | session + instructor | `{ data: queues }` |
| POST | /api/v1/queues/serving | session + instructor | `201 { data: serving }` |
| DELETE | /api/v1/queues/serving | session + instructor | `{ data: queue }` |
| POST | /api/v1/queues/serving/position | session + instructor | `{ data: queue }` |
| POST | /api/v1/queue-entries/:id/removal | session + instructor | `{ data: entry }` |
| POST | /api/v1/queue-entries/:id/restoration | session + instructor | `{ data: entry }` |

## Queue shares (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| POST | /api/v1/queue-shares | session + instructor | `201 { data: { token, url } }` |
| GET | /api/v1/queue-shares/:token | session + student | `{ data: share }` |

## Evidence (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| POST | /api/v1/evidence | session + student | `201 { data: upload }` |
| DELETE | /api/v1/evidence/:id | session + student | `{ data: upload }` |
| PUT | /api/v1/me/evidence-link | session + student | `{ data: verification }` |
| DELETE | /api/v1/me/evidence-link | session + student | `{ data: verification }` |
| POST | /api/v1/me/steps/:code/submission | session + student | `201 { data: verification }` |
| DELETE | /api/v1/me/steps/:code/submission | session + student | `{ data: verification }` |

## Storage (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| POST | /api/v1/storage/session | session | `201 { data: session }` (429/503 possible) |
| POST | /api/v1/storage/complete | session | `{ data: upload }` |
| GET | /api/v1/storage/session-status | session | `{ data: status }` |
| GET | /api/v1/uploads/:id/content | session | binary stream (200/206) — not JSON |

## Integrations (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/integrations/credentials/export | session + admin + step-up | `{ data: { filename, content } }`; `403 STEP_UP_REQUIRED` while locked |
| GET | /api/v1/integrations | public (session for admin shape) | `{ data: rows }` (admin) or `{ data: { flags, turnstileSiteKey, overridesLoaded } }` |
| PATCH | /api/v1/integrations/:key | session + admin + step-up | `{ data: row }`; `403 STEP_UP_REQUIRED` while locked |
| PUT | /api/v1/integrations/:key/credentials | session + admin + step-up | `{ data: row }` (403 STEP_UP_REQUIRED/409/422/429 possible) |
| DELETE | /api/v1/integrations/:key/credentials | session + admin + step-up | `{ data: row }`; `403 STEP_UP_REQUIRED` while locked |

## Users (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/users | session + admin | `{ data, page, pageSize, total }` |
| PATCH | /api/v1/users | session + admin | `{ data: update result }` |
| DELETE | /api/v1/users | session + admin | `{ data: delete result }` |
| PATCH | /api/v1/users/:userId | session + admin | `{ data: user }` |
| DELETE | /api/v1/users/:userId | session + admin | `{ data: purge result }` |
| POST | /api/v1/users/:userId/password-reset | session + admin | `{ data: reset result }` |

## Audit logs (`/api/v1`)

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | /api/v1/audit-logs | session + admin | `{ data, page, pageSize, total }` — every signed-in POST/PUT/PATCH/DELETE under `/api/v1`, newest first |

---

Notes:
- Non-JSON endpoints (excluded from the tables above where marked): `/api/metrics` (text), `/api/events` and `/api/chat/stream` (SSE), `/api/v1/uploads/:id/content` (binary), `/docs` (HTML).
- All `/api/v1` routes require the session where marked; unauthenticated requests return `401`.
- Source of truth: `src/routes/**/index.ts`. Regenerate this file when routes change.