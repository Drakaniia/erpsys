# Student Evidence Alternative — File Upload Fallback Spec

**Status:** Draft — interview complete (2026-09-07)
**Author:** OpenCode interview
**Related:** `docs/todo.md:2` (“alternative to file upload”), `docs/open_questions.md:27` (“add another option in file upload in step 2-5 (external link), as fallback”), `docs/spec/student-page-spec.md` §6, `apps/web/src/components/student/EvidenceSlot.svelte`, `packages/api/src/routers/student/evidence/*`, `packages/api/src/uploadthing.ts`, `packages/db/prisma/schema/domain.prisma`

---

## 1. Summary

Add **two fallback evidence paths** to the student-facing steps that currently require an UploadThing file upload via `EvidenceSlot`:

1. **External share-link** (Google Drive or `storage.to`) — available on **all steps 2–5** (SOCIAL_MEDIA, PROFILING, MUGSHOT, CONSENT).
2. **On-device camera capture** (Capture → Preview → Retake → Use) — available only on **steps 4 (MUGSHOT) and 5 (CONSENT)** where a photo of a physical document/person matters.

Both are **additive**: a student may submit with files only, link only, camera capture only, or any combination (e.g., one file + one link). A single external link per step is allowed. A valid link alone satisfies “Submit for review” (no file required). The UI is a **tabbed EvidenceSlot** (`Upload file | Paste link | Camera`), matching Svelte 5 + mobile-first constraints. Officer verification stays a **simple clickable link** (new-tab), no embed.

> Original request was truncated as “file upload alternative... in student [age”. Interview confirms this is the `open_questions.md:27` external-link fallback + mugshot-camera parity with the SBO officer flow (`apps/web/src/components/officer/WebcamCapture.svelte`).

---

## 2. Goals / Non-goals

### Goals

- Unblock students who cannot upload directly (large files, slow connection, storage limits) by letting them upload elsewhere and paste a share link.
- Bring student mugshot / consent capture to parity with the officer’s `WebcamCapture.svelte` (1280×960 JPEG, Capture/Retake).
- Keep officer workload low: link shown as a clickable row with domain badge; verified the same way as an image.
- Preserve existing guarantees: `VERIFIED` is immutable, `SUBMITTED`/`RETURNED` flows unchanged, `evidenceCount` stays accurate.

### Non-goals

- Replacing UploadThing — file upload remains primary.
- Supporting arbitrary file hosts, Facebook/Instagram links, or `buksu.edu.ph` links in v1 (allowlist is Drive + storage.to only).
- Embedding/unfurling external content or proxying downloads.
- Changing `ASSESSMENT` (step 1) or `ENROLLMENT` (step 6) flows.
- Admin-configurable per-step toggles in v1 (all-or-nothing by the split in §3).

---

## 3. Scope & Step Matrix

| Step | Code           | Current evidence                          | v1 Alternatives                   | Notes                                              |
| ---- | -------------- | ----------------------------------------- | --------------------------------- | -------------------------------------------------- |
| 2    | `SOCIAL_MEDIA` | `EvidenceSlot` (file)                     | **file + external link**          | No camera                                          |
| 3    | `PROFILING`    | `EvidenceSlot` (file) + `GoogleFormPanel` | **file + external link**          | Link supplements screenshot of “response recorded” |
| 4    | `MUGSHOT`      | `EvidenceSlot` (file)                     | **file + external link + camera** | Camera = primary student-side capture              |
| 5    | `CONSENT`      | `EvidenceSlot` (file, `multiple=true`)    | **file + external link + camera** | Camera useful for photographing signed papers      |

- File limit stays **4 MB** (`EvidenceSlot.svelte:35`, `uploadthing.ts:38`).
- External link: **at most 1 per StepVerification** (student can Add / Replace / Remove until `VERIFIED`).
- Camera capture in 4/5 **stores as file evidence** (regular `evidenceImage` UploadThing flow), not as a link — matches interview answer “Store as file evidence”. That means the captured frame is compressed to `image/jpeg` and `startUpload`’d, producing a normal `Upload` record.

---

## 4. Data Model

### Option A (preferred, minimal migration) — reuse `Upload`

Add a new `UploadKind` value and convention:

```prisma
enum UploadKind {
  MUGSHOT
  SOCIAL_SCREENSHOT
  CONSENT_SCAN
  PROFILING_SCREENSHOT
  EXTERNAL_LINK        // ← new
}
```

An external link is an `Upload` row with:

- `kind = EXTERNAL_LINK`
- `fileUrl = <the share link>` (validated URL, max 1000 chars)
- `fileKey = ""` or `"external:<domain>:<hash>"` (empty string not ideal for required field; use sentinel `external-<uuid>`; no `utapi.delete` call for these rows on delete)
- `uploadedById` / `studentProfileId` same as file uploads

`StepVerification.evidence = { uploadIds: string[] }` already supports heterogeneous kinds; no schema change to `StepVerification` needed. `evidenceCount` counts links too. Officer `resolveUploads` already returns all kinds — UI branches on `kind`.

**Delete path:** `deleteEvidence` currently calls `utapi.deleteFiles(fileKey)` and deletes the `Upload` row. For `EXTERNAL_LINK`, skip `utapi` and just unlink/delete the row.

### Option B — separate column on `StepVerification`

```prisma
model StepVerification {
  externalLink       String?   // validated URL
  externalLinkDomain String?   // derived host for badge
}
```

`evidenceCount` would become “uploads + (externalLink ? 1 : 0)” and officer queries would need a second field. More code, no benefit if links are single and heterogeneous. **Defer unless team prefers a strict “fileKey must be real” invariant.**

Interview answer: “Either is fine” — spec recommends **Option A** for zero extra indexes and uniform `uploadIds` handling.

If Option A is chosen, guard against `fileKey` emptiness with a DB-level check or Zod sentinel; do not relax the existing `fileKey` length validation for non-link kinds.

---

## 5. API & Validation

### 5.1 New procedures (in `packages/api/src/routers/student/evidence/`)

```
upsertExternalLink  — studentProcedure
  input: { stepCode: UploadStepCodeSchema, url: z.string().url().max(1000) }
  output: { evidence: evidenceSchema, link: { id, fileUrl, kind: "EXTERNAL_LINK" } | null }
  errors: PRECONDITION_FAILED (no year/profile), CONFLICT (VERIFIED), BAD_REQUEST (domain not allowlisted / invalid url)

removeExternalLink  — studentProcedure
  input: { stepCode: UploadStepCodeSchema }  // or { uploadId } if using Upload rows
  output: { evidence: evidenceSchema }

captureEvidence     — reuse uploadEvidence (no new route)
  // camera flow calls startUpload(fileFromDataUrl) then uploadEvidence
```

If Option A is used, `upsertExternalLink` internally creates/updates an `Upload` with `kind=EXTERNAL_LINK`; subsequent `uploadEvidence`/`deleteEvidence` remain unchanged. Rate-limit link upserts (e.g., 10/min per student — see `docs/spec/rate-limiting-spec.md`).

### 5.2 Domain Allowlist

Validate `new URL(url).hostname` (lower-cased, strip `www.`):

- `drive.google.com` (covers `https://drive.google.com/file/d/...` and `https://drive.google.com/open?id=...`)
- `storage.to` (and `*.storage.to` if subdomains are used)

Error message (inline, blocking): **“Only Google Drive and storage.to links allowed.”** (`§7`).

No reachability check in v1 (interview: no ping). URL must be `https:`.

### 5.3 Lifecycle & Guards

- Can **add / replace / remove** the link while `StepVerification.status ∈ { PENDING, RETURNED, SUBMITTED }` — i.e., **editable until VERIFIED**, matching interview “Editable until verified”. `VERIFIED` returns `CONFLICT` (“This step is already verified.”) same as file path (`upload-evidence.ts:43`).
- `SUBMITTED` stays submitted after link upsert; if status was `RETURNED`, flip to `SUBMITTED` (same conditional-write pattern as `upload-evidence.ts:72`, with `M7` `updateMany({ status: { not: "VERIFIED"}})` guard and rollback on race).
- Single-link invariant: upsert replaces existing link for that `(studentProfileId, stepId, academicYearId)` — old link row is deleted/unlinked.

### 5.4 Officer read path

- `officer/getStepDetail` and `officer/listByStep` already call `evidenceUploadIds` + `resolveUploads`. No change except UI branching.
- Officer verification (`verifyStep` / `revoke`) unchanged — a step with only a link verifies the same as with files. `evidenceCount` must reflect link presence so `getOverview` counts remain correct.

---

## 6. Frontend — Student

### 6.1 EvidenceSlot tabs (interview: “Tabs within slot”)

Refactor `apps/web/src/components/student/EvidenceSlot.svelte` (and callers `EvidenceSheet.svelte`, `ProfilingSheet.svelte`) to:

```
┌─────────────────────────────────────────┐
│ [ Upload file | Paste link | Camera ]*  │  ← segmented control, aria-tablist
├─────────────────────────────────────────┤
│ Tab: Upload file  → current file picker │  (existing input, progress, preview, retry)
│ Tab: Paste link   → URL input + Add/    │  (single link, domain badge, Remove)
│                     Update / Remove     │
│ Tab: Camera       → live preview →      │  (only steps 4 & 5; mirrors WebcamCapture)
│                     Capture / Retake /  │
│                     Use photo            │
│ Evidence row (below tabs): thumbnails + │  (mixed: image tiles + link chip)
│ link chip with domain + remove ×        │
│ Submit for review (enabled if           │  (files.length + link ? 1:0 > 0)
│  files.length >0 OR link != null)       │
└─────────────────────────────────────────┘
* Camera tab hidden for steps 2–3.
```

- `multiple` prop still respected for files; link is always single.
- Mobile: tabs are full-width segmented control; content stacks. Desktop: keep sticky submit pattern (`ProfilingSheet.svelte:94`).
- URL input: `type="url"` + `inputmode="url"`, `placeholder="https://drive.google.com/... or https://storage.to/..."`, with inline error for allowlist / format.
- After adding link, show a **link chip** (domain badge + truncated URL + remove `×`) in the evidence row alongside thumbnails. Link is not shown in `EvidenceLightbox` — it’s a separate element.
- Camera tab reuses `WebcamCapture.svelte` (or a student variant). Captured `dataUrl` → `fetch(dataUrl).blob()` → `File("mugshot.jpg","image/jpeg")` → `startUpload([file])` → `uploadEvidence`. Between capture and upload the preview is the `dataUrl` (same as officer’s `captured` state). Compression quality `0.85`, capped 1280×960 (same as officer `WebcamCapture.svelte:65`).

### 6.2 Camera fallback (interview: “Show fallback + keep file picker”)

- If `!navigator.mediaDevices?.getUserMedia` or permission denied, camera tab shows:
  > “Camera unavailable — use file upload or paste a link instead.”
  > with a button to switch to the Upload file tab.
- File picker stays visible/usable regardless (the tabs design guarantees this). Only steps 4–5 have the camera tab, so other steps are unaffected.

### 6.3 Validation & Errors

- Allowlist failure: inline under input, `"Only Google Drive and storage.to links allowed."` — blocks Add/Update (interview: “Block inline”).
- Invalid URL format: `"Enter a valid https:// link."`
- Network/race errors: reuse existing `notify` + retry pattern (`EvidenceSheet.svelte:49` keeps `pendingUpload` for retry); for links, preserve the typed URL on failure.
- Submit button disabled until `(files.length + (link ? 1 : 0)) > 0` and `!locked` and no pending upload.

### 6.4 State & Roles

- Update `packages/api/src/routers/student/schemas.ts` or shared `UploadKind` import to accept `EXTERNAL_LINK`.
- Update `apps/web/src/lib/student/types.ts` `StepRow` evidence shape to include `{ id, fileUrl, kind }` where `kind` can be `EXTERNAL_LINK`; add derived `externalLinkUpload = step.evidence.find(e => e.kind === "EXTERNAL_LINK")`.

---

## 7. Frontend — Officer

- In `DetailSheet` / step-detail evidence section:
  - Render **image thumbnails** as before (lightbox on click).
  - If an `EXTERNAL_LINK` evidence exists, render a **Link row** above/beside thumbnails: domain badge (`drive.google.com` or `storage.to`), full URL (truncated with `title` = full), “Open” button (`target="_blank" rel="noopener noreferrer"`), and `rel` warning not needed beyond `noopener`. Interview: “Simple clickable link”.
  - Link opens in new tab — no warning dialog in v1.
  - Verification actions (`Stamp as verified`, `Send back`) treat link-only steps identically to file steps.

---

## 8. Verification & Read-back

- `SubmittedNotice.svelte` should render the link chip alongside any thumbnails (read-only after submit, but editable until verified per §5.3 — link edit in submitted state re-enables the submit? Actually `SUBMITTED` with an edit keeps status `SUBMITTED` until officer re-reviews; if spec wants “editable until verified”, submitted students can still edit links — this matches file UX where `EvidenceSlot` is still interactive before `VERIFIED`). Confirm with product: whether post-submit link edit should stay `SUBMITTED` or revert to `PENDING`. Spec recommends **stay `SUBMITTED`** (same as files: you can replace evidence while pending review).
- Lightbox ignores links (only images).

---

## 9. Edge Cases

| Case                                                              | Handling                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student pastes `http://` Drive link                               | Reject — require `https:`                                                                                                                          |
| Student pastes `https://drive.google.com/...` but file is private | Allow save; officer sees link, may `Send back` with “Link not accessible” chip                                                                     |
| Student adds link then immediately files `VERIFIED` race          | `updateMany({ not: VERIFIED })` guard rolls back link row (same as `upload-evidence.ts:77`)                                                        |
| Student deletes link, then has zero evidence                      | `evidenceCount` drops to `files.length`; submit button disables; `StepStatus` stays `SUBMITTED` until officer returns or student adds new evidence |
| Camera stream fails mid-capture                                   | Show fallback message; stop tracks; keep file/link tabs                                                                                            |
| Multiple tabs open                                                | Last write wins; `uploadIds` deduped via `Set` in `resolveUploads`                                                                                 |
| Officer revokes `VERIFIED`                                        | Student can re-add/replace link (status becomes `RETURNED`) — same as file revoke flow                                                             |

---

## 10. Security & Abuse

- Student-only middleware for link upsert (same as `evidenceImage` route — `requireRole(req, { STUDENT:true })`).
- Zod `z.string().url().max(1000)` + hostname allowlist prevents `javascript:` or data URLs.
- Rate-limit: reuse existing student evidence rate limiter (extend to link procedures).
- No server-side fetch of external URLs in v1 → no SSRF.
- Officer link clicks are client-side only.

---

## 11. Alternatives Considered

- **Replace UploadThing with storage.to** — rejected; external link is fallback only, not primary storage.
- **Store link as `StepVerification.externalLink`** — slightly stricter DB guarantee (fileKey always real) but splits evidence into two stores; deferred (Option B).
- **Camera uploads to a separate `mugshotCapture` route** — interview chose “Store as file evidence” (reuse `evidenceImage`) to keep claim checks uniform and officer UX identical.

---

## 12. Implementation Sketch (for planner)

1. Prisma: add `EXTERNAL_LINK` to `UploadKind` (domain.prisma), `bun run db:push` + `db:generate`.
2. API: add `upsertExternalLink` / `removeExternalLink` procedures; update `evidence` helpers to skip `utapi.delete` for link kinds.
3. API: export new router entries in `packages/api/src/routers/student/index.ts` and wire `step-detail` to return link.
4. Web: refactor `EvidenceSlot.svelte` to tabs (props add `stepCode`, `externalLink`, `onUpsertLink`, `onRemoveLink`, `cameraEnabled`); reuse `WebcamCapture.svelte` for camera tab; cover reduced-motion.
5. Web: update `EvidenceSheet.svelte` & `ProfilingSheet.svelte` to call link mutations and pass `cameraEnabled = code in [MUGSHOT, CONSENT]`.
6. Web: update officer `DetailSheet` evidence section to render link row.
7. Tests/typecheck: `bun run check-types`, `bun run lint`, manual mobile camera + Drive link flows.

---

## 13. Open Questions (post-interview, low-priority)

- Should `storage.to` also include `https://store.storage.to/...` or other mirrors? Confirm exact host list.
- Should a pasted Drive link be normalized (e.g., convert `open?id=` to `file/d/` form) or stored verbatim?
- After a `SUBMITTED` student edits their link, should we auto-notify the officer (bell badge) immediately or on next poll?
- Do we need an admin toggle to disable the link fallback per academic year?

---

## 14. Interview Answers (raw)

- Alternative = camera for mugshot (like SBO officer) + external link via `storage.to` / Drive share link.
- All steps 2–5 get external link; camera only in steps 4 & 5.
- Both file and link allowed together; single link per step.
- Officer sees simple clickable link (new tab).
- Camera flow = Capture + retake (mirrors officer), stored as file evidence via `evidenceImage`.
- Tabs within slot UX.
- Allowlist = `drive.google.com` and `storage.to` only; block inline with message.
- Link editable until `VERIFIED`; either DB storage option acceptable.
- Link alone satisfies submit; officer evidence shows link alongside images.
