# Database and evidence recovery

**Status:** Procedure only. Backup scheduling and a restore drill have not been verified. The deployment owner is responsible for setup and records; confirm ownership before marking the operations checklist complete.

## Backup schedule

- Maintain at least one daily MongoDB backup using Atlas snapshots when supported. If snapshots are unavailable, schedule MongoDB Database Tools `mongodump --archive --gzip` against the application DB during an agreed quiet or write-paused window. A dump during concurrent writes is not a point-in-time snapshot.
- Keep seven daily recovery points as a baseline, subject to the approved student-data retention policy. Encrypt exports and store them off-host in private, access-controlled storage. The DB backup contains student records and authentication and integration data; never commit it, its credentials, or a public download link.
- Back up retained R2 evidence separately to a private destination. Record the DB recovery point, evidence copy time and object inventory together. Preserve object keys so restored DB references resolve. Keep deployment secrets and app version in their approved stores, not in a shared backup log.
- Alert the deployment owner on a missed daily backup or a missing evidence inventory. An archive or snapshot is not proof of recovery.

## Restore drill

1. Start the timer. Select an approved recovery point and create a fresh isolated Atlas target and private evidence bucket. Never restore over production during a drill. Limit access to the drill team and disable outbound email, Google sync, and other live side effects.
2. Restore the Atlas snapshot to the isolated target. For a dump, use `mongorestore --archive=<archive> --gzip --nsInclude=<source-db>.* --nsFrom=<source-db>.* --nsTo=<drill-db>.*` with the isolated target connection supplied securely. Do not use `--drop` against production.
3. Restore the paired R2 copy. Validate collection counts and indexes against the recorded inventory. With authorized test accounts, verify sign-in, enrollment progress, staff review, and retrieval of a few corresponding private files. Account for any files newer than the recovery point.
4. Record backup age, restore time, counts, evidence checks and gaps in the restricted operations log. Compare against the proposed **24 h RPO / 1 h RTO**. Remove drill credentials and temporary copies according to policy. Repeat after a material storage or deployment change.
