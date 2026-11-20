# API Screenshot Readiness — Live Checks

Target: http://localhost:3001. This report records observed live requests, not a guarantee that all workflows pass. Repeated requests are not counted as separate endpoints. No cookies, passwords, tokens, account emails, or private response bodies are included.

## Enrollment fix

- The enrollment model now puts a new identifier in $setOnInsert instead of replacing \_id during an update.
- All 29 focused enrollment, completion, and authentication tests passed. These include updates and repeated saves that keep the original identifier.
- The compiled API was rebuilt and restarted. Two repeated live POST /api/v1/me/enrollments requests returned 200 with the original placement preserved. Earlier 500 results are superseded by these retests.
- Repository type checks passed. The full test suite timed out; it is not reported as passing.

## Before taking screenshots

- Use the stated HTTP method and actual IDs. Clicking a URL only sends GET.
- For authentication, use the website on port 5173 and its Network panel, or a client with a permitted Origin and cookie session. A page on the API origin was refused by the authentication Origin check.
- Empty account selections, INVALID share results, and NOT_CONNECTED calendar results are not full business-success tests even when HTTP 200 is returned.
- No school-domain student upload target or adviser-role account was available. Current administrator access does not bypass department assignment checks.
- Remaining successful uploads need a permitted school-email student, real file bytes, upload completion, and authorized content retrieval.
- Remaining queue/review tests need separate current-year student submissions, five verified prerequisites, adviser assignment and live availability, and a student actually being served.
- Google callbacks require real consent; administrator security actions require PIN, password when applicable, email code, and authenticator. These were not bypassed.
- Temporary academic-year, requirement, department, and social-link records created for CRUD tests were removed. Existing enrollment placement was preserved. The assessment endpoint returned APPLIED, so review that account’s assessment status before taking later progress screenshots.
- Reset/verification email requests were accepted, but inbox delivery and token consumption were not confirmed. No password or authenticator reset was performed.
- One POST /api/v1/users request was an operator wrong-method probe (404); the documented PATCH was then tested with 200. It is not an application defect.

## Per-endpoint results

### Academic Years

- **GET /api/v1/academic-years:** 200
- **POST /api/v1/academic-years:** 201 creation; 200 update/delete on dedicated temporary records
- **PATCH /api/v1/academic-years/:id:** 404 expected for missing test record; success not verified
- **DELETE /api/v1/academic-years/:id:** 201 creation; 200 update/delete on dedicated temporary records
- **GET /api/v1/academic-years/:id/activation:** 200
- **POST /api/v1/academic-years/:id/activation:** 404 expected for missing test record; success not verified

### Advisers

- **GET /api/v1/advisers:** 200
- **PATCH /api/v1/advisers/:adviserId:** 404 expected for missing test record; success not verified
- **PUT /api/v1/me/availability:** 403 assignment required; successful operation blocked
- **POST /api/v1/me/availability/heartbeat:** 200

### Audit Logs

- **GET /api/v1/audit-logs:** 200

### Calendar

- **GET /api/v1/me/calendar:** 200
- **GET /api/v1/me/calendar/connect:** 200
- **GET /api/v1/calendar/callback:** Redirect observed for incomplete callback; Google consent success not tested
- **POST /api/v1/me/calendar/sync:** 200 with NOT_CONNECTED; successful Google synchronization not verified
- **DELETE /api/v1/me/calendar:** 200 with NOT_CONNECTED; successful Google synchronization not verified

### Content

- **GET /api/v1/chatbot-knowledge:** 200
- **PUT /api/v1/chatbot-knowledge:** 400 expected input refusal; success not verified
- **GET /api/v1/profiling-form:** 200
- **POST /api/v1/profiling-form:** 400 expected input refusal; success not verified
- **DELETE /api/v1/profiling-form:** NOT RUN — would remove the existing linked profiling form; use a disposable form/year first.
- **GET /api/v1/social-links:** 200
- **POST /api/v1/social-links:** 201 creation; 200 update/delete on dedicated temporary records
- **PUT /api/v1/social-links/order:** 200
- **PATCH /api/v1/social-links/:id:** 201 creation; 200 update/delete on dedicated temporary records
- **DELETE /api/v1/social-links/:id:** 201 creation; 200 update/delete on dedicated temporary records
- **GET /api/v1/signup-options:** 200

### Departments

- **GET /api/v1/me/departments:** 200
- **PUT /api/v1/me/departments:** 404 expected for missing test record; success not verified
- **GET /api/v1/departments:** 200
- **POST /api/v1/departments:** 201 creation; 200 update/delete on dedicated temporary records
- **PATCH /api/v1/departments/:id:** 201 creation; 200 update/delete on dedicated temporary records
- **PUT /api/v1/departments/:id/year-levels:** 201 creation; 200 update/delete on dedicated temporary records
- **DELETE /api/v1/departments/:id:** 201 creation; 200 update/delete on dedicated temporary records
- **GET /api/v1/departments/:id/enrollments:** 403 assignment required; successful operation blocked

### Enrollments

- **GET /api/v1/me/enrollments:** 200
- **POST /api/v1/me/enrollments:** 200
- **DELETE /api/v1/enrollments/completions:** 403 assignment required; successful operation blocked
- **POST /api/v1/enrollments/:id/completion:** 403 assignment required; successful operation blocked
- **DELETE /api/v1/enrollments/:id/completion:** 403 assignment required; successful operation blocked

### Evidence

- **POST /api/v1/evidence:** 400 expected input refusal; success not verified
- **DELETE /api/v1/evidence/:id:** 404 expected for missing test record; success not verified
- **PUT /api/v1/me/evidence-link:** 400 expected input refusal; success not verified
- **DELETE /api/v1/me/evidence-link:** 400 expected input refusal; success not verified
- **POST /api/v1/me/steps/:code/submission:** 400 expected input refusal; success not verified
- **DELETE /api/v1/me/steps/:code/submission:** 400 expected input refusal; success not verified

### Integrations

- **GET /api/v1/integrations/authenticators:** 200
- **DELETE /api/v1/integrations/authenticators/:userId:** 403 security unlock required; no live credentials/settings changed
- **GET /api/v1/integrations/credentials/export:** 403 security unlock required; no live credentials/settings changed
- **GET /api/v1/integrations:** 200
- **PATCH /api/v1/integrations/:key:** 403 security unlock required; no live credentials/settings changed
- **POST /api/v1/integrations/:key/credentials/validate:** 200
- **PUT /api/v1/integrations/:key/credentials:** 403 security unlock required; no live credentials/settings changed
- **DELETE /api/v1/integrations/:key/credentials:** 403 security unlock required; no live credentials/settings changed

### Me

- **GET /api/v1/me/launch:** 200
- **GET /api/v1/me/overview:** 200
- **GET /api/v1/me/stamp:** 200
- **PATCH /api/v1/me/stamp:** 200
- **GET /api/v1/me/notifications:** 200

### Queue Shares

- **POST /api/v1/queue-shares:** 403 assignment required; successful operation blocked
- **GET /api/v1/queue-shares/:token:** 200 with INVALID invitation; valid invitation flow not tested

### Queues

- **GET /api/v1/me/queue:** 200
- **POST /api/v1/me/queue:** 409 current completed placement/queue state; eligible waiting-student success not tested
- **DELETE /api/v1/me/queue:** 409 current completed placement/queue state; eligible waiting-student success not tested
- **GET /api/v1/queues:** 200
- **POST /api/v1/queues/serving:** 403 assignment required; successful operation blocked
- **DELETE /api/v1/queues/serving:** 403 assignment required; successful operation blocked
- **POST /api/v1/queues/serving/position:** 403 assignment required; successful operation blocked
- **POST /api/v1/queue-entries/:id/removal:** 404 expected for missing test record; success not verified
- **POST /api/v1/queue-entries/:id/restoration:** 400 expected input refusal; success not verified

### Reports

- **GET /api/v1/reports/user-directory:** 200
- **GET /api/v1/reports/roster:** 200
- **GET /api/v1/reports/roster-stats:** 200
- **GET /api/v1/reports/step-register:** 200

### Requirements

- **GET /api/v1/requirements:** 200
- **POST /api/v1/requirements:** 201 creation; 200 update/delete on dedicated temporary records
- **PUT /api/v1/requirements/order:** 200
- **PATCH /api/v1/requirements/:id:** 201 creation; 200 update/delete on dedicated temporary records
- **DELETE /api/v1/requirements/:id:** 201 creation; 200 update/delete on dedicated temporary records

### Schedules

- **GET /api/v1/me/schedule:** 200
- **PUT /api/v1/me/schedule:** 403 assignment required; successful operation blocked

### Storage

- **POST /api/v1/storage/session:** 400 expected input refusal; success not verified
- **POST /api/v1/storage/complete:** 404 expected for missing test record; success not verified
- **GET /api/v1/storage/session-status:** 404 expected for missing test record; success not verified
- **GET /api/v1/uploads/:id/content:** 404 expected for missing test record; success not verified

### Students

- **GET /api/v1/me/student/profile:** 200
- **GET /api/v1/students:** 200
- **GET /api/v1/students/board:** 200
- **POST /api/v1/students/reminders:** 200 with zero delivered reminders for missing test profile
- **GET /api/v1/me/student:** 200
- **PATCH /api/v1/me/student:** 200
- **GET /api/v1/students/:id/record:** 200
- **PUT /api/v1/students/:id/mugshot:** 404 expected for missing test record; success not verified
- **GET /api/v1/students/:id:** 200
- **GET /api/v1/me/record:** 200
- **POST /api/v1/me/assessment:** 200

### Submissions

- **GET /api/v1/submissions:** 200
- **GET /api/v1/submissions/:verificationId:** 200
- **POST /api/v1/submissions/:id/verification:** 404 expected for missing test record; success not verified
- **DELETE /api/v1/submissions/:id/verification:** 404 expected for missing test record; success not verified
- **POST /api/v1/submissions/:id/replies:** 404 expected for missing test record; success not verified

### Transfers

- **GET /api/v1/transfers:** 200
- **POST /api/v1/transfers:** 404 expected for missing test record; success not verified
- **PATCH /api/v1/transfers/:id:** 404 expected for missing test record; success not verified
- **DELETE /api/v1/transfers/:id:** 404 expected for missing test record; success not verified
- **POST /api/v1/departments/:id/takeover:** 404 expected for missing test record; success not verified

### Users

- **GET /api/v1/users:** 200
- **PATCH /api/v1/users:** 200 empty selection only; actual account changes not tested
- **DELETE /api/v1/users:** 200 empty selection only; actual account changes not tested
- **PATCH /api/v1/users/:userId:** 404 expected for missing test record; success not verified
- **DELETE /api/v1/users/:userId:** 404 expected for missing test record; success not verified
- **POST /api/v1/users/:userId/password-reset:** 404 expected for missing test record; success not verified

### Chat

- **POST /api/chat/stream:** 200; stream emitted start, token, done

### System

- **GET /api/health:** 200

### Authentication

- **POST /api/auth/email-otp/send-verification-otp:** 200 through website proxy; inbox/code consumption not verified
- **POST /api/auth/sign-in/email-otp:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **POST /api/auth/email-otp/verify-email:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **POST /api/auth/sign-in/email:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **POST /api/auth/sign-up/student:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **POST /api/auth/sign-up/email:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **POST /api/auth/sign-in/social:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **GET /api/auth/callback/google:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **GET /api/auth/get-session:** 200
- **POST /api/auth/sign-out:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/request-password-reset:** 200 through website proxy; direct API-page origin returned 403; delivery not verified
- **POST /api/auth/reset-password:** 400 expected missing-input/challenge refusal; valid sign-in or reset not performed
- **GET /api/auth/reset-password/:token:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **GET /api/auth/admin-gate/status:** 200
- **POST /api/auth/admin-gate/pin:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/admin-gate/password:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/admin-gate/code/send:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/admin-gate/code/verify:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/two-factor/enable:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/two-factor/verify-totp:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.
- **POST /api/auth/two-factor/verify-backup-code:** NOT RUN live — requires account interaction, fresh challenge/token, or security setup. Covered behavior is not a substitute for a live success screenshot.

Observed method/path pairs: 124 of 135. Expected refusals are included in this count and are not claimed as successful operations.
