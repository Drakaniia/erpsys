# ERPSYS Follow-ups — Specification

**Status:** ✅ **Implemented 2026-08-22** (browser-verified) — originally "Draft for review (compiled from interviews, 2026-08-22)".
**Scope:** Five change areas on the existing ERPSYS surfaces in `apps/web`
(SvelteKit + Svelte 5 + Tailwind v4) and `packages/api`/`packages/db`
(Prisma + MongoDB):

1. Seed + identity — student numbers (10-digit institutional, 3–24 general)
2. Instructor enrollment stamping — **confirmed already implemented**, locked in
3. Student **queue page** (new) — department pick + live position indicator
4. Social-media links management (SBO officer) + student step-2 rendering
5. Evidence submission confirmation (steps 2–5) — "Submit for review" + Pending-review state

**Companion docs:** `design.md` (Apple-style motion/materials baseline — normative where referenced),
`docs/spec/student-page-spec.md`, `docs/spec/sbo-officers-page-spec.md`,
`docs/spec/instructor-page-spec.md`, `docs/spec/erpsys-spec.md`,
`docs/open_questions.md`, `docs/readme.md`.
**Author:** Design interview synthesis (5 interview rounds, 2026-08-22)

---

## 1. Overview

Five follow-up requests from the student/instructor demo review, in priority
order of impact:

| #   | Request                                                                                       | Decision                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Seed `@student.buksu.edu.ph` accounts with 10-digit numbers (`2401117979@…`)                  | Numeric @student accounts get 10-digit local-part numbers; name-style and outside-org accounts get independent 10-digit numbers; stored-number validation centralized on a shared 3–24 pattern (amended 2026-09-05, §2) so non-institutional IDs are not locked out |
| 2   | "Final instructor marks the queue done + stamps step 6 so the student is officially enrolled" | **Already implemented** in `completeEnrollment` (one atomic action: queue `COMPLETED` + step-6 `VERIFIED` by instructor). Spec documents and verifies; no code change unless verification finds a gap                                                               |
| 3   | Is the queue live without refresh? Is there a queue-number indicator?                         | 20s polling **is** live-enough (confirmed). New **`/queue` page** (replaces the step-6 bottom sheet): pick department → see live Open/Closed + waiting count + instructor name → after joining, a large position card + live status strip                           |
| 4   | SBO officer settings to add/edit BukSU FB links for step 2                                    | New **"Social Media Links"** officer tab; **global** (not per-year) list; fields = page name + URL; student step 2 renders clickable links + "like and follow ALL pages" note                                                                                       |
| 5   | Step 2 upload has no confirmation; student can't tell they're pending review                  | Upload becomes a draft (invisible to officers) → **"Submit for review"** → **"Pending review"** chip (navy) for steps 2, 3, 4, 5; re-upload after Returned auto re-submits                                                                                          |

---

## 2. Change 1 — Seed & identity: student numbers

> **Amended 2026-09-05.** The original 10-digit-only rule below locked out
> non-institutional (outside-org) students whose IDs are shorter or
> alphanumeric, so validation was centralized on a shared 3–24 pattern
> (`STUDENT_NUMBER_PATTERN`, `packages/db/src/constants.ts`, audit M7) and the
> seed roster was revised to drop the superseded `2401117979–81` accounts.
> Implementation is authoritative; the code pointers here match the tree.

### 2.1 Seed data (amended 2026-09-05 — `packages/api/src/seed/users.ts`)

| Student        | Email                                            | Stored number |
| -------------- | ------------------------------------------------ | ------------- |
| Student User   | `2401117078@student.buksu.edu.ph`                | `2401117078`  |
| Juan Dela Cruz | `juan.delacruz@student.buksu.edu.ph` (unchanged) | `2401117982`  |
| Maria Santos   | `maria.santos@student.buksu.edu.ph` (unchanged)  | `2401117983`  |
| Pedro Reyes    | `pedro.reyes@student.buksu.edu.ph` (unchanged)   | `2401117984`  |
| Sam Outside    | `outside.user@gmail.com` (unchanged)             | `2401117985`  |

Plus non-student seed accounts: `admin@buksu.edu.ph` (ADMIN), `adviser@buksu.edu.ph`
(ENROLLMENT_ADVISER, mapped to BSIT + BSEMC), and `officer@student.buksu.edu.ph`
(SBO_OFFICER with stamp configured).

- The numeric account's stored number **equals its email local-part** —
  consistent with `resolveProfile` auto-derivation at sign-in, so a re-login
  never drifts from the seeded profile.
- Name-style and outside-org accounts keep their emails (deliberate demo
  variety: both login formats work); their numbers are independent values
  (real-world: entered via the manual student-number prompt).
- The original Ana Lopez / Carlos Mendoza / Liza Garcia accounts
  (`2401117979`–`2401117981@…`) were superseded by `2401117078 "Student User"`;
  the seed deletes the old rows on re-run.
- The demo states keep their shape: Student User (fully verified) waiting in
  BSIT, Pedro waiting in BSEMC (closed), Maria enrolled (COMPLETED queue +
  step-6 stamp by adviser), Sam outside with a RETURNED step.

### 2.2 Student-number validation (amended 2026-09-05)

One canonical format shared by every write path — `STUDENT_NUMBER_PATTERN`
(`packages/db/src/constants.ts`): `/^[0-9A-Za-z-]{3,24}$/`. A BukSU ID (10
numeric digits) is a subset.

- **`resolveProfile`** (`packages/api/src/routers/student/helpers/profile.ts`):
  auto-derives a profile only when the `@student.buksu.edu.ph` local-part is
  exactly 10 digits (`/^\d{10}$/`). Anything else → `null` (falls to the
  manual student-number prompt), matching the name-style seed accounts'
  behavior.
- **`saveStudentNumber`**, the signup plugin (`packages/auth/src/student-signup.ts`),
  and the client forms (`StudentNumberPrompt.svelte`, `RegisterCard.svelte`):
  trim + validate against `STUDENT_NUMBER_PATTERN` (3–24 letters/digits/
  dashes, inline error "Only letters, numbers, and dashes are allowed").
- **Schema note:** no Prisma change needed — `studentNumber` is already
  `String @unique`; validation is at the write/derive points above.
  Existing rows with other formats are not migrated (dev DB only; reseed).

---

## 3. Change 2 — Instructor enrollment stamping (confirm, don't build)

**Already in code:** `completeEnrollment` (`packages/api/src/routers/instructor.ts`)
atomically (a) marks the queue entry `COMPLETED` (`servedById`, `completedAt`)
and (b) upserts the step-6 `StepVerification` as `VERIFIED`
(`verifiedById` = instructor, `verifiedAt` = now) — the official enrollment
record — plus an `ENROLLED` notification. Idempotent (double-click/colleague
race → `outcome: "already"`). The student side fires the confetti success
screen on the WAITING/IN_PROGRESS → COMPLETED transition
(`+page.svelte` `$effect`), and the step-6 sheet shows the instructor stamp
("Enrolled by `<name>`").

**This spec's only asks:**

- Keep the behavior exactly as implemented; the demo seed (Liza) already
  exercises it end-to-end.
- No instructor-page history in v1 (confirmed — completed entries leave the
  list; audit trail stays server-side).
- Verification checklist (§8) must re-confirm the flow against a live serve.

---

## 4. Change 3 — Student queue page (`/queue`)

### 4.1 Rationale (interview finding)

The queue number indicator "should be in a new page, because they have to
choose first what department and see if there's an instructor active for
queueing based on that specific department." The step-6 bottom sheet is
replaced by a **dedicated route** for queueing — the department pick and the
live position both live there.

### 4.2 Route & entry

- New route **`/queue`** (`apps/web/src/routes/(app)/queue/+page.svelte`),
  `STUDENT`-guarded like `/dashboard`; back affordance returns to
  `/dashboard` (`?tab=progress`).
- **Step-6 checklist card** tap → navigates to `/queue` (chevron stays;
  hint flips per existing `stepHint`: "You can now queue" / "Waiting in
  queue" / "Adviser is serving you" / "Enrolled").
- **All-set banner CTA** ("Join the queue") → `/queue`.
- `QueueSheet.svelte` is retired for step 6 (its joined/enrolled/blocked
  states move into the page; see §4.4).

### 4.3 Page anatomy

**State A — prerequisites not met:** the current blocked-state content
("You must complete first: …") with no join affordance.

**State B — ready, not queued (department pick):**

- Department cards (from `getDepartments`): name + code, **status dot** —
  Open (navy) / Closed (gray), **waiting count** ("12 waiting"), and — new —
  **instructor name when open**: "Open — Dr. Ramon Adviser"
  (`openBy: { id, name } | null` added to the API; §6).
- Live via the existing `getDepartments` 20s polling (already
  `refetchInterval: 20_000` — "always live, no refresh needed" is confirmed
  satisfied; no SSE).
- Select card → **Join queue** primary (same `joinQueue` procedure, same
  guards). Join error surface identical to today's sheet.

**State C — queued (joined):**

- **Large position card**: `#12` display-size, `tabular-nums`, navy (reuse
  the sheet's hero, per interview "large position card").
- **Live status strip** under it: `Waiting` → "We'll notify you when the
  adviser is ready." / `IN_PROGRESS` → "The adviser is serving you now." /
  `COMPLETED` → "Enrolled — you're done." + department name.
- Driven by `getMyQueueStatus` 20s polling; position updates with the
  existing spring-scale beat (student-page-spec §8).

**State D — enrolled:**

- Enrolled card + step-6 **stamp** (`StampDisplay`, verb "Enrolled by") —
  exactly the sheet's current enrolled layout.
- The confetti success screen still fires on the live COMPLETED transition —
  watched on both `/dashboard` and `/queue` (each page's effect keeps its own
  `sawCompleted` guard; only the visible page fires).

---

## 5. Change 4 — Social-media links (officer management + student step 2)

### 5.1 Data model (global, not per-year — interview decision)

```prisma
model SocialMediaLink {
  id        String   @id @map("_id")
  name      String
  url       String
  order     Int
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@map("social_media_link")
}
```

Global list across academic years — simpler than the per-year `ProfilingForm`
and the pages rarely change. (Schema-simplicity rule, AGENTS.md.)

**Seed rows** (defaults only — officers edit freely via the tab):

| Name            | URL                                          | order |
| --------------- | -------------------------------------------- | ----- |
| BSIT Department | `https://www.facebook.com/buksuitdepartment` | 1     |
| COT SBO         | `https://www.facebook.com/buksucotsbo`       | 2     |

This replaces the previous four hard-coded page names in
`EvidenceSheet.svelte` — the student sheet renders the API list, not a constant.

### 5.2 Officer surface — new "Social Media Links" tab

- `OFFICER_TABS` (`apps/web/src/lib/officer/tabs.ts`): insert
  `{ id: "social-media-links", label: "Social Media Links", stepCode: null, key: "7" }`
  after Consent (step 5); **Profiling Form shifts to key `7`** — update the
  keyboard mapping accordingly. Tab order: … Consent, Social Media Links,
  Profiling Form.
- New component `SocialMediaLinksPanel` (mirrors `ProfilingFormPanel`):
  - Empty state: "No pages listed yet." + **Add link** (inline form: name +
    URL, Save).
  - List rows: page name (link, opens in new tab), URL (muted), **up/down**
    reorder (writes `order`), **Edit** (inline, prefilled), **Remove**
    (confirm dialog — destructive per `design.md` §4 Agency).
  - Toast + shared-query-cache invalidation on every change (students see
    updates on next poll — same pattern as the Profiling Form).
- Procedures (§6): `listSocialMediaLinks`, `upsertSocialMediaLink`,
  `deleteSocialMediaLink`, `reorderSocialMediaLinks`.

### 5.3 Student step 2 sheet

- `EvidenceSheet.svelte` **drops the hard-coded `FB_PAGES` array**; renders
  `step.socialMediaLinks` (new field on the SOCIAL_MEDIA step row):
  - Each page = name + chevron, tap opens the URL in a **new tab**
    (`target="_blank" rel="noopener"`).
  - Note line above the list, data-driven by the list: **"Like and follow
    ALL pages before submitting."** (interview: all-must-like semantics).
  - Empty list → notice card "Pages not yet listed — see the SBO office."
    (mirrors the step-3 no-form state; no links, no upload block).
- Upload/submit flow is unchanged by this change (see §5.3 below for the
  submission state).

---

## 6. Change 5 — Evidence submission confirmation (steps 2–5)

### 6.1 Model: draft → submit → pending review

Interview decision: **upload then "Submit for review"**; drafts are **not
visible to officers**; applies to all evidence steps (2, 3, 4, 5); re-upload
after Returned **auto re-submits**.

- `StepStatus` gains **`SUBMITTED`** (MongoDB Prisma enum; `domain.prisma`).
  Semantics per step:
  - `PENDING` — no submission (draft uploads exist but nothing sent).
  - `SUBMITTED` — student pressed "Submit for review"; awaiting officer.
  - `RETURNED` — officer sent back (existing).
  - `VERIFIED` — stamped (existing).
  - Step 1 is untouched (its `APPLIED` stays derived from `PENDING` +
    `appliedAt`).
- **Draft = no verification row.** `uploadEvidence` stops creating a
  `StepVerification`; it records only the `Upload` row (drafts persist across
  reloads, replaceable/removable, invisible to officers). A verification row
  comes into existence **on submit**.

### 6.2 API changes (`packages/api/src/routers/student.ts`)

- **`uploadEvidence`**:
  - Creates the upload row only.
  - If a verification exists and status is `RETURNED` → flip to `SUBMITTED`
    (auto re-submit, interview decision); if `PENDING`/`SUBMITTED` → keep.
  - `VERIFIED` → `CONFLICT` (unchanged).
- **`submitEvidence`** (new): `input { stepCode: 2–5 }`.
  - Requires ≥1 upload for that profile+step kind (`KIND_FOR_STEP`);
    otherwise `PRECONDITION_FAILED` ("Upload evidence first.").
  - Upserts the verification: `status: "SUBMITTED"`, evidence = all uploads
    for the step (query by `studentProfileId` + kind), `createdAt` = now
    (officer list's `submittedAt` falls back to `createdAt` — no new column).
  - Idempotent: already `SUBMITTED` → no-op success.
- **`getMySteps`**: student status mapping adds
  `SUBMITTED` → student status `SUBMITTED`; SOCIAL_MEDIA row gains
  `socialMediaLinks` (active, ordered). `studentStatusSchema` grows to
  `["PENDING", "APPLIED", "SUBMITTED", "RETURNED", "VERIFIED"]`.
- **Officer `statusSchema`** (routers/officer.ts) also grows `SUBMITTED`
  (`listByStep`/`getStepDetail` types); the officer table chip renders
  "Pending" for it (no new officer chip — unread dot already carries the
  newness signal). `verifyStep`/`replyStep`/`revokeStamp` already operate on
  any non-`VERIFIED` row — no logic change.
- **`getDepartments`**: output rows gain `openBy: { id, name } | null`
  (first open adviser for the department) for the queue page's
  "Open — <name>" line.

### 6.3 Student UI

- **`chipFor`** (`lib/student/steps.ts`): `SUBMITTED` → `{ label: "Pending
review", classes: "bg-primary/10 text-primary" }` (navy — same family as
  Applied).
- **`stepHint`**: `SUBMITTED` → "Awaiting officer review" (steps 2–5).
- **`EvidenceSheet.svelte`**: below the evidence slot, primary action
  **"Submit for review"** — visible/enabled when the step is not verified and
  has ≥1 upload (disabled while an upload is in flight); hidden on verified
  sheets. One press, **no confirm dialog** (chip change + toast are the
  feedback beats). Returned sheets keep the reply notice + re-upload; the
  auto-resubmit happens server-side on re-upload, and the button remains as a
  manual affordance.
- Draft state (uploads, no submit yet): chip stays `Pending`, hint
  "Upload screenshot", no officer row exists — the student can walk away and
  the draft persists.
- `EVIDENCE_CONFIG` and the lightbox/delete affordances are unchanged.

---

## 7. Files changed (implementation log)

> The seed/identity rows below describe the 2026-08-22 state. The §2 amendment
> (2026-09-05) supersedes them: validation now lives in
> `packages/db/src/constants.ts` (`STUDENT_NUMBER_PATTERN`), enforced by
> `student-signup.ts` and `saveStudentNumber`; `resolveProfile` derives only
> exactly-10-digit institutional local-parts.

| File                                                           | Change                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema/domain.prisma`                      | +`SUBMITTED` in `StepStatus`; +`SocialMediaLink` model                                                                                                                                                                      |
| `packages/api/src/seed.ts`                                     | 10-digit emails/numbers (§2.1) + retires superseded name-style accounts; +social-media-link seed rows; keep demo states                                                                                                     |
| `packages/api/src/routers/student.ts`                          | `resolveProfile` `/^\d{10}$/`; `saveStudentNumber` `^\d{10}$`; `uploadEvidence` draft-only + RETURNED→SUBMITTED auto-resubmit; +`submitEvidence`; `getMySteps` (SUBMITTED + `socialMediaLinks`); `getDepartments` +`openBy` |
| `packages/api/src/routers/officer.ts`                          | `statusSchema` +`SUBMITTED`; +`listSocialMediaLinks`/`upsertSocialMediaLink`/`deleteSocialMediaLink`/`reorderSocialMediaLinks`                                                                                              |
| `apps/web/src/routes/(app)/queue/+page.svelte`                 | **new** queue page (§4); derived state declared before the departments query (TDZ)                                                                                                                                          |
| `apps/web/src/routes/(app)/student/+page.svelte`               | step-6 card + banner → navigate `/queue`; QueueSheet branch removed                                                                                                                                                         |
| `apps/web/src/components/student/EvidenceSheet.svelte`         | links list from API (§5.3); Submit for review button; `FB_PAGES` constant dropped                                                                                                                                           |
| `apps/web/src/components/student/ProfilingSheet.svelte`        | same submit button for step 3                                                                                                                                                                                               |
| `apps/web/src/components/student/StudentNumberPrompt.svelte`   | student-number client validation (3–24 via `STUDENT_NUMBER_PATTERN`; amended 2026-09-05)                                                                                                                                    |
| `apps/web/src/components/student/DepartmentQueue.svelte`       | types from API; renders `Open — <adviser name>`                                                                                                                                                                             |
| `apps/web/src/components/student/QueueSheet.svelte`            | **deleted** (state moved to `/queue`)                                                                                                                                                                                       |
| `apps/web/src/lib/student/steps.ts`                            | chip "Pending review" + hint for `SUBMITTED`                                                                                                                                                                                |
| `apps/web/src/lib/officer/tabs.ts`                             | +`social-media-links` tab; Profiling Form key → `7`                                                                                                                                                                         |
| `apps/web/src/lib/officer/types.ts`                            | +`SocialMediaLinkData`                                                                                                                                                                                                      |
| `apps/web/src/components/officer/SocialMediaLinksPanel.svelte` | **new** (§5.2): add/edit/remove/up-down reorder                                                                                                                                                                             |
| `apps/web/src/components/officer/SubmissionRow.svelte`         | `SUBMITTED` chip branch (New/Pending)                                                                                                                                                                                       |
| `apps/web/src/components/officer/ShortcutsPopover.svelte`      | keys 6 = Social Media Links, 7 = Profiling Form                                                                                                                                                                             |
| `apps/web/src/routes/(app)/officer/+page.svelte`               | links query + mutations; panel branch; keyboard map; cache invalidation (`["officer"]`) after link changes                                                                                                                  |

---

## 8. Verification & review

**✅ Executed 2026-08-22 (browser, port 5173, seeded DB):**

- Sign-in as `2401117979@student.buksu.edu.ph` → checklist renders with
  `#2401117979`; steps 1–5 verified.
- Step-6 card tap → `/queue`; queued state shows position `#1` + department +
  live status strip.
- Queue entry removed → pick state shows department cards with
  `Open — Dr. Ramon Adviser`, `Closed`, and waiting counts; join works.
- Instructor `completeEnrollment` (observed via served queue entry): queue
  `COMPLETED` + step-6 stamp `VERIFIED` by the adviser, same timestamp;
  `/queue` shows "Enrolled — you're done" + "Enrolled by Dr. Ramon Adviser".
- Carlos (RETURNED step 2): sheet shows officer reply, API-rendered links
  (BSIT Department, COT SBO, SSC), "Like and follow ALL pages" note; Submit →
  chip "Pending review" + hint "Awaiting officer review"; officer list shows
  the row as New/Pending; stamping marks it VERIFIED.
- Officer "Social Media Links" tab: seeded links render; add/edit/remove/
  reorder flow works; cache invalidated after mutations.
- Seed reseeded after tests — demo state restored (2 links, Ana WAITING,
  Pedro WAITING, Liza COMPLETED, Carlos RETURNED).

**Remaining review items (unchanged from the plan):**

- Seed: reseed; confirm `2401117979@…` / `juan.delacruz@…` / `outside.user@gmail.com`
  all sign in; numbers render 10 digits; non-10-digit manual entry shows the
  inline error.
- Queue page: step-6 card opens `/queue`; department cards show
  Open/Closed + waiting count + instructor name; join → position card +
  status strip; serve via instructor → IN_PROGRESS text → Enroll → success
  screen + enrolled state + instructor stamp.
- Submit flow: upload (no officer row — check officer list), Submit →
  officer sees the row, chip "Pending review" on the student checklist;
  Returned → reply visible, re-upload auto-flips back to pending review;
  stamp → Verified.
- FB links: officer adds/edits/removes/reorders; student step 2 shows
  clickable links + all-must-like note; empty state shows the office notice.
- Instructor flow (§3): live serve of the seeded Ana (or a fresh student)
  → queue COMPLETED + step-6 stamp both land; double-click is idempotent.
- Reduced-motion pass per `design.md` §7.2 on the new page's entry motion;
  touch-target audit on the queue page (mobile-first).

---

## 9. Divergences & open questions

1. **Draft upload cleanup.** Drafts are implemented as upload rows with no
   verification (invisible to officers). Never-submitted drafts leave orphan
   `Upload` rows + UploadThing files — a cleanup job is a v2 candidate.
2. **FB link seed URLs.** **Resolved 2026-08-22** — seeded with the two real
   pages: `https://www.facebook.com/buksuitdepartment` and
   `https://www.facebook.com/buksucotsbo`; more pages can be added by officers
   via the Social Media Links tab at any time.
3. **`/queue` route naming.** **Implemented as `/queue`** (interview: "a new
   page"); step-6 card + all-set banner navigate there; QueueSheet deleted.
4. **Step-6 card position hint.** Optional v2: "Waiting in queue · #12" on
   the card (interview chose page-only indicator; not in v1).
5. **Officer submit notifications.** v1: officers see submissions via the
   existing 20s polling + bell; no new notification event type on submit.
6. **Old-format student numbers in dev DB.** Superseded by the 2026-09-05
   amendment (§2): validation now accepts 3–24 alphanumeric IDs via
   `STUDENT_NUMBER_PATTERN` at write/derive points, so legacy rows no longer
   contradict the format; pre-existing rows are still not migrated (reseed
   resets the dev DB). The seed retires the superseded 10-digit email accounts
   for a deterministic demo.

---

## 10. Notes for the implementer

- The instructor stamping change is **documentation + verification only** —
  do not rebuild `completeEnrollment`.
- Schema-simplicity rule (AGENTS.md) drove: global `SocialMediaLink` (no year
  relation), no new timestamp column for submission (officer list reuses
  `createdAt`), and draft = no verification row (no DRAFT enum value).
- Apple-design baseline (`design.md`) applies to the new queue page and the
  submit button beat: single confirmation-free press, chip color/label as the
  state change, no decorative motion.
