# Google Calendar Availability Spec

Status: implemented — 2026-11-11. See "Implementation notes" at the end for where the build differs from this draft.
Owner request: let instructors (role `ENROLLMENT_ADVISER`, "instructor surface")
optionally publish when they will be available for a department queue, let
students see it, and mirror it to the instructor's Google Calendar.

## 1. Goal

Add a **scheduled availability** layer on top of today's live queue switch.
Instructors define weekly office-hour windows per department. Students see
"next open / open until" on each department queue card. Optionally, each
instructor connects Google Calendar and ERPSYS mirrors the schedule to a
dedicated calendar in their own Google account.

### Interview decisions (locked)

| Topic | Decision |
| --- | --- |
| Purpose | Scheduled availability (planned hours students can read). Not appointments, not busy-sync. |
| Direction | ERPSYS → Google, one-way write. ERPSYS DB is the source of truth. |
| Optionality | Per instructor. Schedule works standalone; Google is an optional mirror. |
| Admin control | New `googleCalendar` integration (admin toggle, setup guide, credential probe). |
| Relation to live switch | **Informational only.** The "Accepting students" switch, heartbeat and 1-hour idle auto-close are unchanged and remain the only thing that opens the queue. |
| Window scope | Per instructor per department. |
| Window kinds | Weekly recurring windows plus one-off exceptions. |
| Authorization | Separate "Connect Calendar" OAuth consent (incremental), works for password and Google-login instructors. |
| Where events live | A dedicated "ERPSYS Office Hours" calendar created by the app in the instructor's account. |
| Audience | Students, in-app only, on each department queue card. |
| Instructor naming | Department-level only; students never see which instructor holds a window. |
| Sync | Inline on save, with a retry queue picked up by a sweep when Google fails. |
| Token storage | Refresh token encrypted at rest (AES-GCM) with a new env key; never returned by any API. |
| Event audience | No attendees, no notifications, calendar not public. |
| Time zone | Pinned to `Asia/Manila` (matches `apps/web/src/lib/report/format.ts`). |
| Overlaps | Rejected server-side per instructor + department. |
| Editor location | Per-department tab header, next to the existing "Accepting students" switch. |
| Edge case required in v1 | Token revoked/expired → "Reconnect Calendar" banner, schedule and queue keep working. |

### Out of scope (explicit)

- Student appointment booking or timed slots.
- Reading the instructor's existing Google events or free/busy.
- Two-way sync, Google push notifications/watch channels.
- Public iCal feed or public/shared Google calendar for students.
- Schedule automatically opening or closing the queue, or gating the switch.
- Officer/admin schedule views, a dedicated student timetable page, chatbot knowledge.
- Showing instructor names to students.

## 2. Current state (verified in repo)

- **Live availability only.** `apps/server/src/models/AdviserAvailabilityModel.ts`
  stores one row per `{adviserId, departmentId, academicYearId}` with `isOpen`,
  `openedAt`, `closedAt`, `lastActiveAt`, `autoClosedAt`.
  `apps/server/src/config/availability.ts` defines `AVAILABILITY_IDLE_MS` (1 h);
  `config/queue.ts` (`liveAvailabilityPairs`, `openByDepartment`,
  `levelsCoveredByDepartment`) derives "live" from `isOpen` + recent
  `lastActiveAt` (or actively serving).
- **Routes.** `PUT /api/v1/me/availability` and
  `POST /api/v1/me/availability/heartbeat` in
  `apps/server/src/routes/advisers/index.ts`, service
  `services/advisers/AdviserAvailabilityService.ts`.
- **Sign-out side effects.** `config/auth.ts` `hooks.before` on `/sign-out`
  closes open availability, releases serving, and **deletes the instructor's
  department links** (`AdviserDepartmentModel.deleteForAdviser`). Consequence:
  schedule windows **must not** be foreign-keyed to or cascade-deleted with
  `adviserDepartment` rows, or every sign-out would wipe the schedule. See §5.3.
- **Google today.** Better Auth `socialProviders.google` with no extra scopes.
  `lib/google/forms.ts` uses a single server-owned refresh token
  (`GOOGLE_FORMS_REFRESH_TOKEN`), unlike this feature which needs
  **per-instructor** tokens.
- **Integration plumbing.** `IntegrationKey` in `lib/platform/integration-settings.ts`,
  `lib/platform/credential-registry.ts`, `credential-probes.ts`,
  `services/integrations/IntegrationSettingService.ts`, web
  `lib/integrations/use-integrations.ts`, `lib/domain/types.ts`,
  `components/admin/IntegrationSetupGuide.tsx`.
- **Instructor UI.** `components/instructor/DeptTabHeader.tsx` +
  `AvailabilitySwitch.tsx`, page `app/instructor-page.tsx`, state in
  `lib/instructor/`.
- **Student UI.** `app/queue-cards.tsx`, `app/queue-join-card.tsx`,
  `app/queue-model.ts`; server listing in `services/queues/QueueListingService.ts`.
- **Sweeps.** `lib/db/sweeps.ts` runs `runSweeps` on an interval with a
  skip-if-running guard; the retry queue plugs in here.
- **Prior art for specs.** `docs/specs/integration-toggles-spec.md`,
  `integration-credentials-spec.md`, and `docs/ops/google-forms-api-setup.md`.

## 3. Prerequisites to confirm before building

1. **OAuth app audience.** Unknown whether `@buksu.edu.ph` is a Google Workspace
   domain and whether the Cloud OAuth client is Internal or External. The older
   R2 spec notes the team has no BukSU Workspace admin, so assume **External**.
   If External + Testing mode: only listed test users can connect and refresh
   tokens expire after 7 days (this will hit the "reconnect" path constantly).
   Going to production needs Google OAuth verification for the Calendar scope.
2. **Scope choice.** Prefer the narrowest scope that allows creating a secondary
   calendar and managing events on it: `https://www.googleapis.com/auth/calendar.app.created`.
   Verify in Google's scope list whether it counts as sensitive for verification
   before committing; fall back to `calendar.events` + creating the calendar via
   `calendar` scope only if it cannot do what is needed.
3. **Redirect URI.** Add the calendar callback URI to the existing Google OAuth
   client (and the prod origin) in Google Cloud Console.
4. **Encryption key.** Generate a 32-byte key for `CALENDAR_TOKEN_KEY`.

## 4. User flows

### 4.1 Instructor: set a schedule (no Google needed)
1. Instructor opens a department tab → "Schedule" button in `DeptTabHeader`
   opens a schedule dialog.
2. Adds weekly windows: weekday(s), start, end (Asia/Manila).
3. Optionally adds exceptions: cancel a specific date, or add an extra one-off
   window on a date.
4. Save → server validates (§6), stores, and returns the schedule. If connected
   to Google, sync runs inline (§7).

### 4.2 Instructor: connect Google Calendar (optional)
1. Dialog (or banner) shows "Connect Google Calendar".
2. `GET /api/v1/me/calendar/connect` returns a Google consent URL with a signed,
   single-use `state` (bound to session user, short TTL, PKCE if practical).
3. Callback exchanges the code, stores the encrypted refresh token, creates the
   "ERPSYS Office Hours" calendar if absent, then full-syncs all of the
   instructor's windows.
4. Dialog shows status: Connected / Syncing / Needs reconnect / Sync error, and a
   Disconnect action.

### 4.3 Disconnect
Disconnect deletes the mirrored events and the dedicated calendar (best effort),
revokes the token at Google, deletes the stored connection. The ERPSYS schedule
is untouched.

### 4.4 Student: see availability
Each department queue card shows a department-level line, for example
"Open now until 12:00 PM" / "Next: Mon 9:00 AM – 12:00 PM" / "No schedule posted".
This is **additional** to the existing live open/closed indicator and never
changes it. Merged across all instructors holding windows for that department
and active academic year; no names.

### 4.5 Token revoked or expired
Any Google call returning `invalid_grant`/401-after-refresh marks the connection
`NEEDS_RECONNECT`. The instructor sees a "Reconnect Calendar" banner. Schedule
editing and the queue continue to work; sync is paused until reconnect, then a
full resync runs.

## 5. Data model

All new collections are added to `COLLECTIONS` in `lib/db/db.js`, one model class
each (static methods only), indexes in `lib/db/indexes.ts`, ids via `genId`.

### 5.1 `calendarConnection` (one per instructor)
- `_id`, `userId` (unique), `status`: `CONNECTED | NEEDS_RECONNECT`
- `refreshTokenEnc` (AES-256-GCM: iv + tag + ciphertext, base64), `keyVersion`
- `scope`, `googleCalendarId` (the dedicated calendar), `googleEmail`
- `connectedAt`, `lastSyncAt`, `lastError` (short code, no tokens)
- Never returned by any API; API exposes only `{ status, googleEmail, lastSyncAt, lastError }`.

### 5.2 `availabilityWindow`
- `_id`, `adviserId`, `departmentId`, `academicYearId`
- `kind`: `WEEKLY | EXTRA`
- `WEEKLY`: `weekday` (0–6, Mon=0 or ISO 1–7; pick one and mirror it on web), `startMinute`, `endMinute` (minutes from local midnight, Asia/Manila)
- `EXTRA`: `date` (`YYYY-MM-DD`), `startMinute`, `endMinute`
- `createdAt`, `updatedAt`

### 5.3 `availabilityException` (cancellations)
- `_id`, `windowId` or (`adviserId`,`departmentId`,`date`), `date`, `type: CANCELLED`
- Rationale: cancelling one occurrence of a weekly window without deleting it.

### 5.4 `calendarSyncItem` (mirror state + retry queue)
- `_id`, `userId`, `windowId`, `googleEventId`, `state`: `SYNCED | PENDING | FAILED`
- `op`: `UPSERT | DELETE`, `attempts`, `nextAttemptAt`, `lastError`
- Keeps Google bookkeeping out of the window documents.

### 5.5 Lifecycle independence from department links
Windows are keyed on `adviserId + departmentId + academicYearId`, **not** on
`adviserDepartment`. Because sign-out deletes links, students would otherwise see
the schedule vanish daily. Rules:
- Student view includes a window regardless of current link/sign-in state.
- Editing/creating windows requires a current link (reuse the `FORBIDDEN`
  "Department not assigned to you" check from `AdviserAvailabilityService`).
- Admin unassigning an instructor from a department (`PATCH /advisers/:adviserId`
  → `saveAssignments`) is a deliberate removal: delete that adviser+department
  windows and their Google events. Distinguish it from sign-out cleanup; do not
  hook the delete into `deleteForAdviser`.
- **Open question for the team:** whether schedules should show in the student
  view while the instructor is signed out and unassigned. This spec assumes
  **yes** (that is the point of a published schedule).

## 6. Validation rules (server)

- `startMinute < endMinute`, same-day only (no overnight windows in v1).
- **No overlaps** for the same instructor + department among weekly windows and
  extra windows on the same date → `409 CONFLICT` with a message naming the
  clashing window.
- Department must be assigned to the instructor at write time.
- `EXTRA` and exceptions must be dated inside the active academic year.
- Defaults chosen where the interview did not decide (confirm or change):
  - 30-minute grid, 30-minute minimum duration — *assumption*.
  - Weekly recurrence ends at the academic year end date (`UNTIL`) — *assumption*,
    needed so the Google RRULE is finite.
  - Max windows per instructor + department (e.g. 30) to bound sync work — *assumption*.
- Zod schemas for bodies, matching existing controller validation style.

## 7. Google sync design

New infrastructure `apps/server/src/lib/google/calendar.ts` (mirrors
`forms.ts`: thin `fetch` wrapper, timeouts, `ApiError("BAD_GATEWAY")`), plus
`lib/platform/token-crypto.ts` (AES-GCM encrypt/decrypt, `CALENDAR_TOKEN_KEY`).
No new npm dependency is required; plain REST via `fetch` is consistent with
`forms.ts`.

- **Access tokens:** exchange the stored refresh token per call with a small
  in-memory per-user cache (like `forms.ts` `cached`), keyed by `userId`.
- **Calendar:** `calendars.insert` summary "ERPSYS Office Hours", time zone
  `Asia/Manila`; store `googleCalendarId`.
- **Events:**
  - `WEEKLY` → one recurring master event, `RRULE:FREQ=WEEKLY;BYDAY=..;UNTIL=<AY end>`,
    `timeZone: Asia/Manila`; cancellations become `EXDATE` (or instance cancel).
  - `EXTRA` → single event.
  - Title `Enrollment advising – <Department name>`; description a fixed
    generic line plus a link back to ERPSYS. **No student data, no instructor
    PII** in events. No attendees, `sendUpdates: "none"`, no reminders (reminders
    were not selected — *assumption*, confirm).
  - Store ERPSYS ids in `extendedProperties.private` (`erpsysWindowId`) so
    reconciliation can find orphaned events.
- **Inline then retry:** on save, ERPSYS writes its own data first, then tries
  Google. On failure the `calendarSyncItem` is `PENDING` with backoff
  (`nextAttemptAt`, capped attempts → `FAILED`). A new sweep in `lib/db/sweeps.ts`
  (`sweepCalendarSync`) retries due items and respects the existing
  skip-if-running guard. The save response reports `sync: { state }` so the UI can
  say "Saved. Google sync pending."
- **Concurrency:** write routes follow the existing timestamp-ordering pattern
  (optional body `ts`; stale → `409 TS_ABORTED`). Sync worker updates must be
  idempotent (use stored `googleEventId`; treat 404 on delete as success, 409 on
  insert as "already exists → patch").
- **Rate limits:** protect connect/callback and sync-trigger endpoints with the
  existing `lib/platform` rate limiter.
- **Revocation:** `invalid_grant` → mark `NEEDS_RECONNECT`, stop retries, no
  alerting beyond the banner and an audit log entry.
- **Full resync** (connect, reconnect, admin-triggered): list events on the
  dedicated calendar by `erpsysWindowId`, upsert desired, delete extras.

## 8. API surface (`apps/server/src/routes/…`)

Each handler carries the mandatory comment block from `AGENTS.md`. Paths are
proposals; keep one router per resource, each declaring its own `/me/...` paths.

Schedule (new `routes/availability-schedule/index.ts` or extend `advisers`; the
resource owns the data → recommend a new `schedules` resource):

- `GET /api/v1/me/schedule?departmentId=` — Access: session + instructor surface. Returns `{ data: { windows, exceptions } }`.
- `PUT /api/v1/me/schedule` — session + instructor; timestamp ordering; body `{ departmentId, windows, exceptions }` (replace-whole, like `saveAssignments`); returns `{ data: { windows, exceptions, sync } }`.
- `GET /api/v1/departments/schedule` (or extend the existing queue listing) — session + student surface; returns merged department-level schedule: `{ data: [{ departmentId, nextWindow, currentWindowEndsAt }] }`. Prefer extending `QueueListingService` output so the student queue cards need one fetch.

Calendar connection (new `routes/calendar/index.ts`):

- `GET /api/v1/me/calendar` — session + instructor; connection status (no secrets).
- `GET /api/v1/me/calendar/connect` — session + instructor; returns `{ data: { url } }`.
- `GET /api/v1/calendar/callback` — session (cookie) + state check; redirects back to `/instructor?calendar=connected|error`. Mounted so the redirect URI is stable.
- `POST /api/v1/me/calendar/sync` — session + instructor; force resync; rate limited.
- `DELETE /api/v1/me/calendar` — session + instructor; disconnect (§4.3).

All gated by the `googleCalendar` integration flag (returns `PRECONDITION_FAILED`
or hides endpoints like `ProfilingFormService` does for Forms). Update
`apps/server/API_ENDPOINTS.md` and the OpenAPI registry in `lib/platform/openapi`.
Web: add paths to `apps/web/src/lib/api-routes.ts`.

## 9. Layering (follows `AGENTS.md`)

- `config/`: `schedule.ts` (pure helpers: slot grid, overlap check, next-window
  computation in Asia/Manila, constants). No imports from upper layers.
- `models/`: `CalendarConnectionModel`, `AvailabilityWindowModel`,
  `AvailabilityExceptionModel`, `CalendarSyncItemModel`.
- `services/schedules/`: `ScheduleService` (read/save windows),
  `ScheduleViewService` (student-facing merge). `services/calendar/`:
  `CalendarConnectService`, `CalendarSyncService`, `CalendarDisconnectService`.
  One use case per class; no `Request/Response`.
- `controllers/schedules/`, `controllers/calendar/`: parse, call one service,
  shape response. No Mongo, no Google client in controllers.
- `lib/google/calendar.ts` (Google REST), `lib/platform/token-crypto.ts`.
- `config/auth.ts`: unchanged for login. Do **not** add the Calendar scope to the
  Google sign-in provider.
- Comments only as `AGENTS.md` allows (route blocks, concurrency blocks, router header).

## 10. Integration plumbing (admin)

Add `googleCalendar` alongside `googleForms`:
- `IntegrationKey`, labels, descriptions in `integration-settings.ts` and
  `IntegrationSettingService.ts`; availability rule: required creds present
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY`).
- `credential-registry.ts`: field `CALENDAR_TOKEN_KEY` (secret). Reuse the Google
  client credentials; no `GOOGLE_CALENDAR_REFRESH_TOKEN` is needed because tokens
  are per instructor.
- `credential-probes.ts`: probe that the key is 32 bytes and Google client
  creds exist (cannot probe a user token).
- `env.ts`: `CALENDAR_TOKEN_KEY`, optional.
- Web: `use-integrations.ts` flag, `lib/domain/types.ts` key, setup guide entry in
  `IntegrationSetupGuide.tsx`, tests updated (`IntegrationSetupGuide.test.tsx`,
  `use-integrations.test.ts`, `admin-resources.test.ts`).
- Docs: `docs/ops/google-calendar-api-setup.md` runbook (enable Calendar API,
  consent screen, scope, redirect URI, test users, key generation) and an entry
  in `docs/ops/production-env.md` and `docs/README.md`.

## 11. Web UI

- **Instructor**
  - `DeptTabHeader`: "Schedule" button next to `AvailabilitySwitch`.
  - New `components/instructor/ScheduleDialog.tsx`: weekly grid/list editor,
    exceptions list, Google connection status row (Connect / Reconnect /
    Disconnect, last sync), inline validation errors from the server.
  - Reconnect banner on the instructor page when `NEEDS_RECONNECT`.
  - Hide all Google UI when the `googleCalendar` flag is off; schedule editing
    itself stays available (standalone) — **decision to confirm:** should the
    admin flag also disable the standalone schedule? This spec assumes the flag
    only controls the Google mirror.
  - State/hooks in `lib/instructor/schedule.ts` (TanStack Query), types mirrored
    in `lib/domain/types.ts`. Times shown in Asia/Manila, reuse `report/format.ts` helpers.
- **Student**
  - Queue card (`app/queue-cards.tsx`, `queue-model.ts`) adds a schedule line;
    `queue-join-card.tsx` shows the next window when the queue is closed.
  - Empty state "No schedule posted" is quiet, not an error.
  - Accessible text for the status line (not color-only).
- Mirrored constants: weekday indexing and slot grid go in
  `apps/web/src/lib/domain/constants.ts` after the server copy.

## 12. Security and privacy

- Refresh tokens AES-GCM encrypted; key from env/credential store; key rotation via
  `keyVersion`; never log tokens, codes, or request bodies from Google.
- OAuth `state` is signed, single-use, short-lived, and bound to the session user.
  Callback rejects if the session user differs from state.
- Callback ignores a returned scope that is narrower than required and surfaces
  "permission incomplete" (users can untick scopes on the consent screen).
- Events contain no student data and no instructor PII beyond their own calendar.
- Student endpoint returns department-level windows only; no `adviserId`.
- Blocked or deleted users: `UserDeletionService` / `lib/db/user-purge.ts` must
  delete windows, exceptions, sync items and the connection, and revoke the token
  and delete the Google calendar best effort.
- Audit log entries for connect, disconnect, reconnect-needed, forced resync
  (reuse the audit-logs resource).
- Admin cannot read tokens; the Integrations panel only shows flag/key presence.

## 13. Edge cases

Required in v1:
- Token revoked/expired → `NEEDS_RECONNECT`, banner, sync paused, resync on reconnect.

Not selected in the interview, so default behavior below unless you say otherwise:
- **Instructor unassigned by admin:** delete that department's windows and events.
- **Academic year rollover:** windows are tied to `academicYearId`; the new year
  starts empty, old ones are retained read-only or purged by sweep (decide), and
  recurring Google events end at `UNTIL`. Offer "copy last year's schedule".
- **Account deletion/purge:** full cleanup per §12.
- **Google failure on save:** local save succeeds, item `PENDING`, sweep retries,
  UI shows "Saved, Google sync pending".
- Instructor deletes the dedicated calendar or events in Google: ERPSYS is the
  source of truth, so the next sync or full resync recreates them; deleting the
  calendar triggers recreate on next 404.
- Daylight saving is not applicable to `Asia/Manila`, but always store minutes
  from local midnight, never UTC offsets.
- Two sessions editing at once → timestamp ordering `TS_ABORTED`.
- Instructor holds multiple departments: one dedicated calendar, events titled
  per department, one recurrence per window.
- Two instructors cover the same department windows: student view merges and
  de-duplicates overlapping ranges.
- Google quota/429: honor `Retry-After`, exponential backoff in sweep.
- Instructor not on a Google account (password login, non-Google email): works,
  since consent is a separate flow and may use any Google account; show the
  connected `googleEmail`.
- Role change (instructor → admin/student): remove schedule and connection.

## 14. Testing

Server (`apps/server/tests/<layer>/<resource>/`, node env, run via `tsconfig.test.json`):
- `config/schedule` pure tests: overlap detection, grid, next-window, midnight edges.
- `ScheduleService`: validation, FORBIDDEN without link, replace-whole semantics,
  independence from link deletion (regression for sign-out).
- `ScheduleViewService`: merge, de-dup, no adviser ids leaked.
- `CalendarSyncService` with a mocked `lib/google/calendar` — upsert, delete,
  404/409 idempotency, backoff, `invalid_grant` → `NEEDS_RECONNECT`.
- `token-crypto`: roundtrip, tamper detection, wrong key.
- Route tests: auth/surface gating, integration flag off, state mismatch on
  callback, rate limit.
- Purge/deletion cleanup tests.
Web (colocated, jsdom): `ScheduleDialog` validation and states, student queue
card schedule line, integration panel/setup-guide updates.
Before finishing: `pnpm check` and `pnpm test`; `pnpm --filter web build` for UI.

## 15. Rollout

1. Land schedule storage + student view first (no Google), behind no flag.
2. Land `googleCalendar` integration plumbing, OAuth connect, sync, and sweeps.
3. Confirm OAuth audience and (if External) add test users; document the 7-day
   token expiry in testing mode.
4. Enable the integration in admin; pilot with a few instructors.
5. Submit Google verification before wide rollout if the scope requires it.

## 16. Open questions

1. Is `@buksu.edu.ph` a Workspace domain; is the OAuth client Internal or External? (§3)
2. Is `calendar.app.created` sufficient and non-sensitive? (§3)
3. Confirm assumed defaults: 30-min grid and minimum, AY-bound recurrence, generic
   event title, no reminders, window-count cap.
4. Should the `googleCalendar` admin flag disable only the Google mirror, or the
   whole schedule feature?
5. Should schedules remain visible to students when the instructor is signed out
   and unassigned (this spec says yes)?
6. At academic-year rollover: purge, archive, or offer copy-forward?
7. Should officers/admins ever see schedules (excluded from v1)?
8. Should the Calendar event description link students back to the department
   queue, and is a deep link route needed?
9. Should "Open now" in the student UI combine with the live switch (e.g. show a
   warning "scheduled now but not yet accepting") or stay strictly separate?

## 17. Implementation notes

Where the build differs from the draft above:

- **Collections.** Two, not four: `availability_window` (kinds `WEEKLY`, `EXTRA`,
  `CANCEL`; a `CANCEL` row replaces the separate exceptions collection) and
  `calendar_connection`. There is no `calendarSyncItem`.
- **Sync.** Each run reconciles the instructor's dedicated calendar against their
  windows: Google event ids are a SHA-1 of the window identity, events carry a
  content signature in a private extended property, and unchanged events are
  skipped. Retry state lives on the connection (`syncState`, `attempts`,
  `nextAttemptAt`); a one-minute `calendar-sweep` retries it with backoff capped
  at one hour, and the connection becomes `FAILED` after 8 attempts.
- **No academic-year end date.** `academic_year` has no end field, so weekly
  events have no `UNTIL`. The sweep deletes windows from non-active years (and
  resyncs those instructors) when the active year changes.
- **Student view.** `GET /api/v1/me/departments` gains `schedule: { current,
  next }`; there is no new student route. The join card and the waiting-in-line
  card both show it. The wording is "Office hours now until …" so it is not
  mistaken for the live open state (open question 9 stays strictly separate).
- **Cleanup.** Only the admin mapping replace, department deletion and account
  deletion/disable remove windows; sign-out and instructor self-assignment do
  not.
- **Role changes.** Admin role changes only toggle STUDENT/SBO_OFFICER and
  instructor roles come from the email domain, so no role-change cleanup exists.
- **Server comments.** None added beyond the route and router header blocks,
  per `AGENTS.md`.
- **Not built, as scoped out:** public calendars, two-way sync, appointment
  booking, officer/admin schedule views.
