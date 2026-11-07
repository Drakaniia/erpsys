# Cloudflare R2 Storage Integration Spec (Drive replacement)

Status: draft v1 — 2026-10-14. Replaces `docs/specs/google-drive-spec.md` v2.
Supersedes the per-student My Drive via domain-wide delegation (DWD) design.
Code not yet written — PENDING build plan approval.

## 0. TL;DR answers (researched + interview-locked)

- **Is Cloudflare R1 or R2 free?**
  - There is **no Cloudflare "R1" storage product**. The storage lineup is
    **R2** (S3-compatible object/blob storage, for files), **D1** (serverless
    SQLite), **KV** (key-value), plus Queues/Hyperdrive/etc.
    ([Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/)).
    This spec targets **R2 for file bytes**. Interview decision: `Yes, R2 for files`.
  - **R2 free tier (recurring monthly, not a trial, Standard storage only):**
    `10 GB-month storage + 1M Class A ops (writes/lists) + 10M Class B ops
(reads) per month, egress to internet always free`
    ([R2 pricing](https://developers.cloudflare.com/r2/pricing/), verified 2026-10-14).
    Paid Standard beyond free: `$0.015/GB-month`, `Class A $4.50/M`,
    `Class B $0.36/M`. Infrequent Access is paid-only (no free tier,
    30-day minimum, retrieval fee) — **out of scope, do not use**.
  - Billing is storage + ops only. No egress cap from R2 itself, but other
    products (Workers, etc.) meter their own usage — this design uses
    **no Worker** so there is no second meter.

## 1. Context (verified in repo)

- Drive DWD v2 is **implemented but unshippable for this team**:
  - `apps/server/src/lib/drive/client.ts:84-102` — SA + DWD impersonation
    of the verified student (`drive.file` scope, `\\n`-unescaped key).
  - `apps/server/src/routes/v1/drive.ts:1-468` — `POST /api/v1/drive/session`,
    `POST /api/v1/drive/complete`, `GET /api/v1/drive/session-status`,
    plus content/download proxy; pending-row-before-bytes fixes the orphan
    leak; 24h `sessionExpiresAt`/`expiresAt`; idempotent complete.
  - `apps/server/src/lib/drive/{folders,sessions,sweep}.ts` — lazy
    `ERPSYS/<year>/{Evidence,Mugshot,Stamp}[/<stepCode>]` provisioning,
    caps (evidence 10MB / mugshot 10MB / stamp 5MB), allowlist
    `jpeg/png/webp + pdf`, 1 MiB resumable chunks, 15-min reaper +
    orphan reconciler, `drive:<owner>:<fileId>` keys, `driveFolder` cache.
  - Blocker (interview): team are **students with no BukSU Workspace admin
    access** — DWD grant (`Admin console → Security → API controls → DWD`)
    can never be obtained. SA keys also can't be rotated by the team.
- UploadThing is the live byte path today
  (`lib/db/uploadthing.ts`, `routes/uploadthing.ts`, `UPLOADTHING_TOKEN`
  in `.env.example:73`): three routes, no-op `onUploadComplete`.
- Cloudflare precedent in-repo: Workers AI is called **directly from Express
  via REST, no Worker to deploy** (`.env.example:37-55`, `env.ts:101-137`);
  `wrangler 4.149.0` already a server devDep (`apps/server/package.json:15`)
  with `cf:whoami` script; Turnstile widget created via wrangler
  (`.env.example:63`). Operator states `npx wrangler` **already authenticated**.
- Export-map rule (`AGENTS.md`): web consumes server only through
  `@erpsys/server` entries; `./drive` is a type-only surface today —
  R2 must follow the same pattern (`./storage` or reuse `./drive` name,
  dependency-free DTO module so Mongo/AWS SDK never lands in web bundle).

## 2. Goal

Completely replace the Google Drive implementation with **Cloudflare R2**,
Express → R2 via the **S3-compatible API** (no Worker, no R2 bindings):

- One shared R2 bucket (Standard class only) holds all three routes
  (`evidenceImage`, `mugshotCapture`, `stampImage`).
- Bytes path becomes **presigned-PUT direct browser → R2** (PoC-gated;
  backend-mediated fallback with identical session/complete API).
- Officers/students keep the **private-via-proxy** read model (no public
  bucket, no `r2.dev` URLs persisted); preview stays
  `GET /api/v1/uploads/:id/content` (Range support) with existing
  ownership guards.
- **Hard free-tier guard**: uploads block with clean `503 + maintenance
message` at **80% of 10 GB (8 GiB)** so the account can never drift into
  paid storage. Guard is dual-layer (local Mongo counters + periodic R2
  usage sync) and **strictly tested** per interview.
- **Full delete** of Drive + UploadThing code/paths after R2 verification
  (interview: `Full delete`, `Remove both`). Legacy rows untouched (render
  as today, no backfill).

## 3. Interview decisions (binding)

| #   | Decision        | Choice                                                                                                                                                          |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Product         | **R2** (R1 does not exist; D1/KV not needed for bytes)                                                                                                          |
| 2   | Motive          | No Workspace admin access (students only) + must not exceed free tier into real money                                                                           |
| 3   | Access path     | **Express via S3-compatible API** (AWS SDK S3 client, presigned URLs). No Worker                                                                                |
| 4   | Scope           | **Complete replacement**: delete Drive code, `googleapis` dep, `GOOGLE_SA_*` env, `drive:*` paths; also remove UploadThing integration                          |
| 5   | Legacy rows     | Untouched: Drive `drive:*`, UploadThing `fileUrl/fileKey`, `EXTERNAL_LINK` paste-links keep rendering; no backfill/copy                                         |
| 6   | Read model      | **Private via proxy** (keep auth-checked content endpoint; no public/signed-URL persistence)                                                                    |
| 7   | Key layout      | **Keep same prefix**: `erpsys/<academicYear>/{Evidence,Mugshot,Stamp}[/<stepCode>]/<owner-ish>/<uploadId>-<sanitized-name>` in one bucket                       |
| 8   | Quota guard     | **Both layers, best-of**: Mongo-tracked bytes (+ ops estimate) blocking mint **and** periodic R2 usage reconciliation; strictly tested for effectiveness        |
| 9   | Guard threshold | **Block at 80% (8 GiB) with 503** + maintenance copy; admin-visible logs/metrics                                                                                |
| 10  | Wrangler        | **Automate everything** via `npx wrangler` (operator already authed): bucket create, info/verify, token/key capture → `.env` wiring script                      |
| 11  | Limits          | **Unchanged** from Drive v2: 10/10/5 MB, jpeg/png/webp+pdf, 24h draft sweep, 15-min reaper (chunk size N/A for single-PUT; multipart only if fallback needs it) |
| 12  | Verification    | Manual E2E + automated guard tests required (no silent overrun)                                                                                                 |

## 4. Proposed architecture (not yet approved for build)

1. **Provision (wrangler, automated).** Script `pnpm --filter @erpsys/server r2:setup`
   runs (operator already `wrangler login`):
   `wrangler whoami` → `wrangler r2 bucket create <bucket>` →
   `wrangler r2 bucket info <bucket>` (verify Standard, location) →
   guide/print S3-credential mint (R2 dashboard → API tokens with
   Object Read & Write on this bucket only; wrangler has no S3-key mint,
   so the script captures `R2_ACCESS_KEY_ID/SECRET + endpoint` from the
   operator paste and validates with `HeadBucket`, then writes `.env`).
   Dev vs prod = two buckets (`erpsys-dev`, `erpsys-prod`) via
   `R2_BUCKET` env; never hardcode.
2. **Session mint** `POST /api/v1/storage/session` (renamed from `/drive/*`;
   keep route guards: student surface for `evidenceImage`, officer surface
   for mugshot/stamp; per-user 20/min rate limit reused from
   `driveSessionBudget`; validates mime/size/step-ownership; **checks quota
   guard BEFORE writing a row** → `503 STORAGE_QUOTA_EXCEEDED` when tripped).
   Server inserts **pending** `upload` doc (`backend:"r2"`, `r2Key`,
   `r2Bucket`, `r2Status:"pending"`, `idempotencyKey`, `sessionExpiresAt`
   = now+24h), then returns `{ uploadId, uploadUrl (presigned PUT, ~15-min
expiry), sessionExpiresAt }`. Presigned URL is secret: never logged/stored.
3. **Browser PUTs bytes direct to R2** (single PUT; `Content-Type` + `Content-Length`
   enforced to the validated mime/size). On completion browser calls
   `POST /api/v1/storage/complete { uploadId }` — **idempotent** (retry-safe;
   no client file-id needed since key is server-chosen). Server `HeadObject`
   verifies size/mime/etag, stores `fileKey = r2:<bucket>:<key>`,
   `fileUrl = null` (preview is proxied), keeps 24h `expiresAt` until step
   submission, increments the byte/ops counters. Mismatch → `422` + delete
   the object (no quota-fill).
4. **Status + content (unchanged shape).**
   `GET /api/v1/storage/session-status?uploadId=` → `pending|complete|abandoned`
   (+ `bytesReceived` via `HeadObject` when pending).
   `GET /api/v1/uploads/:id/content` (+ thumb variant) — ownership-checked,
   server `GetObject` → stream with Range passthrough, safe
   `Content-Type/Disposition`. No presigned GETs persisted.
5. **Sweep/reaper** (`draft-evidence.ts` extended): partition by `fileKey`
   prefix — `r2:*` → `DeleteObject`, legacy prefixes untouched. Keep 24h
   draft rule + 15-min abandoned-pending reaper. **Reconciler for R2-orphans**
   (objects with no finalized Mongo row — list by prefix, check age via
   `uploadId` segment/app-metadata, delete or adopt) runs on the same
   15-min tick. `EXTERNAL_LINK` still byte-less.
6. **Quota guard (dual-layer, hard).**
   - Layer A (blocking): `storage_usage` Mongo doc `{ bytesStored, classAOps,
classBOps, month, updatedAt }` updated on mint/complete/delete/sweep;
     `canMint(sizeBytes)` returns false when `bytesStored + sizeBytes > 8 GiB`
     (env-overridable `R2_QUOTA_BYTES`, default `8589934592`) or when monthly
     op counters exceed their 80% marks. Mint path checks first — no row, no URL.
   - Layer B (reconcile): 15-min job runs `HeadBucket`/list-count + Cloudflare
     usage sync (via API token) to correct drift (direct deletes, retries,
     multipart aborts); on divergence >1% it clamps to the larger value and
     alerts. When tripped: `503 { code: STORAGE_QUOTA_EXCEEDED, message }`
     reusing the `CLOUDFLARE_MAINTENANCE_MESSAGE` pattern; log with bucket+key
     (never presigned URLs); metrics label `storage_quota_blocked_total`.
   - Kill-switch env `R2_UPLOADS_ENABLED=false` forces the same 503 regardless
     of counters (ops/deploy use).

## 5. Data model (additive for R2, Drive fields removed with code)

- `upload` doc gains: `backend: "r2"`, `r2Bucket`, `r2Key`, `r2Status`
  (`pending|complete|abandoned`), `idempotencyKey`, `sessionExpiresAt`
  (nullable for legacy rows). `fileKey` convention: `r2:<bucket>:<key>`
  alongside untouched legacy `drive:*` / UploadThing / `external:*` keys.
- New `storage_usage` doc (single per month): `{ month, bytesStored,
classAOps, classBOps, updatedAt }` — the guard's source of truth.
- Never persist presigned URLs. `fileUrl` stays null for R2 rows.
- No migration/backfill: legacy rows keep their fields; Drive-specific
  fields (`driveFileId/FolderId/Owner/Route/Status`) and `driveFolder`
  cache collection disappear with the Drive code.

## 6. Permissions / security

- R2 API credentials + bucket name never leave server; browser only sees a
  single-object presigned PUT URL (short expiry, never logged/stored).
- **Owner binding** stays server-side: session → student record → key prefix;
  reject step/student contexts not belonging to the caller (same rule as
  Drive `resolveOwner` — no client-nominated owner/bucket/key).
- **No public access**: bucket private, no `r2.dev` public domain, no
  custom-domain public read in v1; all reads through the authorized proxy.
- Keep surface guards (`requireSurface("student"|"officer")`) on
  session/complete/status/content/delete; `POST /complete` re-verifies
  size/mime via `HeadObject` to block quota-fill; presigned PUTs carry
  exact `Content-Length`/`Content-Type` conditions.
- Deps: remove `googleapis`; add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  in `apps/server` only (never import from web).

## 7. Limits (locked from interview — same as Drive v2)

- evidence 10MB, mugshot 10MB, stamp 5MB; allowlist
  `image/jpeg, image/png, image/webp, application/pdf`; PDF rows render a
  file-chip (existing UI state).
- Presigned PUT expiry ~15 min (server pending deadline stays 24h per draft
  rule; Google's week-long session quirk disappears with R2).
- Nginx `client_max_body_size` still irrelevant for direct-to-R2 path
  (bytes bypass Express); only tiny session/complete bodies hit Express.
- Rate limit: 20 session-mints/user/min (reuse).

## 8. Ops (wrangler-first, automated)

- New env (via `lib/platform/env.ts` pattern + `.env.example` + deployment
  table + prod boot check): `R2_BUCKET`, `R2_ENDPOINT`
  (`https://<accountId>.r2.cloudflarestorage.com`), `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_QUOTA_BYTES` (default 8 GiB),
  `R2_UPLOADS_ENABLED` (default true), `R2_MAINTENANCE_MESSAGE`.
  Remove: `GOOGLE_SA_EMAIL/PRIVATE_KEY/DWD_SUBJECT/DRIVE_DOMAIN`,
  `UPLOADTHING_TOKEN` (with code), Drive SA boot-check in `env.ts:246-252`.
- Wrangler script (`r2:setup`, `r2:info`, `r2:verify`): `npx wrangler whoami`
  → bucket create/info → credential validate (`HeadBucket` + test
  put/head/delete of `erpsys/__healthcheck`) → `.env` write (no secrets to
  logs) → print dashboard token-scope reminder (Object Read & Write, this
  bucket only). Prod boot refuses mismatched/empty R2 vars (same style as
  `assertProductionEnv`).
- Observability: log session-mint/complete/delete/reconcile + quota blocks
  with `bucket+key` (never URLs); metrics for new endpoints + `*_blocked_total`;
  alert on failed R2 deletes, reconciler orphans, and guard-trips.
- Deletion checklist (full-delete): `lib/drive/*`, `routes/v1/drive*.ts`,
  `routes/uploadthing.ts` + `lib/db/uploadthing.ts`, web
  `lib/drive/*` + `lib/uploadthing.ts` + panels' UT branches, `googleapis`
  dep, `GOOGLE_*`/`UPLOADTHING_*` env + docs, `docs/specs/google-drive-spec.md`
  (mark superseded) + `docs/ops/drive-verification.md`; export map `./drive`
  → `./storage` (or remove if web needs no shared DTO beyond API routes).

## 9. Open questions for build plan

1. Endpoint rename: `/api/v1/storage/*` vs reuse `/api/v1/drive/*` paths with R2 backend (rename preferred — decide before web edits)?
2. Multipart threshold: single-PUT covers 10MB, but campus-network resume — add S3 multipart + abort-incomplete-uploads lifecycle rule?
3. R2 usage API shape for Layer B sync (GraphQL analytics vs bucket list-count) — which token scope the operator will grant?
4. Lifecycle rule on bucket (`AbortIncompleteMultipartUpload`, expire `__healthcheck`/abandoned prefixes) via wrangler or dashboard?
5. Jurisdiction/region hint for the bucket (default automatic vs explicit)?

## 10. Verification (manual E2E + automated guard tests)

0. Provision: `r2:setup` + `r2:verify` green from a prod-like origin.
1. As student: mint → PUT JPG + PDF → complete → submit step → open as
   officer via proxy (200); unauthorized user gets 403; `fileKey` is `r2:*`.
2. Repeat mugshot/stamp; check `erpsys/<year>/...` keys in bucket (via
   `wrangler r2 object list` / `r2:info` — officers check via ERPSYS only).
3. Kill browser mid-upload → pending row exists; idempotent `/complete`
   retry converges; sweep + reaper expire and `DeleteObject` at 24h/15-min.
4. Quota guard (automated, strict): unit — mint blocked at 8 GiB − size;
   integration — fill to cap, mint → 503, delete → mint succeeds; chaos —
   direct-bucket object without Mongo row → reconciler deletes/clamps and
   next mint still blocks; ops counters + kill-switch covered. **All must
   pass — effectiveness is the acceptance gate.**
5. Legacy rows: existing UploadThing + Drive + `EXTERNAL_LINK` rows still render.
6. Post-signoff cleanup PR deletes Drive + UploadThing code/paths; `pnpm check`,
   `pnpm test`, `pnpm --filter web build` green.

## 11. Explicit non-goals (v1)

- No backfill/copy of UploadThing or Drive bytes → R2.
- No public bucket, `r2.dev`, custom-domain public reads, or persisted signed URLs.
- No Infrequent Access class, no Workers/R2-bindings path, no D1/KV for uploads.
- No change to `EXTERNAL_LINK` paste-link validation.
- No per-student buckets or per-student credentials (one app bucket, server-owned keys).

## 12. Build notes (locked decisions, 2026-10-14)

- R2 free tier: 10 GB / 1M-A / 10M-B per month, Standard only, egress free.
- Guard: 80% bytes cap (8 GiB default), dual-layer (Mongo counters + R2 sync), 503 + maintenance copy, kill switch.
- Keys: `erpsys/<academicYear>/{Evidence,Mugshot,Stamp}[/<stepCode>]/...` in one Standard bucket.
- Wrangler: operator already authed — setup/info/verify scripted via `npx wrangler`, S3 creds validated with `HeadBucket`.
- Delete list: Drive `lib/drive/*` + `routes/v1/drive*` + tests, UploadThing server+web paths, `googleapis`, `GOOGLE_SA_*`/`UPLOADTHING_*` env, drive verification doc.
