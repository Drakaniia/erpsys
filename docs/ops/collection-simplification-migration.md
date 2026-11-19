# Collection simplification v2: offline migration

## Status and boundaries

This is an operator-run, offline migration, not a server startup migration. The implementation and automated tests do not connect to a database. No live database has been migrated or inspected as part of this change. A fresh manual QA run on a restored, access-controlled backup is required before production use.

The runner uses its own `MongoClient`, not runtime database helpers, timestamp ordering, initialization or maintenance jobs. Configuration is loaded lazily only when the runner is called. Importing the pure planner or argument parser does not load environment configuration or connect. It loads `DATABASE_URL` using the existing server environment configuration; never put a URI or credentials in command arguments or logs.

There are no drops, deletes, source updates, automatic cleanup, indexes, account deletions, or legacy administrative/integration migration operations in this tool. It reads the complete relevant collections into memory; budget memory and maintenance time against a restored production-sized backup. It requires MongoDB support for `$getField` (MongoDB 5.0+). It is not safe to run against a database with active writers.

## Exact transformations

| Source | Destination | Transformation |
| --- | --- | --- |
| `student_profile` | `user.studentProfile` | Copy every persisted field except `userId`; retain `_id`, `studentNumber`, `academicYearId`, `createdAt`, `updatedAt`, `readTs`, `writeTs` when present. DTO `userId` derives from parent user. |
| `adviser_department` | `department.advisers[]` | Copy every field except `departmentId`; retain assignment `_id`, `adviserId`, optional `yearLevels`, timestamps and guards. |
| `requirement_item` | `content` | Retain every field and `_id`, add `kind: 'requirement'`. |
| `social_media_link` | `content` | Retain every field and `_id`, add `kind: 'socialLink'`. |
| `adviser_availability` | `adviser_schedule` | Retain every field and `_id`, add `kind: 'presence'`. |
| `availability_window` | `adviser_schedule` | Retain fields and `_id`; move source `kind` (`WEEKLY`, `EXTRA`, `CANCEL`) to `windowKind`, set `kind: 'window'`. |
| `step_verification.stepId` | Same row and field | Resolve the old `step._id` through its `code` to canonical `STEP_CODES`; already canonical values remain unchanged. All other fields, including evidence and guards, remain unchanged. |

`step` rows are validated and retained untouched; runtime definitions replace their use. Missing step definitions are allowed only where references already use canonical codes. Unknown definitions, duplicate codes, canonical-ID/code disagreement, and unknown references fail closed. IDs are never generated or converted; BSON ObjectIds remain ObjectIds. Ambiguous string/ObjectId aliases fail closed instead of selecting a parent arbitrarily.

Yearly `student_enrollment` rows, their IDs and profile references are preserved without writes. They are checked for orphan profile/year/department references. Permanent account deletion is a separate product operation and may erase related history; this migration does not promise history retention after deletion and performs no such deletion itself.

## Preconditions and dry-run

1. Verify the exact release and migration source on an isolated restored backup. Do not run old migration scripts to make this script succeed. Existing legacy migrations require separate review and fresh manual QA; this tool does not reconcile their audit logs, integration settings or credentials.
2. Create a full backup with a verified restore procedure. Retain a nonsecret backup reference outside the database. The flag is an operator attestation, not an automated backup check.
3. Stop **every** writer: API/server instances, workers, minute sweeps, schedulers, admin tools, imports, external scripts and direct database clients. Keep them stopped through verification and completion-marker creation. Do not roll old binaries back onto transformed data.
4. Confirm the intended `DATABASE_URL` privately without printing it. Run from the repository root:

   ```text
   pnpm --filter @erpsys/server exec tsx src/scripts/simplify-collections.ts
   ```

   `--dry-run` is optional and makes no writes, including no marker writes. Unknown, repeated, contradictory, or malformed arguments fail before configuration or connection. Output is counts and generic error codes only; no user data, documents, IDs, URIs, credentials or backup reference is printed. Do not capture driver debugging logs containing connection details.
5. Investigate any generic reconciliation failure privately using secure database tooling. Do not paste raw user documents or credentials into tracked files. No automatic conflict resolution exists. Repeat a dry-run after any separately approved repair.

The planner rejects duplicate/ambiguous profile ownership or student numbers, missing parents, source/destination ID collisions, different destination fields, invalid assignment levels, overlapping year-level assignments within a department (empty means all levels), duplicate adviser/department assignments, duplicate presence tuples `(adviserId, departmentId, academicYearId)`, unknown schedule discriminators, and invalid/overlapping windows using the existing per-adviser/department/year schedule validator. One adviser may hold assignments in multiple departments. Duplicate verification tuples created by remapping also fail. Nothing is silently discarded.

Historical assignment `_id` values must be present and are retained during migration. New runtime assignments may omit that legacy identifier; do not run this migration against an already active v2 database.

## Apply, verification and interrupted runs

```text
pnpm --filter @erpsys/server exec tsx src/scripts/simplify-collections.ts --apply --writers-stopped --backup-reference <nonsecret-backup-reference>
```

Apply requires both acknowledgements. The script snapshots and plans before writing, rechecks that snapshot, inserts missing destinations and conditionally merges parents. Each parent merge compares the complete original document (including field presence and timestamp guards) in a MongoDB atomic compare-and-swap. It sets the embedded field or `stepId` and raises parent `readTs`/`writeTs` to the maximum of parent and embedded source clocks; it never replaces parents or lowers guard clocks. Matching partial destinations are also checked for missing parent guards. Concurrent changes abort, not restart. New destination inserts never use an overwrite/upsert path. This defense does **not** make online migration safe: the snapshot is not transactional, and unrelated/source writes can race. Offline operation remains mandatory.

Embedded identity cannot safely be moved between accounts without a multi-document transaction. Cross-account institutional claims now fail closed and require SBO-assisted ownership resolution rather than automatically detaching history from an existing owner. Normal same-account registration remains idempotent; explicit permanent purge retains the full-erasure policy.

After all writes, it rereads every relevant collection and compares every complete row with the expected result, not just counts. Source rows and yearly enrollments must still match exactly. It reruns the planner and requires zero remaining changes. Only after these checks does it insert `platform_state` marker `{ _id: 'collection-simplification-v2', version: 2, completedAt: Date }` with insert-if-absent semantics. Existing marker or competing insertion cannot be overwritten. The client is closed in `finally`; any failure exits nonzero with a generic code.

Writes are deliberately not a single cross-collection transaction. If interrupted **before** the completion marker, keep writers stopped and rerun dry-run/apply: matching existing destination rows are accepted field-by-field, missing rows are planned, and remaining remaps resume. No migration journal containing private rows is written. A crash after data verification but before marker insertion is recoverable with another offline apply. A failure is never permission to resume traffic.

Once the marker exists, the runner refuses further execution (`MIGRATION_ALREADY_COMPLETED`), including dry-run: retained sources become stale once the new application starts writing and must not be treated as authoritative again. Runtime startup permits a fresh empty database without a marker but must refuse nonempty obsolete source collections without a valid v2 marker. Runtime must not repeatedly reconcile stale sources once the marker exists.

## Manual QA release gate

On a restored backup, record nonsecret counts/error codes and privately verify:

- Every profile ID, student number, owner and academic-year reference resolves through the embedded profile; all original timestamps/guards remain intact.
- Every adviser assignment ID and level coverage is preserved, including optional/empty levels. Department routing and administrative assignment edits work.
- Active/inactive requirements and social links retain order, labels/URLs and IDs. Both content kinds work through their existing API contracts.
- Presence state/times and weekly, extra and cancel windows round-trip through unchanged API shapes; schedule validation and unique partial presence index work.
- All historical yearly enrollments and verification evidence are intact. Step references are canonical; all six workflow steps and completion/report paths work.
- A partially applied run resumes correctly on a separately reset backup. Simulated concurrent parent mutation fails CAS rather than losing an edit. Marker insertion is last and startup refuses unmigrated sources without it.
- Fresh database startup and permanent account deletion match the release's explicit retention policy.

These database/driver and runtime checks are **not** established by the pure automated planner tests. No automated rollback exists; restore a verified backup while all writers remain stopped if rollback is required. Obtain approval before resuming traffic only after migration, marker, required indexes and manual application QA pass.

## Retained sources and legacy cleanup

Leave source collections untouched until independent retention/backup approval. In particular never automatically drop `admin_action_log`, `integration_setting`, `integration_credential`, `profiling_form`, or `editing_presence`. The migration runner does not read these legacy collections or their credential documents. Never remove the completion marker merely to rerun against stale sources.

### Separate v2 source retirement command

After independent cleanup approval, a verified full backup and isolated restore drill, and confirmation that every old writer is retired, keep all writers stopped. Run:

```text
pnpm --filter @erpsys/server exec tsx src/scripts/retire-simplified-collections.ts --dry-run
pnpm --filter @erpsys/server exec tsx src/scripts/retire-simplified-collections.ts --apply --writers-stopped --restore-verified --backup-reference <nonsecret-verified-backup-reference> --database <exact-configured-database-name>
```

The acknowledgements are operator attestations, not automated checks of backup media or remote processes. This command only drops the seven transformed v2 source collections listed above, including empty collections. It does not delete authentication, yearly enrollments, verifications, evidence, operational collections, the completion marker, or any of the five conditional legacy collections. It requires the valid v2 marker and exact database-name acknowledgement, reruns full source/destination reconciliation, and compares all migration-related rows immediately before and after each drop. No source document is selectively deleted and no destination is rewritten.

This is an offline, fail-closed command, not a transactional or online cleanup. All writers must remain stopped through the entire run. A concurrent edit detected after a drop stops further drops; restore from the verified backup if needed. Missing sources are accepted so interrupted cleanup can resume, but matching remaining source rows are still required. If the new application has already changed destinations, stale sources may conflict: stop for independent reconciliation rather than forcing cleanup or replaying the migration. Logs expose aggregate counts/error codes only.

Conditional legacy cleanup still requires separate current destination reconciliation and approval. Historical QA and the v2 marker do not prove that older audit, integration or profiling data can be discarded.

### Separate legacy retirement command

With separate deletion approval, verified full backup/isolated restore, and all old/local/deployed writers stopped:

```text
pnpm --filter @erpsys/server exec tsx src/scripts/retire-legacy-collections.ts --dry-run
pnpm --filter @erpsys/server exec tsx src/scripts/retire-legacy-collections.ts --apply --writers-stopped --restore-verified --backup-reference <nonsecret-verified-backup-reference> --database <exact-configured-database-name>
```

This command can drop only `admin_action_log`, `integration_setting`, `integration_credential`, `profiling_form` and empty `editing_presence`. It never writes destinations or repairs data. Audit reconciliation uses unique `legacyId` mapping, exact event fields, action discriminator and derived timestamps; changed destination IDs alone are not missing events. Switch and credential metadata are compared independently against the shared integration row, including the earliest creation timestamp. Credential ciphertext is compared without decryption. Profiling forms must match their year's embedded fields and legacy ID; explicit unlinking is a conflict, not permission to resurrect a form. Unrecognized switch/credential source fields and nonempty editor presence fail closed.

The command snapshots all five sources and all three destinations before cleanup, compares them immediately before/after each drop, and rechecks reconciliation before each drop. It accepts already absent sources for interrupted-run recovery. It is offline and not transactional; acknowledgements are operator attestations, and concurrent writes detected after a drop stop further cleanup. Restore from the verified backup if required, keeping writers stopped. Completion evidence is in [collection migration QA](collection-migration-qa.md).
