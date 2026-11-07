# Google Drive Integration Spec

> SUPERSEDED by `cloudflare-r2-spec.md` (2026-10-15). Drive code deleted —
> R2 is the only backend. Kept for history only.

Status: draft v2 — revised 2026-10-14 for per-student Drive via
domain-wide delegation (DWD). Supersedes v1 single-root-folder design.
Ops/docs side implemented, code not yet written — PENDING verification
(see §10 + `docs/ops/drive-verification.md`).

## 1. Context (verified in repo)

- Real file bytes today go to **UploadThing**, not Drive:
  - `apps/server/src/lib/db/uploadthing.ts:31-41` — three routes
    (`evidenceImage` 4MB, `mugshotCapture` 4MB, `stampImage` 2MB),
    `onUploadComplete` is a no-op.
  - `apps/server/src/routes/uploadthing.ts:1-6` + `app.ts:57`
    mounts `/api/uploadthing`. Needs `UPLOADTHING_TOKEN`
    (`docs/ops/deployment.md:186`).
  - Web client: `apps/web/src/lib/uploadthing.ts`,
    `EvidenceUploadPanel.tsx` (`startUpload`), `StampPanel.tsx`,
    `officer/detail-sheet.ts`.
- "Google Drive" today is **pasted URLs only**, no Drive API:
  - `EvidenceSlot.tsx:92-95` allowlists `drive.google.com` +
    `storage.to`; `validateLink` enforces `https:`.
  - `PUT /api/v1/me/evidence-link` (`routes/v1/me/evidence.ts:40-54`)
    stores `fileKey = external:<stepCode>:<url>`,
    `kind = "EXTERNAL_LINK"`. No ownership/sharing check.
  - No `googleapis` dep, no `GOOGLE_*_DRIVE` env, no service account.
    `GOOGLE_CLIENT_ID/SECRET` is Better-Auth sign-in only.
- Draft lifecycle: unsubmitted uploads expire after 24h; `sweepDraftEvidence`
  deletes bytes via `utapi.deleteFiles` (`lib/queries/draft-evidence.ts:19-38`)
  and marks `expiredAt/filePurgedAt`. `EXTERNAL_LINK` rows are excluded
  from byte-purge (no bytes to purge).
- Known debt: orphan-file leak — client uploads then crashes before the
  `upload` doc is written, sweeper can't see the file
  (`docs/specs/open-requests.md:22`).

## 2. Goal

Real Google Drive backing for uploads, Drive-first, with UploadThing
retained temporarily and removed only after manual verification passes.

**Storage model (v2, binding): per-student My Drive, not a central folder.**
Each student's files (e.g. `11283712@student.buksu.edu.ph`) live in that
student's own Drive under `My Drive/ERPSYS/<academicYear>/{Evidence,Mugshot,Stamp}/`,
created via a service account with **domain-wide delegation (DWD)**
impersonating the verified student. Officers never get Drive shares;
they view through ERPSYS (backend-mediated). Rationale: service accounts
have no My Drive quota and cannot own files — a single app-owned root
folder is not viable. Prerequisite: Workspace admin grants DWD + Drive
scopes; confirm before build.

## 3. Interview decisions (binding)

| #   | Decision            | Choice                                                                                                                                                                               |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Scope               | Drive becomes **main** now; leave UploadThing code/routes as-is; delete UploadThing integration only after verification                                                              |
| 2   | Auth model          | **Service account + DWD impersonating the verified student** (v2; supersedes v1 app-owned folder — SA cannot own files)                                                              |
| 3   | Routes in scope     | **All three**: `evidenceImage`, `mugshotCapture`, `stampImage`                                                                                                                       |
| 4   | Folder layout       | **Per-student My Drive**: `ERPSYS/<academicYear>/{Evidence,Mugshot,Stamp}[/<stepCode>]` inside the owner's Drive (v2; supersedes v1 central root)                                    |
| 5   | Byte path           | **Direct browser → Google resumable session, PoC-gated** (verify CORS/expiry/interrupt from prod-like origin first; else backend-mediated fallback — §9)                             |
| 6   | Sharing             | **No per-file domain shares in v1** (v2; supersedes v1 domain-reader). Student-owned files stay private; officers read via backend proxy (§6)                                        |
| 7   | Expiry              | 24h draft sweep **deletes from Drive too** (same rule, all three routes)                                                                                                             |
| 8   | Legacy files        | Existing UploadThing `fileUrl/fileKey` rows untouched; no backfill                                                                                                                   |
| 9   | Limits              | **Relax**: JPEG/PNG/WebP **+ PDF**, ~10MB max (exact cap TBD §7)                                                                                                                     |
| 10  | Paste-link tab      | **Keep both**: upload-to-Drive tab + paste-a-Drive-link tab                                                                                                                          |
| 11  | Failure mode        | **Auto-fallback to UploadThing** on Drive session/upload error                                                                                                                       |
| 12  | Folder provisioning | **Lazy on upload**: server find-or-create chain at session-mint time, cache folder IDs in Mongo                                                                                      |
| 13  | Preview             | **Backend-mediated via ERPSYS** (v2; supersedes v1 direct `webViewLink`). Officer opens authorized endpoint; server fetches as owner/delegate and streams. No public or domain links |
| 14  | Secrets             | `.env` vars (`GOOGLE_SA_*`), same pattern as other secrets                                                                                                                           |
| 15  | Verification        | **Manual E2E** in dev (evidence + mugshot), no automated gate required                                                                                                               |

## 4. Proposed architecture (not yet approved for build)

1. `POST /api/v1/drive/session` (session-guarded, per-route surface check
   mirroring `uploadthing.ts:10-22`): input `{ route, stepCode?, mime, size }`
   — **no client `studentId`/owner email accepted**. Server derives owner
   strictly from session → student record → verified school Google address
   (`...@student.buksu.edu.ph`; officers uploading mugshot/stamp act on a
   named student context resolved server-side). Server validates
   type/size/step-ownership, impersonates the owner via DWD, resolves
   folder chain (`ERPSYS → year → category[/step]`), inserts a **pending**
   `upload` doc with `idempotencyKey` (fixes orphan leak: row exists
   _before_ bytes land), returns resumable-session URL + `uploadId`.
   Session URL treated as secret: never logged, single file. Google may
   keep the session URI valid up to a week — ERPSYS does NOT rely on that:
   server enforces its own pending deadline equal to the 24h draft rule
   (`sessionExpiresAt`), after which the pending row is unusable and the
   reaper cleans it, even if Google's session is still technically alive.
2. Browser `PUT`s bytes straight to Google (resumable protocol, chunked,
   progress callback reuses current progress UI). **PoC gate**: prove
   browser→Drive works from a prod-like origin (CORS, expiry, interrupt/
   resume) before committing; if blocked, switch to backend-mediated
   upload with identical session/complete API. On completion browser calls
   `POST /api/v1/drive/complete { uploadId, driveFileId }` — **idempotent**
   (safe to retry; keyed on `uploadId` + `driveFileId`). Server impersonates
   owner, `files.get` verifies size/mime/parent, stores
   `fileKey = drive:<ownerEmail>:<fileId>`, `fileUrl = null` (no direct link
   persisted; preview is proxied), keeps 24h `expiresAt` until submission.
3. Fallback is **reconcile-first, never blind**: on session/upload error
   the client must first query Drive session status (via server) and the
   pending row. If Drive already received the bytes, finish `/complete`
   instead of falling back. Only when the Drive attempt is confirmed
   failed or safely abandoned (pending row marked `abandoned`) may the
   client use the existing `useUploadThing` route. Exactly one backend
   finalizes a given `uploadId` — no duplicates.
4. Sweep (`draft-evidence.ts`): partition by `fileKey` prefix —
   `drive:*` → impersonate owner → `drive.files.delete`, else
   `utapi.deleteFiles`. Retry-on-next-sweep preserved, plus **reaper for
   abandoned pending sessions** (minted, never completed) and **reconciler
   for Drive-orphans** (bytes in Drive, no finalized Mongo row — list by
   folder/appProperties and delete or adopt). `EXTERNAL_LINK` still byte-less.
5. Paste-link tab unchanged (still `EXTERNAL_LINK`), no Drive validation
   in v1 — server stores the URL string as today.
6. Preview/download: `GET /api/v1/uploads/:id/content` (and thumb variant),
   guarded by officer/student ownership checks; server impersonates owner
   and streams bytes (Range support). No `webViewLink` exposed.

## 5. Data model (additive, no migration)

- `upload` doc gains: `backend: "drive" | "uploadthing"`,
  `driveFileId`, `driveFolderId`, `driveOwner` (school email),
  `idempotencyKey`, `sessionExpiresAt` (nullable for legacy rows).
- `fileKey` convention: `drive:<ownerEmail>:<fileId>` vs existing
  keys vs `external:<step>:<url>`.
- New `driveFolder` cache: `{ ownerEmail, academicYearId, category,
stepCode, folderId }` to avoid repeated `files.list` on session mint.
- Never persist resumable session URLs. `fileUrl` stays null for Drive
  rows (preview is proxied); legacy UploadThing/`EXTERNAL_LINK` rows
  keep their URLs.

## 6. Permissions / security

- Service-account key + DWD subject selection never leave server; browser
  only sees a single-file resumable session URL (never logged/stored).
- **Owner binding**: impersonated subject is derived server-side from the
  ERPSYS session → student record → school email. Reject any request whose
  step/student context does not belong to that owner. DWD scope is powerful
  — a student must never be able to nominate another student's email.
- **No per-file shares in v1**: no `anyone`/`domain` reader grants.
  Files stay private to the student owner; officers read through the
  authorized proxy endpoint (§4.6), which enforces officer/student
  authorization per request.
- Keep existing surface guards (`requireSurface("student"|"officer")`)
  on session-mint, complete, content, and delete paths.
- Quota/retention risks of student ownership (accepted): uploads consume
  the student's quota; disabled/graduated accounts endanger retention —
  needs a school retention/export policy before relying on this for
  official records (§9).

## 7. Limits (needs final number)

- Interview: images + PDF, ~10MB. Recommendation: evidence/mugshot 10MB,
  stamp 5MB (stamp was 2MB; scans rarely need more). Confirm before build.
- Client `ACCEPT` becomes `image/jpeg,image/png,image/webp,application/pdf`;
  PDF rows render a file-chip instead of `<img>` thumbnail (new UI state).
- Nginx `client_max_body_size` irrelevant for direct-to-Google path
  (bytes bypass Express), but keep session-mint body tiny.

## 8. Ops

- New env: `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY` (\\n-escaped),
  `GOOGLE_DWD_ADMIN_SUBJECT` (bootstrap impersonator, if needed),
  `GOOGLE_DRIVE_DOMAIN="buksu.edu.ph"`. No root-folder ID (per-owner
  My Drive). Follow `lib/platform/env.ts` pattern; add to
  `docs/ops/deployment.md` table + production boot check.
- Workspace admin prerequisite: **GRANTED (confirmed 2026-10-14)** — admin
  authorizes the SA client ID via DWD. **Least-privilege first**: request
  `drive.file` only; PoC must prove create, upload, read, delete, and
  folder ops on `drive.file` before any broader scope is requested.
  `drive.file` covers only app-created/opened files; `drive.readonly`
  (restricted scope, reads everything the user can see) is a last resort.
  Still to confirm: student account storage policy and what happens on
  disable/graduation. Verify the real client ID + scopes against a
  dedicated student test account — the grant statement alone is not proof.
- New dep `googleapis` in `apps/server` only (never import from web;
  web keeps using `@erpsys/server` type surface + new endpoints).
- Observability: log session-mint/complete/delete/reconcile with
  `driveOwner` + `driveFileId` (never session URLs); metrics labels for
  the new endpoints; alert on failed Drive deletes and reconciler orphans.
- Abuse control: rate-limit session-mint per user/min (reuse existing
  limiter); `POST /complete` enforces size/mime match to block quota-fill.

## 9. Open questions for build plan

1. Exact byte caps per route (10MB/10MB/5MB?).
2. DWD granted — remaining: scopes (`drive.file` sufficient, or broader
   needed for folder search/delete)? Student quota policy? SA client ID
   registered in Admin console (Security → Access and data control → API
   controls → Domain-wide delegation)?
3. Folder naming when `stepCode` absent (stamp/mugshot) — `Evidence|Mugshot|Stamp` categories (proposed §2); confirm.
4. Browser→Drive PoC result from prod-like origin (CORS/expiry/resume)?
   If blocked: backend-mediated upload design.
5. Reaper interval for abandoned pending sessions + reconciler cadence for
   Drive-orphans (bytes without Mongo row)?
6. Offline/campus-network resumable-chunk size.
7. Retention/export policy for submitted/verified rows when student
   accounts are disabled (school-owned archive? Shared-Drive mirror?).

## 10. Verification (manual E2E, per interview)

0. PoC first: one JPG + one PDF browser→Drive into a test student account;
   officer opens via proxy; unauthorized user gets 403; expired draft is
   deleted from Drive.
1. Boot with SA+DWD env, mint session as student, upload JPG + PDF, submit
   step, open as officer via proxy endpoint (school account).
2. Repeat mugshot/stamp; check `ERPSYS/<year>/...` chain in the owner's
   My Drive (student view) — officers check via ERPSYS only.
3. Kill browser mid-upload → pending row exists; idempotent retry of
   `/complete` converges; sweep + reaper expire and delete from Drive at 24h.
4. Break Drive (revoke scope) → fallback to UploadThing, exactly one
   backend finalizes.
5. Existing UploadThing + EXTERNAL_LINK rows still render.

| ID    | PoC gate                                    | Status | Steps                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a2827 | Browser→Drive JPG+PDF from prod-like origin | TODO   | 1. Boot prod-like origin with SA+DWD env. 2. As dedicated student test account, mint `POST /api/v1/drive/session` for one JPG and one PDF. 3. `PUT` bytes direct to the session URLs (resumable, 1 MiB chunks). 4. `POST /api/v1/drive/complete`, submit, open as officer via `GET /api/v1/uploads/:id/content` (200). 5. Unauthorized user gets 403. 6. Expired draft deleted from Drive. |

## 11. Explicit non-goals (v1)

- No backfill of UploadThing → Drive.
- No OAuth "save to my Drive".
- No removal of UploadThing code (separate cleanup PR after sign-off).
- No change to `EXTERNAL_LINK` validation.
- (Removed: "no server-proxied preview" — contradicts §4.6. Backend
  proxy preview is IN scope, with auth checks, content-type handling,
  and safe download headers.)

## 12. Build notes (locked decisions, 2026-10-14)

- Byte caps: evidence 10MB, mugshot 10MB, stamp 5MB.
- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`,
  `application/pdf`.
- Resumable upload chunk size: 1 MiB.
- Folder layout: `ERPSYS/<academicYear>/{Evidence,Mugshot,Stamp}[/<stepCode>]`
  in the owner's My Drive (stepCode segment only where a step applies).
- Drive sweep interval: 15 min (abandoned pending-session reaper +
  Drive-orphan reconciler, alongside the existing 24h draft rule).
- Scopes: `drive.file` first; `drive.readonly` only as last resort.
- DWD subject default: `GOOGLE_DWD_ADMIN_SUBJECT=admin@buksu.edu.ph`
  (folder provisioning only; per-upload owner derives from session).
