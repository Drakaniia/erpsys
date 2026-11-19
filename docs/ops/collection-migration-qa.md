# Collection migration and QA results

## Verdict

Migration passed field-by-field verification. Preview runs at http://localhost:5173/admin, with the API on port 3001. QA is not fully green: two existing unit-test failures and one preserved legacy-data API failure remain. Browser coverage used an existing admin session with access to multiple surfaces; it does not prove separate-role isolation in real accounts.

## Migration evidence

The user confirmed the workspace-configured Atlas `erpsys` database. No repository server/Vite processes or application listeners were running before migration. Other remote writers were not independently controlled; the database reported two current connections during preflight.

A full compressed MongoDB dump completed successfully before migration. The 61,285-byte archive is stored locally at `.env.migration-backups/pre-simplification-1794977520793.archive.gz`, excluded from Git. It contains private account and authentication data; do not publish it. Restore was not rehearsed.

Preview and apply both reported 86 admin actions, four integration keys, and one profiling form. Post-apply comparison verified:

- All 86 action records retain source fields, with derived timestamps and distinct action event type.
- All four integration switches retain their values and attribution.
- The encrypted credential group retains identical opaque values and version.
- The embedded form retains source fields.
- All 37 original HTTP audit events remain. `audit_log` contains 123 events immediately after migration.
- Source collections remain intact. No collection was dropped.

## Automated verification

- `pnpm check`: passed for server production/test TypeScript and web TypeScript.
- `pnpm build`: passed for both apps. The web build still warns about a large PDF chunk.
- Full Vitest run: 1,167 passed, two failed, across 123 files (122 passed).
- Failures: `ScheduleDialog.test.tsx`, “saves the rows as server windows and closes” and “blocks a one-off day with no date before calling the server.” Both also failed before this migration. The mock counts an editing-presence PUT as a schedule save.

## Browser and HTTP checks

Public routes were tested in a clean headless Edge context at 1440×1000 and 390×844: root/login, registration, forgot password, invalid reset link, auth error, documentation, and an unknown route. No horizontal overflow or uncaught page errors were detected. The unknown route redirects to login while signed out rather than showing a standalone 404.

Anonymous access to admin, officer, instructor, student, queue, and connected-account pages redirected to login at both sizes. Launch, audit, notifications, and users APIs returned 401 anonymously. Integration public flags and signup options returned 200, as designed.

Authenticated checks used the existing admin session:

- Admin overview, users API, academic years, requirements, departments, advisers, integration list, and migrated profiling settings loaded.
- Integration list returned eight rows and kept Better Auth locked on. No credentials were exported or changed.
- Officer overview and profiling submission list loaded; narrow layout had no document-level horizontal overflow.
- Instructor manage-departments view, notifications, calendar status, transfers, and schedule read loaded. Schedule read requires `departmentId`; omitting it correctly returned 400, and including it returned 200.
- Student progress, profile, linked profiling-form sheet, notifications, and a generated enrollment PDF review loaded. No form was submitted and no PDF with private records was published.
- The notification endpoint remained readable. Existing notifications were already marked read, so a new unread-to-localStorage transition was not demonstrated live; the automated account-isolation, persistence, storage-failure and cross-tab tests passed.

## Findings

1. `GET /api/v1/audit-logs` returns 500 `Invalid time value`. Eighteen original HTTP audit records have `at` but no `createdAt`. Those records were present before migration and were preserved unchanged. The reader calls `toISOString()` on missing `createdAt`. No timestamp repair was performed.
2. Student progress shows “all steps complete” and an enrollment success notice while Assessment is pending and Profiling is returned. This existing record state needs product/data review; migration did not modify queue or verification records.
3. Two existing ScheduleDialog unit tests remain red, as described above.

## Live v2 completion and source retirement

After the initial gate check below, the operator explicitly confirmed every local and deployed writer was stopped and approved a fresh full backup, isolated restore drill, v2 application and retirement of only the seven v2 source collections.

The private backup is `.env.migration-backups/d62f67c9-e502-41c6-9048-48317fb9a6ee/erpsys.archive.gz`. An isolated local MongoDB restore matched all 34 original collections, 1,092 documents and every index. The first attempt used a Unix-only server option and was retried successfully without it; no live data was changed during backup/restore.

The v2 apply completed and verified 31 changed rows: 7 parent updates, 12 destination inserts and 12 stable step-reference remaps. Independent source retirement reconciled the sources again and dropped all seven approved collections. Final comparison against the restored backup verified the exact expected migration result, absence of all seven sources, unchanged contents of 20 unrelated collections and unchanged platform state except the completion marker. The resulting database has 28 collections, 5 content rows, 7 adviser-schedule rows and all 5 yearly enrollment records. Embedded-profile and typed-collection indexes are present. Both isolated restore instances were shut down cleanly.

No conditional legacy collection was dropped. The audit ID mismatch described below remains unresolved; matching integration/form fields alone is not separate retention/deletion approval. The backup and restored data are private and ignored by Git.

Current code verification: `pnpm check` passed; 95 focused migration/retirement/identity/users/transfers tests passed. `pnpm test` was run but is not fully green: the web-router unauthenticated redirect assertion fails before and after this turn's edits (`dest` versus `reason=expired`), and auth failures under the full run passed when all 13 auth tests were rerun in isolation. No unrelated frontend/auth fix was attempted.

## Legacy reconciliation and final retirement

The operator subsequently explicitly approved reconciliation of `admin_action_log` and retirement of all remaining legacy collections. The audit mismatch was an identity-mapping issue, not missing events: all 86 original rows mapped uniquely through `audit_log.legacyId`, with `kind: "action"`, every original event field preserved (including `at`, reason and detail), and `createdAt`/`updatedAt` exactly derived from `at`. No audit rows were inserted or repaired.

Strict reconciliation also verified all 4 integration switch values/timestamps/attribution, the 1 encrypted credential record's opaque values/version/timestamps/attribution, and the 1 embedded profiling form with its `legacyId`. Shared integration creation time matches the earliest source creation time; credential values were not decrypted. Unexpected source fields, ambiguous mappings, modified destinations and nonempty editor presence block the retirement tool.

A fresh private full backup is retained at `.env.migration-backups/926d44bd-9164-452f-a328-2ec28e6e6825/erpsys.archive.gz`. Its isolated restore matched all 28 pre-cleanup collections, 1,080 documents and all indexes, then the isolated server shut down. Private per-collection document/index digests were retained beside the archive.

The separate approved legacy retirement dropped `admin_action_log`, `integration_setting`, `integration_credential` and `profiling_form`. `editing_presence` was already absent. Final verification proved all five legacy names absent and all 24 surviving collections, 988 documents and indexes identical to the fresh backup. There were no destination writes and no changes to authentication, enrollments, operational records or platform state. Application writers were not restarted.

Typechecks and 36 focused retirement tests passed. The full suite finished with 1,420 tests passed and one pre-existing web-router redirect assertion failed (`?reason=expired` expected versus `?dest=%2Fstudent` actual); all server tests passed. Old audit reconciliation blockers in the historical sections below are now resolved.

### Initial gate check (superseded by successful v2 and legacy completion above)

A subsequent read-only check of the configured `erpsys` database found that v2 has not been applied: the completion marker is absent, `content` and `adviser_schedule` are empty, and all seven v2 source collections still exist. The planner dry-run passes with 7 parent updates, 12 inserts and 12 step-reference remaps. The retirement dry-run correctly refuses with `VERIFIED_V2_MARKER_REQUIRED`. No live writes or drops were performed during this check.

Legacy field comparisons matched all 4 integration switch records, the 1 encrypted credential record (opaque comparison, no decryption), and the 1 profiling form. Audit reconciliation remains unresolved: none of the 86 legacy action IDs matched a destination action ID, although the destination contains 103 action-bearing rows. This does not establish that the events are absent under different IDs; it blocks deletion until a reviewed one-to-one reconciliation is available. `editing_presence` is already absent.

At this initial check, the historical backup path was not found and backup/restore plus stopped-writer confirmation were still required. Those v2 prerequisites were subsequently satisfied as recorded above. Historical QA still does not grant deletion approval for the conditional legacy collections.

## Not exercised against live data

Destructive CRUD, switching integrations, replacing credentials, academic-year activation, queue join/serve/complete/revert, new submissions/stamps, password-reset emails, live AI prompts, OAuth consent, Calendar writes, R2 uploads/deletions, and separate-role account isolation were not performed. These can send external messages, incur usage, or alter real business records. Existing automated tests cover many corresponding routes, but do not establish provider end-to-end success.

Full mutating end-to-end QA should use a disposable database and test accounts. Repairing legacy timestamps and changing the completion message are separate changes, not part of this migration verification.

## Preview operation

The managed preview launcher failed on this host; direct Node processes were used. API process: PID 21372. Vite process: PID 5416. Both ports were listening at final verification. Process IDs are transient. No source code was changed during this QA pass.
