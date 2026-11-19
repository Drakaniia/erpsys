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

## Not exercised against live data

Destructive CRUD, switching integrations, replacing credentials, academic-year activation, queue join/serve/complete/revert, new submissions/stamps, password-reset emails, live AI prompts, OAuth consent, Calendar writes, R2 uploads/deletions, and separate-role account isolation were not performed. These can send external messages, incur usage, or alter real business records. Existing automated tests cover many corresponding routes, but do not establish provider end-to-end success.

Full mutating end-to-end QA should use a disposable database and test accounts. Repairing legacy timestamps and changing the completion message are separate changes, not part of this migration verification.

## Preview operation

The managed preview launcher failed on this host; direct Node processes were used. API process: PID 21372. Vite process: PID 5416. Both ports were listening at final verification. Process IDs are transient. No source code was changed during this QA pass.
