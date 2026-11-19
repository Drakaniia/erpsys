# Collection simplification

## Storage boundaries

- `audit_log` holds HTTP audit events (`kind: http`) and domain/admin actions (`kind: action`). The audit endpoint filters actions out; the overview filters HTTP events out. These are distinct events, not duplicate records to discard.
- `integration` holds one document per integration key. `values` remain encrypted server-side. `version`, `updatedAt`, and `updatedById` track credential changes; `enabled`, `enabledAt`, and `enabledById` track switches independently. Resetting credentials must not reset a switch.
- `academic_year.profilingForm` owns the year's form configuration. `null` means explicitly unlinked.
- Notification content remains durable in `notification`. Read IDs use account-scoped `localStorage`, bounded to the most recent 1,000 marked IDs. Read status no longer syncs across devices. Clearing browser storage resets local markers. Existing database read markers remain honored; no new ones are written.
- Authentication, step-up challenges, quotas, queue ownership, enrollment records, and schedules remain server-owned. Browser storage is not an authorization boundary.
- Editor tracking has been removed. Save-conflict checks remain in the database wrapper; forms retain their original edit timestamps. An existing legacy editor-tracking collection can be dropped after the updated server and web app are deployed.

## Migration history

The one-time migration copied legacy `admin_action_log`, `integration_setting`, `integration_credential`, and `profiling_form` records without deleting the source collections or decrypting credential values. See the [migration QA results](collection-migration-qa.md) for the applied migration.

The current server does not read legacy collections. Before using a legacy backup, verify that it contains the consolidated data or arrange a separate migration before starting the server.

Old collections remain backup material until a separate cleanup is approved. After accepting new writes, rollback requires reconciling destination changes; merely restarting the old version would hide new records.

## Further reductions considered

Adviser ownership and availability have different academic-year and lifecycle semantics. Student profiles and enrollments preserve identity versus year-specific history. Requirements and workflow steps are different domain objects. Do not merge them solely to reduce the collection count.
