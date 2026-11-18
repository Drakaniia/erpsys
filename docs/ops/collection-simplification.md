# Collection simplification

## Storage boundaries

- `audit_log` holds HTTP audit events (`kind: http`) and domain/admin actions (`kind: action`). The audit endpoint filters actions out; the overview filters HTTP events out. These are distinct events, not duplicate records to discard.
- `integration` holds one document per integration key. `values` remain encrypted server-side. `version`, `updatedAt`, and `updatedById` track credential changes; `enabled`, `enabledAt`, and `enabledById` track switches independently. Resetting credentials must not reset a switch.
- `academic_year.profilingForm` owns the year's form configuration. `null` means explicitly unlinked.
- Notification content remains durable in `notification`. Read IDs use account-scoped `localStorage`, bounded to the most recent 1,000 marked IDs. Read status no longer syncs across devices. Clearing browser storage resets local markers. Existing database read markers remain honored; no new ones are written.
- Authentication, step-up challenges, quotas, shared editing presence, queue ownership, enrollment records, and schedules remain server-owned. Browser storage is not an authorization boundary.

## Migration

Do not deploy the new server against unmigrated data. The code deliberately does not dual-read old collections.

1. Back up the database. Stop the server, background jobs, and all other writers.
2. Use the deployment database environment and preview: `pnpm --filter @erpsys/server db:simplify`.
3. Resolve duplicate integration keys, duplicate forms per year, missing year references, or missing action timestamps reported by the preview.
4. Apply: `pnpm --filter @erpsys/server db:simplify --apply`.
5. Verify copied actions, integration keys/versions/encrypted values, and embedded forms against the backup. Preview counts describe source data, not a verification of destination completeness.
6. Start the new server. Verify integrations, audit paging, overview activity, form read/unlink, student submission, and notifications.

Migration copies legacy `admin_action_log`, `integration_setting`, `integration_credential`, and `profiling_form`. It never drops or deletes source collections. It preserves opaque encrypted fields without decrypting or printing credentials. Repeating it inserts only missing destination records and does not overwrite subsequent destination changes. Do not resume old writers between runs.

Old collections remain backup material until a separate cleanup is approved. After accepting new writes, rollback requires reconciling destination changes; merely restarting the old version would hide new records.

## Further reductions considered

Adviser ownership and availability have different academic-year and lifecycle semantics. Student profiles and enrollments preserve identity versus year-specific history. Requirements and workflow steps are different domain objects. Do not merge them solely to reduce the collection count.
