# SBO Officers Page — UI/UX Design Specification

**Status:** Draft for review (compiled from interviews, 2026-08-21)
**Scope:** All UI/UX decisions for the SBO Officer surface in `apps/web` (SvelteKit + Svelte 5 + Tailwind v4).
**Companion docs:** `design.md` (global Apple-style motion/materials baseline — normative where referenced), `docs/spec/erpsys-spec.md` (system spec — see §11 divergences), `docs/spec/admin-page-spec.md` (admin side — role, department, and year configuration affecting this surface), `docs/readme.md` (original request).
**Author:** Design interview synthesis

---

## 1. Overview

The SBO Officers page is where COT-SBO officers verify the 5 student steps
(Assessment, Social media, Profiling, Mugshot, Consent/Medical) and manage the
step-3 Google Form link. It is a **single desktop-first page** with top-level
tabs, built on the ERPSYS design baseline: calm, confident, Apple-style
materials and motion (§2 of `design.md`).

**Core model (critical):** the officer list is **submission-driven, not a live
queue.** A student appears on a step's list _only after completing that step's
requirements_ (uploaded evidence / applied for assessment / submitted
profiling screenshot). There is no pre-submission queue to manage. Items are
"ready for review" until stamped.

**Emotion:** calm and confident (`design.md` §4.8). The page must feel like a
precise workbench — dense but unhurried — where the stamp is the single
meaningful moment.

---

## 2. Goals & Non-Goals

### Goals

- **G1 — Fast, safe verification.** Review evidence and stamp with as few
  steps and as little mouse travel as possible, without encouraging errors.
- **G2 — Submission awareness at a glance.** Officers instantly see what's new,
  what's pending, and what's done (tab badges, unread dots, bell count).
- **G3 — Personalized, auditable stamps.** Each officer's stamp carries their
  name (and optional stamp graphic / signature), recorded per verification.
- **G4 — Honest feedback loops.** Students who submit wrong/missing
  requirements are told what to fix via checklist replies, not silently left
  pending.
- **G5 — Calm under load.** Dense lists that stay scannable; motion that
  communicates without distraction.

### Non-Goals (v1)

- **NG1 —** No student-side UI in this spec (student dashboard is a separate
  spec) — except the _rendering contract_ for the stamp (§7.6) so both sides
  agree on what a verified step looks like.
- **NG2 —** No academic-year management, department management, or role
  administration (Admin surfaces).
- **NG3 —** No theme-settings page (exists elsewhere; referenced only).
- **NG4 —** No rejection-with-reason semantics _as designed in
  `erpsys-spec.md`_ — superseded for step 1 and steps 2–5 by the reply flows in
  §6.3 (see §11 divergence note).

---

## 3. Users & Access

| Who                                   | Access                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **SBO Officer** (`role: SBO_OFFICER`) | Full officer page.                                                                                                                   |
| **Admin** (`role: ADMIN`)             | Sees the officer page too (spec's officer procedures are role-guarded `SBO_OFFICER, ADMIN`). Same UI; no role-specific chrome in v1. |
| Student / Adviser / outside-org       | Route-guarded out.                                                                                                                   |

Route guard: `/officer` requires `SBO_OFFICER` or `ADMIN`; otherwise redirect
to the student dashboard with the standard session handling used by the
existing `/dashboard` route.

---

## 4. Information Architecture

**Single route** `/officer`, one top-level tab bar. State is URL-addressable:
`/officer?step=assessment&view=table` — tab and view survive reload and are
back-button friendly.

```
/officer
├── [Overview]            ← officer home: step summary cards + recent activity
├── [Assessment]          ← step 1 list (request → review → done / reply)
├── [Social Media]        ← step 2 list (evidence: screenshot uploads)
├── [Profiling]           ← step 3 list (Google Form success screenshot)
├── [Mugshot]             ← step 4 list (capture via webcam or student upload)
├── [Consent]             ← step 5 list (scan/photo of signed papers)
└── [Profiling Form]      ← Google Form link management (set/edit/remove)
```

Tab order matches step order 1–5, then the form tab. The Mugshot tab _contains_
the webcam capture flow (inline in the detail view, §6.2) — no separate
capture route.

**Tab bar behavior:**

- Pill/segmented tabs in a translucent material bar (`design.md` §5.10) under
  the app header.
- Active tab: navy-filled pill; inactive: text-only. Active-state transition
  is a cross-fade of the pill background (`damping 1.0, response 0.3` spring
  on the indicator if implemented with a sliding thumb — see §8).
- Tab badges: navy count chip showing unverified submissions for that step;
  badge animates in (spring scale from the chip, `damping 1.0, response 0.4`)
  when count changes.
- **Keyboard:** `1`–`5` switch steps 1–5, `6` = Profiling Form, `0` or `H` =
  Overview. `?` opens a shortcuts popover.

**Page header (per tab):** step title, active academic-year label
("AY 2026-2027 · 1st Semester", quiet, right-aligned), manual refresh button,
bell (§7.5). Year is display-only — officers never switch years.

---

## 5. Layout & Surfaces

### 5.1 Page shell

- Content sits under the existing app `Header`; the officer page adds a
  second-level tab bar (translucent, `backdrop-filter` blur, no hard divider —
  scroll-edge fade mask per `design.md` §5.10).
- Max content width ~1200px, centered; generous left/right gutters on desktop.
- Desktop-first (office terminals). Below ~900px the tab bar becomes
  horizontally scrollable and detail sheets go full-width (best-effort
  mobile, `design.md` NG1).

### 5.2 Overview tab

Five step cards in a responsive grid (2–3 per row on desktop):

- Each card: step number+name, **unverified count** (large), verified count
  (smaller, muted), a one-line hint of what review involves ("Check SIMS
  balance", "Review screenshot", "Capture or review photo", "Review scan").
- Card interaction: press feedback on pointer-down (`scale(0.97)`), click →
  that step's tab. Card entry uses critically damped springs
  (`damping 1.0, response 0.4`).
- "Recent activity" strip below the grid: last 5 verifications/replies
  (student name, step, officer action, time) — newest first, small type.
- Empty Overview (no submissions anywhere): calm empty state (§7.4).

### 5.3 Step list (the workbench)

Two interchangeable views, toggled by a segmented control in the list header:
**Table** (default) and **Cards**. Choice persists in the URL (`?view=`).

**Table view** — compact, dense, keyboard-friendly (`design.md` §5.11:
tightened leading for dense UI):

| Column    | Content                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------- |
| Student   | Avatar (initial-based, navy-on-dirty-white), name, student number (tabular-nums)                  |
| Submitted | Relative time ("12m ago") + absolute on hover; oldest-first default                               |
| Evidence  | Up to 3 thumbnails (56px, rounded, press-to-open lightbox) + "+N" counter chip                    |
| Status    | Chip: `New` (navy, unread dot), `Pending` (gray), `Returned` (amber), `Verified` (navy checkmark) |
| Action    | "Review" text button; row hover reveals; Enter opens                                              |

- Rows: 52–56px, hairline dividers (neutral-gray at low opacity — not black),
  row hover = subtle dirty-white lift, selected row = navy-tinted background.
- Unread rows carry a leading navy dot; dot clears when the detail sheet opens
  for that student (§7.5).
- Sortable: column headers cycle asc/desc; **default oldest-first** (longest
  waiting on top). Sort state in the URL.

**Cards view** — one card per student (same data, 96–120px cards, larger
thumbnails, airier rhythm per `design.md` §6.4). Same sort/status/unread
semantics; selected card opens the detail sheet.

**List header:** step title + counts ("8 unverified · 142 verified"), view
toggle, refresh button (spins on refetch), page-size control when paginating
(§7.3).

---

## 6. Core Interactions

### 6.1 Detail sheet (review + stamp)

Opened from any list row (click/Enter). A **right-side sheet** — enters from
the right edge, dismisses to the right (`design.md` §5.7 symmetric paths),
spring `damping 0.8, response 0.3` (sheet values from `design.md` §5.3).
Anchored visually to the row (row stays highlighted beneath). Dismiss: X
button, Esc, or outside click (instant, `design.md` §5.1).

Contents, top to bottom:

1. **Header** — student name, student number, step label, status chip,
   submitted time, close button.
2. **Evidence section** — all uploaded items for this step:
   - Thumbnails → click opens **lightbox**: full-size image, zoom (wheel/pinch,
     clamp 1–4×), pan while zoomed, keyboard arrows to step through multiple
     images, Esc/close to exit, focus-trapped, `alt` text from the upload
     metadata. Lightbox enter/exit: quick cross-fade + scale from the clicked
     thumbnail (`transform-origin` on the thumbnail, `design.md` §5.7).
   - Image counter chip ("3 images") in the header of the evidence section.
   - Mugshot step: **webcam capture embedded inline** (§6.2) _plus_ any
     student-uploaded photo shown as a normal evidence item.
3. **Step-1-only block (Assessment):** requirements/payments checklist
   (read-only, from `RequirementItem`) with a prominent callout:
   _"Check SIMS balance before stamping — opens externally."_ No evidence
   section.
4. **Action bar** (sticky bottom of sheet):
   - Primary: **Stamp as verified** (navy, full-width on mobile) — §6.3.
   - Secondary: **Send back** — §6.4. (Steps 2–5 label: "Mark as wrong /
     Request reupload"; step 1: "Missing requirements".)
   - Verified items: primary becomes **Revoke stamp** (destructive styling) —
     §6.5; "Send back" hides.
5. **Audit line** (verified items): "Stamped by `<officer stamp display>` ·
   <date/time> · <stamp graphic if configured>". Revocations append a second
   line.

### 6.2 Mugshot capture (step 4)

Interaction arc: **capture → preview → retake → Save & stamp** (one action
completes both capture and verification).

- Camera feed fills the evidence slot (letterboxed, 4:3); live indicator dot
  while streaming.
- **Capture** button (pointer-down feedback; shutter-like press). Capture
  freezes the frame into a **preview** with **Retake** (secondary) and
  **Save & stamp** (primary) — one confirmation, one API call
  (`captureMugshot` + `verifyStep` semantics; exact procedure shape TBD in
  implementation).
- Camera errors (denied permission, no camera): graceful fallback panel —
  "Camera unavailable — use student upload instead", showing any uploaded
  photo; the stamp action remains available.
- Stop the stream when the sheet closes (no lingering camera indicator).

### 6.3 Stamping (the moment)

1. Officer presses **Stamp as verified** → confirmation dialog
   (`design.md` §4 Agency: reversible-but-meaningful action gets a confirm;
   the confirm itself carries the stamp preview).
2. Dialog shows the **stamp preview** exactly as it will appear: officer's
   configured name + stamp graphic + signature (if set), with the current
   date, over a sample "VERIFIED" backdrop. Buttons: _Cancel_ / **Stamp**.
3. On confirm: `verifyStep` fires; the row flips to Verified; the sheet shows
   the **stamp landing** — the stamp graphic scales/rotates in from a small
   press-like origin with a `damping 0.8, response 0.3` spring (momentum from
   the tap; `design.md` §5.3 — bounce is earned because the user _acted_).
   No confetti, no sound — restraint (`design.md` §4.8; NG4 of `design.md`).
4. Feedback is on pointer-down for the button; the confirm and the stamp
   landing are the two beats. `aria-live="polite"` announces "Verified".

### 6.4 Send back / missing requirements

Generic reply mechanism, step-specific vocabulary:

| Step           | Trigger label                      | Checklist chips (v1)                                                                                      |
| -------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1 Assessment   | "Missing requirements"             | "Balance not yet settled", "Go to SBO office for payment", "Incomplete requirements" + optional free note |
| 2 Social media | "Mark as wrong / request reupload" | "Wrong screenshot", "Did not like/follow all pages", "Screenshot unclear" + note                          |
| 3 Profiling    | same                               | "Response not found in sheet", "Wrong success page", "Screenshot unclear" + note                          |
| 4 Mugshot      | same                               | "Photo not clear", "Not a mugshot", "Wrong angle" + note                                                  |
| 5 Consent      | same                               | "Wrong document", "Scan unreadable", "Missing signature" + note                                           |

- Opens an inline composer in the sheet: chip buttons (multi-select) + a note
  textarea (optional). **Send** → student sees the reply as an in-app
  notification + their step flips to `Returned` (status model note, §11).
- The reply is recorded in the audit trail (`respondedById`, `respondedAt`,
  chips, note).
- Checklist content is a v1 seed list; make chips data-driven so Admin can
  edit later without UI changes (render from API, not hard-coded).

### 6.5 Revoke stamp

- Only on verified items, from the action bar (destructive style: red-tinted
  text button, not a filled button).
- Confirmation dialog: "Revoke stamp for `<student>`?" — explains the row
  returns to unverified and the audit trail records the revocation (who/when).
- No reason required in v1 (keeps the flow light); audit line shows
  "Stamped · Revoked by <officer> · <time>".

### 6.6 Profiling Form tab

- **No form set:** empty state with primary action "Add Google Form link" —
  opens an inline editor (URL field + Save). Copy explains the form must
  collect respondent Google email.
- **Form set:** card showing the active URL (link opens in new tab), set-by /
  updated time, actions: **Edit** (inline URL field, prefilled) and
  **Remove** (confirmation dialog — destructive, per `design.md` §4 Agency).
- One form per academic year; the year label in the header keeps context.
- All changes surface the toast + update the shared query cache (students see
  the new link immediately).

---

## 7. System-wide Decisions

### 7.1 Color language — 60 / 20 / 10 + 10

| Share | Role                                                                                         | Tailwind tokens (v1 mapping)                                                                         |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 60%   | **White / dirty white** — page background, surfaces, cards                                   | `--color-surface`, `--color-surface-raised` (dirty white = warm-tinted white, e.g. `#f7f6f3`-family) |
| 20%   | **Navy blue** — primary actions, active tab, links, focus rings, unread dots, verified marks | `--color-primary` (navy family, e.g. `#1e3a5f`-`#16324f`)                                            |
| 10%   | **Black** — primary text, high-emphasis elements                                             | `--color-ink`                                                                                        |
| 10%   | **Neutral gray** — secondary text, dividers, disabled, muted chrome                          | `--color-muted`, `--color-border`                                                                    |

Semantic colors ride _on top_ of the palette (functional, not brand):
`error` (red family), `warning` (amber — used for `Returned` chips).
**No green in the verified language** — verified is expressed through the navy
stamp motif and muted row styling, keeping the palette disciplined
(`design.md` §4.7 Craft: every color is defensible).

Dark mode: same ratios, inverted roles (dark navy-black surfaces, dirty-white
text); see §7.7.

### 7.2 Typography

- System font stack (`system-ui`), `design.md` §5.11 rules: negative tracking
  on headings (`-0.02em` at display sizes), body near `0`, tightened leading
  in tables; student numbers in `tabular-nums` so columns align.
- Hierarchy = weight + size + leading as a set, not size alone.
- All spacing in `rem`/`em` so user text-size settings scale layout.

### 7.3 Data freshness & pagination

- **Auto-refresh polling:** TanStack Query `refetchInterval` ~20s per step
  list + `refetchOnWindowFocus` + manual refresh button (spins while
  fetching). No SSE/websocket in v1.
- New submissions arriving during a session appear at the top (or their sort
  position) with the unread dot and a quiet "N new" inline chip — the row
  enters with a short spring (`damping 1.0, response 0.4`).
- **Pagination:** server-side; default page size 50, options 25/50/100; total
  count shown ("8 unverified · 142 verified"). Position preserved when
  returning from a detail sheet.
- Loading: skeleton rows matching the active view (table rows / card
  silhouettes) — no spinner flash. Errors: inline banner with Retry, toast
  for action failures.

### 7.4 Empty states

Calm, no illustration-library art: one-line icon (thin-stroke, navy), short
copy, and a hint:

- Step tab: "No submissions yet — students appear here once they finish this
  step." + year context ("AY 2026-2027").
- Step 1 extra: "Students must tap 'Apply for assessment' first."
- **No active year:** every step list and the Overview render empty with
  "No active academic year — an admin must activate one first."
  (fresh-install counterpart to the per-tab copy; distinct because nothing
  can be submitted until a year exists — `admin-page-spec.md` §5.3).
- Profiling Form: see §6.6.
- Empty states fade in (200ms cross-fade; no motion under reduced-motion).

### 7.5 Notifications (bell)

- Bell at the right of the officer tab bar (next to refresh).
- **Red badge** = count of unverified submissions across steps (the "new
  applicant finished a step" signal). Number animates (spring scale) on
  change.
- Click → popover anchored to the bell (`transform-origin` on the trigger,
  `damping 1.0, response 0.4`, enters/exits from the trigger — `design.md`
  §5.7, §6.3): newest submissions first, each row = student, step, time,
  "Review" action that opens that step tab + detail sheet.
- Badge counts mirror the tab badges; dismiss is implicit (open = read for
  that item, §6.1 unread-dot rule).
- The notification _component_ is generic (reused for adviser/admin later);
  v1 wires only the submission event.

### 7.6 The stamp — rendering contract

The officer-configured stamp is the visual proof of verification and **also
renders on the student dashboard** (decision: students see the personalized
stamp on their verified steps, mirroring the physical me-card).

- **Stamp anatomy:** officer display name (configurable), current date,
  optional transparent stamp graphic (PNG, uploaded "no background"), optional
  transparent signature image. Text-only stamp is the valid default when no
  graphics are set (navy text in a navy-outlined rounded badge, slight
  rotation like a rubber stamp).
- **Config surface:** the existing **UserMenu popover** gains "My stamp" —
  name field, graphic upload, signature upload (both: image/*, PNG preferred,
  transparent bg encouraged, preview rendered on a checker/neutral backdrop),
  live preview, Save. Validation: uploads ≤ ~2MB, image formats only.
- **Rendering rule shared by both sides:** stamp graphic + signature compose
  over the verified badge at ~70–80% opacity, `mix-blend-multiply` in light
  mode (so "no bg" stays transparent over content), plain composite in dark
  mode. Exact placement on the student dashboard is that spec's concern; this
  spec fixes the _stamp itself_.

### 7.7 Theme

- **Default: light, always.** Dark mode is an opt-in preference stored in the
  Settings page (out of this spec's scope) — no in-page toggle.
- Both themes honor `design.md` §5.13: `prefers-reduced-motion` (cross-fades,
  no springs/slides), `prefers-reduced-transparency` (solid surfaces, drop
  blur), `prefers-contrast: more` (near-solid backgrounds + defined borders).
- No abrupt brightness jumps on theme change (ease transitions).

### 7.8 Accessibility & keyboard

- **Core shortcuts** (documented in the `?` popover, also discoverable on
  first visit via a one-time hint):
  `1–5` step tabs, `6` Profiling Form, `0`/`H` Overview, `J`/`K` or ↑/↓ move
  rows, `Enter` open detail, `S` stamp (inside detail), `Esc` close
  sheet/lightbox/dialog, `?` shortcuts.
- Focus ring: navy, 2px offset, never removed (`design.md` §4 Craft).
- Contrast: navy on dirty-white for primary text ≥ 4.5:1; muted gray reserved
  for secondary text at ≥ 4.5:1 (verify at token time).
- Lightbox: focus-trapped; evidence images carry `alt` text from upload
  metadata; `aria-live` announces stamp/revoke/reply results.
- Motion never carries information alone (unread dots + badges are
  color+shape+label, not animation).

### 7.9 Performance

- Animate only `transform`/`opacity`; `will-change` only where motion is
  imminent (`design.md` §5.9).
- List virtualization if a single step exceeds ~200 rendered rows.
- Evidence thumbnails: server-side resized/compressed variants; lightbox loads
  the full image lazily.

---

## 8. Motion Table (values are authoritative)

| Interaction                                | Spring / easing    | Values                                                        |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------- |
| Tab indicator, list entries, cards, badges | critically damped  | `damping 1.0`, `response 0.3–0.4`                             |
| Detail sheet (enter/exit)                  | sheet spring       | `damping 0.8`, `response 0.3` (same path both ways)           |
| Popovers (bell, user menu, shortcuts)      | reposition         | `damping 1.0`, `response 0.4`, anchored to trigger            |
| Stamp landing (on verify)                  | momentum spring    | `damping 0.8`, `response 0.3`, scale+rotate from press origin |
| Lightbox enter/exit                        | cross-fade + scale | `transform-origin` at clicked thumbnail                       |
| Press states                               | CSS transition     | `transform: scale(0.97)`, 100ms ease-out, pointer-down        |
| Empty states / static reveals              | cross-fade         | 200ms opacity                                                 |
| Reduced motion                             | all of the above → | short opacity cross-fades only                                |

Bounce appears **only** where the user's action carried momentum (sheet drag,
stamp tap). Nothing decorative bounces (`design.md` §4.8, §5.3).

---

## 9. Component Inventory

New components (Svelte 5 runes, in `apps/web/src/components/officer/`):
`OfficerTabBar`, `StepOverview` (cards + recent strip), `SubmissionList`
(table/card variants + sort + view toggle), `SubmissionRow`, `DetailSheet`,
`EvidenceLightbox`, `WebcamCapture`, `StampButton` + `StampConfirmDialog`,
`ReplyComposer` (chips + note), `RevokeConfirmDialog`, `OfficerBell`,
`ProfilingFormPanel`, `EmptyState`, `SkeletonRows`, `ShortcutsPopover`.

Modified: `UserMenu.svelte` gains "My stamp" config (name, graphic, signature,
preview).

---

## 10. Implementation Notes

- Route: `apps/web/src/routes/officer/+page.svelte`; role guard mirrors
  `/dashboard`'s session redirect pattern with a role check.
- Data: `orpc.officer.*` procedures (`listPendingByStep`, `getStepDetail`,
  `verifyStep`, `captureMugshot`, `upsertProfilingForm`) + new reply/revoke
  procedures (see §11); TanStack Query with `refetchInterval` per list key
  `["officer", step, year]`; invalidate on stamp/revoke/reply.
- Styling: Tailwind v4 `@theme` tokens per §7.1; translucent materials via
  `backdrop-filter` utilities; `prefers-reduced-*` overrides at component
  scope (`design.md` §7.2).
- Motion: `svelte/motion` springs (`design.md` §7.1); no new animation
  dependency unless velocity-blended sheet retargeting demands it.
- URL state: `?step`, `?view`, `?sort` query params drive the tab bar/list —
  one source of truth.

---

## 11. Divergences & Open Questions (TODO)

1. **Reply flows vs. `erpsys-spec.md`.** The system spec's non-goal "no
   rejection-with-reason" is superseded for the officer surface: step 1 gets
   "missing requirements" replies; steps 2–5 get "mark wrong / reupload".
   Requires reconciliation of the system spec and a status value (e.g.
   `RETURNED`) on `StepVerification` + reply persistence (`replyChips`,
   `replyNote`, `respondedById/At`) + student-side notification. **Flagged for
   system-spec update.**
2. **Step-1 requirement details (user-deferred).** Exact requirements/payment
   items and whether "go to SBO office for payment" is a distinct reply chip
   are TODO — still gathering information. UI is spec'd to render whatever
   `RequirementItem` + chips the API returns.
3. **Stamp graphics on the student dashboard.** Rendering contract fixed
   (§7.6); placement/layout on the student side is the student-spec's task.
4. **Unread tracking durability.** Unread dots are client-side read state
   (per-officer `lastViewedAt` persistence is a data-model question — TBD).
5. **Outside-org students in officer lists.** They complete steps like anyone
   else; whether the officer list shows a subtle "outside org" marker is
   undecided — default: show nothing in v1 (PII-minimal), revisit if officers
   need it for the Google Sheet cross-check.
6. **Reply wording per step.** Chip lists in §6.4 are v1 seeds; confirm
   wording with officers during testing.
7. **`captureMugshot` + `verifyStep` atomicity.** "Save & stamp" should be one
   logical action; confirm the API shape (single procedure vs. client
   sequence) during implementation.
8. **No-active-year state.** Previously undefined — a fresh install would
   have shown the misleading per-tab "no submissions yet" copy. Fixed in §7.4
   (distinct empty-state copy until an admin activates a year; the admin
   side of the same state is `admin-page-spec.md` §5.3).

---

## 12. Verification & Review

- Interactive prototype review per `design.md` §17: frame-by-frame pass on the
  stamp landing, sheet, and lightbox; slow-motion review of badge/entry
  springs.
- Keyboard walkthrough: full stamp-and-reply flow without the mouse.
- Reduced-motion / reduced-transparency / high-contrast passes.
- Real-user test with an SBO officer processing a seeded batch (wrong
  screenshots, missing payment, both view modes, revoke).
