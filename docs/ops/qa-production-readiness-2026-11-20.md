# Production-readiness QA — 2026-11-20

## Verdict: NO-GO

This working tree is not production-ready. Reproduced account destruction and timestamp-ordering defects, an evidence-ownership vulnerability, dependency advisories, and incomplete browser/provider coverage prevent approval. This was an audit, not an implementation pass: application source, configuration, dependencies, and existing operational records were not changed or repaired.

Evidence was gathered on Windows, Node 24.12.0, pnpm 12.3.4. Host clock checked at 2026-11-20 02:39 local time. The checkout began with extensive staged/unstaged changes; conclusions apply to that working tree, not a clean HEAD checkout or a deployed production environment.

## Scope and isolation

- Initial frontend: http://localhost:5173/ was serving. No API listener existed on port 3001; `/api/health` and other proxied API calls returned 502.
- With user approval to use disposable QA data, a separate `erpsys_qa_8f37c2d1` database was created on the configured MongoDB deployment. The original `erpsys` database and `.env` were not changed.
- A task-owned backend used port 3001, a disposable auth secret, and LOCAL_ONLY=true. Four synthetic credential identities represented STUDENT, SBO_OFFICER, ENROLLMENT_ADVISER, and ADMIN; one synthetic blocked identity was used for the destructive-registration reproduction.
- Academic year, departments, enrollment, adviser coverage and prerequisite stamps were synthetic. Queue prerequisites were seeded directly; their provider-backed acquisition was not tested end to end.
- No email, OAuth, Google Forms/Calendar, R2, Workers AI, or Turnstile provider writes were performed. No real student records or identifiers were used in the probes.
- Chrome was attempted only against the user-selected instance, but identity binding failed. The user authorized the independent In-App Browser instead. Some student UI checks ran there before a host consent/ownership error blocked further browser access. No alternate-surface workaround was attempted after that error.

## Automated verification

- PASS: `pnpm check` — server and web TypeScript checks.
- PASS: `pnpm build` — server build and web production bundle, approximately 8 seconds. This proves compilation, not live provider or deployment behavior.
- FAIL: `pnpm test` — 144 files passed, 1 failed; 1,420 tests passed, 1 failed; 1,421 tests total. Vitest duration 98.67 seconds.
- Focused reproduction: `pnpm exec vitest run --project web apps/web/src/app/router.test.tsx` — 3 passed, 1 failed. `redirects signed-out student route to login` expects the login search string `?reason=expired`, but receives `?dest=%2Fstudent`. See `apps/web/src/app/router.test.tsx:64-71`. Destination preservation may be intentional; resolve the test/contract mismatch rather than assuming the product redirect is wrong. No source was modified in this QA pass, so this is an existing working-tree failure; it was not compared against a pristine HEAD environment.
- FAIL: `pnpm bundle:budget` — `scripts/bundle-budget.mjs` is missing. `git ls-tree HEAD scripts/bundle-budget.mjs` also returned no entry. The declared command cannot enforce a release budget.
- Direct build measurement: 30 JS chunks, 3,303,263 uncompressed JS bytes. Largest chunks: pdfmake 971,358; ProfilingFormPanel 315,150; Helvetica 287,966; index 241,479; admin-page 227,422 bytes. No performance score, load-time budget, or device/network claim is made from these sizes.
- FAIL / TRIAGE REQUIRED: `pnpm audit --prod --json` reported 37 vulnerabilities: 2 critical, 14 high, 12 moderate, 9 low. Registry results are dependency advisories, not proof that every issue is reachable in the shipped server/browser. Optional/development tooling needs classification before prioritization.
- The optional structured-check runner could not launch its executable on this Windows host; verification was performed using the actual pnpm commands through the shell instead. Its infrastructure error is not classified as an application defect.

### Important dependency results

- better-auth 1.6.27: critical OAuth-state-as-magic-link account impersonation and high OAuth Proxy impersonation advisories, patched range `>=1.7.7`. Actual reachability depends on configured features, but authentication dependency remediation requires urgent triage and regression coverage.
- seroval 1.5.6: critical deserializer callable-execution finding (patched `>=1.6.1`) plus subsequent high findings through `>=1.6.8` and moderate through `>=1.6.10`. Audit marks these optional; classify whether the affected paths are shipped or invoked.
- zod 4.6.5: high oversized-collection memory exhaustion, patched `>=4.6.6`; body-parser 2.3.0: high compressed-body denial of service, patched `>=2.4.0`. Both are nonoptional findings in the audit.
- Other reported packages include DOMPurify, qs, Vite, @vitest/mocker, source-map-js and undici. Some are optional/tooling. Re-run the registry audit during remediation; no packages were updated here.

References: [Better Auth critical advisory](https://github.com/advisories/GHSA-965c-763c-88jm), [Better Auth OAuth Proxy advisory](https://github.com/advisories/GHSA-r4xp-prcw-77qf), [Seroval critical advisory](https://github.com/advisories/GHSA-p6vx-979v-rg4c).

## Release blockers and defects

### QA-01 — High: public registration deletes blocked accounts before validation

**Status: live reproduced on disposable data.**

Locations: `apps/server/src/config/auth/StudentSignUpPlugin.ts:127-156`; `apps/server/src/lib/db/user-purge.ts:14-59`; related claim path `apps/server/src/services/students.ts:251-254`.

The public signup endpoint purges a blocked account matching the supplied email or student number without password or verified ownership. Purge runs before validating the submitted academic placement. A registration attempt can destroy the existing account even when registration itself fails.

Reproduction:
1. Insert a synthetic blocked student and credential account into the isolated database.
2. Anonymous `POST /api/auth/sign-up/student` using that email, a new student number, and an intentionally nonexistent academic year.
3. Response: 400, `Pick a valid academic year.`
4. Persisted state: original user absent; original credential account absent.

Expected: disabled identities remain protected; public registration must not hard-delete them. Account restoration/reuse requires an explicit ownership/administrative process. The related student-number claim purge is source-confirmed, not separately live reproduced.

### QA-02 — High: evidence metadata accepts arbitrary R2 keys without ownership

**Status: acceptance and submission live reproduced; downstream remote deletion source-confirmed, not executed.**

Locations: `apps/server/src/routes/evidence/index.ts:78-102`; `apps/server/src/services/evidence.ts:43-66`; `apps/server/src/lib/storage/storage.ts:18-25`.

A student can register a fabricated `fileKey` and URL without completing a server-issued upload. The evidence and step submission endpoints both returned 201 for a disposable `r2:bucket:key`-shaped reference. Separately, draft expiry cleanup passes such keys to `purgeFiles`, which treats the prefix as an R2 deletion instruction without checking uploader ownership or requiring the upload backend to be R2.

Impact: a student who knows another object's bucket/key can cause deletion using the server's R2 permissions. Unknown-key discovery was not demonstrated. LOCAL_ONLY blocked outbound provider actions, and no real object was targeted or deleted.

Expected: accept only server-issued, completed uploads owned by the caller and intended step; constrain remote deletion to an owned server-recorded object and configured bucket.

### QA-03 — High: upsert bypass permits loss of newer verification

**Status: deterministic controlled interleaving reproduced against real MongoDB.**

Locations: `apps/server/src/lib/db/timestamp-ordering.ts:261-298`; `apps/server/src/models/StepVerificationModel.ts:295-324`.

`writeRule` checks for stale matches, but when `upsert=true` the actual write uses the original filter rather than the timestamp freshness guard. A newer transaction can write after the stale precheck but before the older upsert.

Reproduction used the real guard and a synthetic verification document, with a controlled hook immediately before the underlying Mongo update:
1. Document starts at writeTs=100.
2. Older transaction TS=200 passes stale precheck.
3. A newer verifier writes status=VERIFIED, writeTs=300.
4. Older upsert persists status=SUBMITTED, writeTs=200.

Observed: the newer verification was lost and writeTs decreased. This proves the race window, not its natural frequency or a full concurrent browser reproduction. Use an atomic freshness-safe upsert strategy and regression tests on real Mongo semantics.

### QA-04 — Medium: enrollment completion has a partial-write failure window

**Status: source-confirmed; failure injection not performed.**

Locations: `apps/server/src/services/enrollments.ts:52-53,85-108`; `apps/server/src/lib/db/timestamp-ordering.ts:214-226`.

Completion transitions the queue to COMPLETED before creating the ENROLLMENT stamp. Timestamp aborts do not roll back earlier writes and cannot restart after writing. If the verification write fails, the queue can remain completed without its verification. Retrying returns `outcome=already` before repairing the missing stamp/notification.

The normal completion/retry/revert path passed live testing; that does not eliminate this failure window. Establish transaction/reconciliation semantics and inject a second-write failure to verify recovery.

### QA-05 — Medium: profiling response ownership trusts unverified email

**Status: source-confirmed; provider exploitation not tested.**

Locations: `apps/server/src/config/auth.ts:161-164`; `apps/server/src/middleware/auth.ts:24-37`; `apps/server/src/routes/evidence/index.ts:300-317`; `apps/server/src/services/content.ts:50-61`.

Password signup does not require email verification. The session shape does not expose/check emailVerified when submitting profiling; Google Form responses are matched solely by session email. A registrant using an otherwise available victim email could attach that email owner's response to their own record. Direct disclosure back to the student was not established. Test with a dedicated QA form and verified-email ownership enforcement before production.

### QA-06 — Medium: several real-Mongo not-found paths return 500

**Status: live observed.**

Examples in the role GET matrix: officer `GET /api/v1/submissions/qa-missing/presence`, instructor/admin student-detail requests, and an admin academic-year-specific missing resource returned 500 with `Cannot read properties of null (reading 'readTs')`. The application should return a controlled 404/validation response, not a null dereference or internal implementation detail. Inspect `apps/server/src/lib/db/timestamp-ordering.ts:240-260` and findOneAndUpdate result handling across Mongo driver return shapes.

These requests deliberately used nonexistent disposable IDs. They demonstrate error-path defects, not that populated real records always fail. A small number of matrix requests also encountered a socket close/network reset and one users-list request returned 502; no cause was established, and those responses are not counted as successful coverage.

### QA-07 — Release verification/tooling gaps

The failing router assertion, missing bundle budget command, outdated load-test seed, and dependency advisories need resolution. `load/seed.mjs` still seeds retired standalone student-profile/step/adviser collections, whereas the current app embeds those structures. Do not use that seeder for production-like performance evidence without updating and isolating it.

## Live API coverage and results

The hand-written client API table contains 131 route definitions: 55 GET, 32 POST, 12 PATCH, 20 DELETE, 12 PUT. There are 45 distinct GET path templates. These are client definitions, not an exhaustive enumeration of every Better Auth/generated backend endpoint.

A GET-template matrix was attempted for anonymous, student, officer, instructor, and admin sessions. One OAuth-connect route was excluded because a nominal GET initiates provider mutation. Missing IDs and invalid query combinations were deliberately included. The initial matrix was interrupted late by a network reset; a subsequent pass covered instructor/admin and targeted writes. This is broad sampling, not a claim that all 131 operations, parameters, or response contracts passed.

Observed positive results:
- QA API health 200; frontend-to-API proxy restored while the isolated backend was running.
- All four synthetic credential roles signed in successfully.
- Anonymous protected API requests returned 401 in sampled families.
- Student/officer/instructor/admin surface restrictions returned expected 403s in sampled families; admin is not an all-surface superuser.
- Student assessment apply 201 → officer return/reply 201 → student reapply 201 → officer approve 201.
- Student cancellation of a verified assessment returned 409.
- Queue join without prerequisites returned 412.
- With directly seeded verified prerequisites and synthetic adviser coverage: instructor opens queue 200 → student joins 201 → duplicate join 409 → queue state 200 → adviser serves 201 → student attempts leave while serving 409 → completion 200 → repeated completion 200 → revert 200.
- Credential sign-in rate limiting returned 429 after repeated QA login attempts. It was not disabled or bypassed; later bounded attempts succeeded after the window elapsed.
- Admin integration writes required step-up (428). A credential-export request in the final flow had no admin session and returned 401; this is NOT a successful authenticated export test.
- Local-only storage upload-session returned 503; profiling without configured form returned 412. These verify unavailable behavior, not provider success.

Requests with invalid fixture data, wrong paths corrected during harness development, 401/403/404/412 negatives, 429, socket errors, or 5xx responses are not promoted to successful business-flow coverage. Test harnesses were temporary and removed after use.

## Browser/page coverage

The router declares 16 explicit routes plus a catch-all. Mapping completed for all routes; interactive testing did not complete for all of them.

Observed in In-App Browser:
- `/` → `/login` signed out; page presents sign-in, registration, forgotten-password and docs navigation.
- Login email/password form and successful synthetic student sign-in.
- `/student` loads the synthetic student identity, progress steps and profile controls.
- Student profile dialog opens/closes; showed correct QA student number and unassigned placement behavior.
- Queue eligibility/closed/missing-prerequisite UI and direct `/queue` rendering.
- Attempted wrong-role `/officer` navigation stopped at the host browser consent/ownership error. No claim is made about its final rendered redirect.

Mapped but not fully browser-tested: `/docs`, `/login/register`, `/login/forgot-password`, `/login/reset-password`, `/login/copy-code`, `/loading`, `/auth/error`, `/settings/accounts`, `/complete-profile`, `/officer`, `/instructor`, `/admin`, and catch-all/legacy hash combinations. Authentication navigation exercised `/loading` as part of login, but its independent edge cases were not exhaustively tested.

Console views still require interactive coverage:
- Student: all evidence steps, upload/crop, return/resubmit UI, notifications, profile changes, report/download, conditional chat.
- Officer: overview, assessment/social/profiling/mugshot/consent/SIMS review, revoke, presence, social links, form configuration, reports.
- Instructor: departments/year coverage, queue operations, transfer accept/decline/withdraw, schedules, reminders, enrolled register/reports.
- Admin: overview, users, students, passwords, departments, adviser mapping, academic years, requirements, profiling form, chatbot, integrations, reports, audit log; dialogs, destructive confirmations and step-up success.
- All surfaces: keyboard/focus/screen reader, mobile/tablet, visual overflow, loading/error/retry, pagination/filter combinations, reload/session expiry, concurrent sessions, clipboard/downloads, back navigation.

No complete button inventory was executed. No accessibility score, mobile compatibility pass, cross-browser pass, or full end-to-end UI pass is asserted.

## Integration and production-operation gaps

LOCAL_ONLY=true disabled external calls in the isolated backend. It defaults true and forces development mode; explicitly verify LOCAL_ONLY=false and NODE_ENV=production in deployment, otherwise production environment checks do not provide their intended guarantees.

Still unverified:
- Google OAuth sign-in, verified institutional role derivation, linking/unlinking, callback/origin settings, refresh/revocation.
- Brevo delivery, reset/invite email, admin confirmation code, delivery failures and spam behavior.
- Turnstile success/failure/expiry, action and hostname binding.
- R2 real upload/finalization/download, private access, MIME/size enforcement, CORS and cleanup ownership.
- Google Forms scopes, response matching and profiling ownership; Calendar OAuth/schedule sync, race/retry and event teardown.
- Workers AI/chat streaming, quota handling and knowledge controls.
- HTTPS/reverse-proxy cookies, production origin/CORS, deployed CSP, secret rotation and credential recovery.
- Data migration on a realistic restored backup, backup/restore drill, retention, monitoring/alerts, disaster recovery.
- Sustained load, multi-instance concurrency, actual index behavior at scale, database failover and provider outage recovery.

Provider success paths need designated QA mailboxes, Google accounts/forms/calendar, R2 bucket and AI quota in an integration-enabled sandbox. Reusing live resources without a separate authorization is not an acceptable substitute.

## Cleanup and resulting state

- Task-owned QA backend stopped. Port 3001 has no listener; original Vite frontend remains on 5173, so the initial missing-backend condition is restored.
- Atlas denied `dropDatabase`. Fallback cleanup deleted 101 synthetic documents across 19 collections in the exact isolated QA database, then verified zero documents remained.
- Empty `erpsys_qa_8f37c2d1` database/collection/index definitions remain. A database owner may drop that exact disposable database if desired; no operational database should be dropped.
- Temporary fixture/harness source files removed. No actual credentials or secret values are included in this report.
- No .env edits, package installs/upgrades, commits, existing-user edits, external mail or provider mutations.
- Production build artifacts were generated by the requested verification. This report and its documentation index link are the only intended persistent source/documentation changes from this pass.

## Required exit criteria before production approval

1. Remediate QA-01 through QA-03 with focused regression tests; verify real MongoDB concurrency and owned-upload cleanup.
2. Address QA-04/QA-05 and null-result 500s; inject partial failures and confirm recovery/state integrity.
3. Resolve all applicable critical/high advisories; document nonapplicable/optional findings with rationale. Re-run audit.
4. Make `pnpm check`, `pnpm test`, `pnpm build`, and a functioning bundle budget green; update the load fixture to the current schema.
5. Restore a consented browser target and execute the full route/tab/button flow matrix across roles, including mobile and keyboard accessibility.
6. Run provider success/failure flows in an authorized integration sandbox, followed by production configuration, backup/restore and observability checks.
7. Repeat a clean QA run against the final candidate commit and retain reproducible artifacts. Only then reassess production readiness.
