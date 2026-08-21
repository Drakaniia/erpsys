# Student Page — UI/UX Design Specification

**Status:** Draft for review (compiled from interviews, 2026-08-21)
**Scope:** All UI/UX decisions for the Student surface in `apps/web` (SvelteKit + Svelte 5 + Tailwind v4), mobile-first.
**Companion docs:** `design.md` (global Apple-style motion/materials baseline — normative where referenced), `docs/spec/erpsys-spec.md` (system spec — see §11 divergences), `docs/spec/sbo-officers-page-spec.md` (officer-side spec — shares the stamp rendering contract, §7.6), `docs/spec/instructor-page-spec.md` (instructor-side spec — Enroll stamps step 6, §6.4, §11.9), `docs/spec/admin-page-spec.md` (admin side — configures the years, requirements, and step-3 form this page consumes), `docs/readme.md` (original request).
**Author:** Design interview synthesis

---

## 1. Overview

The SBO Student page is where COT students complete the 6-step enrollment
requirements process ("me card"): Assessment → Social media → Profiling →
Mugshot → Parent consent/Medical → Enrollment. It is a **mobile-first,
single-page checklist** (explicit requirement: "student page is optimized for
mobile view") built on the ERPSYS design baseline: calm, confident,
Apple-style materials and motion (`design.md` §2, §4.8).

**Core model:** the page is the student's own progress tracker. Each of the
six steps is a card in a vertical checklist; tapping a card opens a **bottom
sheet** with that step's interaction (apply, upload, form link, queue join).
Steps are stamped by SBO officers server-side; the student's page reflects
state — it never mutates a verification itself. The emotional register is
**calm**: the stamp landing is the one meaningful moment, and confetti is
reserved exclusively for enrollment completion (`erpsys-spec.md` §5.6).

**Identity shortcut:** the student number IS the Google email local-part
(e.g. `2401117078@student.buksu.edu.ph`). It is auto-derived at sign-in —
no first-login profile form for institutional accounts. Outside-org users get
a one-time manual prompt instead (§5.3).

---

## 2. Goals & Non-Goals

### Goals
- **G1 — Know where you are instantly.** A student opening the page can tell
  in one glance what's done, what's pending, and what to do next (header
  progress pill + bar, per-card status chips, one-line action hints).
- **G2 — Complete steps on the phone.** Every step's action (apply, upload,
  open the Google Form, join the queue) is reachable in a few thumb-friendly
  taps; uploads are instant and retryable.
- **G3 — Calm verification feedback.** When an officer stamps a step, the
  student sees the personal stamp arrive (graphic, name, date) with a spring
  landing — no confetti, no sound (restraint, `design.md` §4.8). Enrollment
  completion is the single confetti moment.
- **G4 — Trust through transparency.** Students see exactly why a step is
  pending or returned (reply chips/note from the officer), their queue
  position live, and their own verified-by record.
- **G5 — Answers without a line.** The Groq chatbot answers process
  questions from the knowledge doc, with suggested questions and streaming
  responses.

### Non-Goals (v1)
- **NG1 —** No officer-side features (stamping, review queues, mugshot
  capture, profiling-form management) — `sbo-officers-page-spec.md`.
- **NG2 —** No adviser/admin surfaces — `erpsys-spec.md` §3, §9.
- **NG3 —** No chat-history persistence — stateless per request
  (`erpsys-spec.md` §8).
- **NG4 —** No explicit academic-year chrome — the year is implied by
  content (stamp dates, step-3 form context); see §7.5.
- **NG5 —** No theme-settings page — dark mode is an opt-in preference
  stored in the existing Settings page (out of this spec's scope), mirroring
  the officers page (§7.6 of that spec).
- **NG6 —** No previous-year archive view in v1 (rollover notice only;
  archive is a v2 candidate, §7.4).

---

## 3. Users & Access

| Who | Access |
|---|---|
| **Student** (`role: STUDENT`) | Full student page. |
| **Outside-org user** (any Google domain, derived `STUDENT` + `isOutsideOrg`) | Same page + persistent notice banner (§5.2) + one-time student-number prompt (§5.3). |
| SBO Officer / Adviser / Admin | Route-guarded out — they land on their own surfaces. |

Route: the existing `/dashboard` route serves the student page. Role guard:
`STUDENT` only; officers/advisers/admins redirect to their own dashboards with
the standard session handling. Student data is strictly self-scoped
(`erpsys-spec.md` §10 — a student must never see another student's records).

---

## 4. Information Architecture

**Single route** `/dashboard` with two bottom tabs. State is URL-addressable
where it matters: `?step=3` deep-links a step sheet open; the active tab is
`?tab=progress|chat`.

```
/dashboard
├── [Progress]        ← default tab: 6-step vertical checklist (§5.4)
└── [Chat]            ← chatbot tab (§6.6)
```

- **Bottom tab bar** (native mobile pattern): `Progress` | `Chat`, 48px+
  touch targets, translucent material bar (`design.md` §5.10). Active tab =
  navy text + indicator; inactive = muted. Indicator cross-fades
  (`damping 1.0, response 0.3` if a sliding thumb is used).
- **App header** (existing translucent header): app title, **progress pill**
  ("3/6") + **thin progress bar** (§5.5), notification **bell** (§7.6).
- **Outside-org banner**: thin, non-dismissible strip under the header on
  every screen (§5.2).
- Step sheets are **bottom sheets** over the checklist — not routes
  (§5.6, §6.1). `?step=` deep-link opens the sheet on load and is cleared
  when it closes.
- Chat tab is a separate tab view, not a modal (§6.6).

Tab order and behavior are stable; the checklist is **never reordered** —
steps keep the 1–6 order so position == progress, mirroring the physical
me-card.

---

## 5. Layout & Surfaces

### 5.1 Shell & breakpoints
- Mobile-first: the page is designed for a ~360–430px viewport. Content
  column `max-width: 560px`, centered — the same column on desktop keeps the
  mobile layout (bottom tabs, sheets) rather than reflowing into a wide
  desktop layout; the student experience is a phone experience everywhere.
- Bottom tab bar is fixed, translucent, `backdrop-filter` blur, scroll-edge
  fade mask (no hard divider, `design.md` §5.10). Content scrolls under it.
- All interactive targets ≥ 44×44px; primary actions ≥ 48px tall.

### 5.2 Outside-org banner
- **Non-dismissible** thin strip (24–28px) directly under the header, above
  the tab content, on every screen of the student surface.
- Copy: "You are outside the organization — some steps may differ."
  (wording TBD with officers; system-spec requirement: persistent).
- Style: amber-tinted background, ink text, small type; no icon animation,
  no motion. It is a state, not a notification.

### 5.3 Student number (identity)
- **Institutional accounts:** the student number is parsed from the email
  local-part (`2401117078@student.buksu.edu.ph` → `2401117078`). Displayed
  read-only, tabular-nums, next to the name in the progress header area.
  **No profile form exists for these users.** Parse failure (non-numeric or
  missing local-part on an `@student.buksu.edu.ph` address) falls back to the
  manual prompt.
- **Outside-org users:** one-time inline prompt card at the top of the
  checklist ("Enter your student number") with a single field + Save.
  Server-side uniqueness check; duplicate → inline error under the field
  (`design.md` §5.12 inline validation; `erpsys-spec.md` §12). Dismissible
  but re-appears until saved.

### 5.4 The checklist (Progress tab)
Six step cards, vertical stack, full-bleed within the column:

| Card element | Detail |
|---|---|
| Step number + name | "1 · Assessment", "2 · Social Media", … (navy number, ink name) |
| Status chip | `Pending` (gray), `Applied` (navy — step 1 only), `Returned` (amber), `Verified` (navy checkmark) (§7.2) |
| Action hint | One line, muted: "Apply for assessment", "Upload screenshot", "Complete the form", "Upload photo", "Upload signed papers", "Join the queue" |
| Chevron | Right, muted; opens the step sheet |

- Card height ~64–72px; hairline dividers (neutral-gray, low opacity — not
  black); press feedback `scale(0.97)` on pointer-down (`design.md` §5.1).
- Entry animation: cards fade/settle in with critically damped springs
  (`damping 1.0, response 0.4`) on first load, staggered ~40ms — subtle, once.
- Verified cards: chip turns navy; the card reads quieter (muted row
  styling). The full stamp lives on the sheet (§6.1), not the card.
- Returned cards: amber chip + a truncated reply preview ("Officer: Wrong
  screenshot —") so the student sees the problem without opening the sheet.
- **Ready card (step 6, when steps 1–5 are all verified):** the card flips
  from muted-pending to a **navy-accented ready state** — the hint changes
  from "Join the queue" to **"You can now queue"**, a small navy dot marks
  it ready, and the chevron is emphasized. It is the only card that visibly
  changes meaning before being stamped — the page's way of saying "go".
- Outside-org prompt card (§5.3) sits above step 1 until saved.

### 5.4.1 All-set banner — the "you can now queue" moment

When all five steps (1–5) are verified, the checklist gains a **ready banner**
at the top (above step 1, below the prompts) — the single place the page
declares the student may queue:

- Copy: **"All 5 steps complete — you can now join the enrollment queue."**
- Primary CTA: **"Join the queue"** (navy button) → opens the step-6 sheet
  (§6.5) directly. No secondary action — the banner is single-purpose
  (restraint, `design.md` §4.8).
- **Arrival beat:** when the 5th verification lands live (polling or
  notification, §7.4), the banner enters with a spring settle
  (`damping 1.0, response 0.4`) and the step-6 ready card pulses once
  (`scale 1.02 → 1.0`, critically damped). No confetti — the enrollment
  success screen owns celebration (§6.8). Reduced motion: 200ms cross-fade
  in, no pulse.
- **Persistent, not a toast:** the banner is a state — it survives reloads
  and shows whenever steps 1–5 are verified and step 6 is not yet enrolled.
- **After enrolling:** the banner flips to a calm done state — "You're
  enrolled — all steps complete." — with no CTA (the success screen
  §6.8 already delivered the moment).

### 5.5 Progress summary (header)
- **Pill:** "3/6" — compact navy-on-dirty-white count in the header, right
  of the app title. Text updates on change; a spring scale
  (`damping 1.0, response 0.4`) draws attention on increment (a step
  verified).
- **Progress bar:** 2–4px bar under the header, full column width, filling
  left→right. Fill animates with a spring (`damping 1.0, response 0.4`); the
  bar is a thin material strip with the fill in navy.
- Both count verifications in the **current academic year** (server-derived);
  Enrollment (step 6) does not count toward the "x/6" — the pill counts
  steps 1–5 verified, i.e. readiness for the queue.
- No year label anywhere (§7.5).

### 5.6 Bottom sheets (detail presentation)
Every step interaction opens a **bottom sheet** (`design.md` §5.3 sheet
values: `damping 0.8, response 0.3`):

- Drag handle (36×4px, rounded, muted) on top; sheet enters from the bottom,
  exits to the bottom (spatial consistency, `design.md` §5.7). Drag is 1:1
  with the pointer (Pointer Events + capture, grab offset respected,
  `design.md` §5.2); release velocity handed to the spring
  (`design.md` §5.4); rubber-bands at the bottom edge (`design.md` §5.6).
- Default snap ~85% viewport height; content scrolls inside; sticky action
  bar at the sheet's bottom (above the tab bar).
- Dismiss: drag down past ~30% + release, X button, Esc, or back gesture.
  Interruptible at any point (`design.md` §5.5) — never locked during
  transitions.
- Sheet surface: translucent material (`design.md` §5.10), raised shadow.
- Focus is trapped while open; the checklist behind dims slightly (scrim for
  a modal task — `design.md` §5.10 "dim to focus").
- `prefers-reduced-motion`: sheet fades in/out (200ms cross-fade), no slide
  (§7.8).

---

## 6. Core Interactions

### 6.1 Step sheet anatomy (shared)
Header: step number + name, status chip, close (X). Body is step-specific
(§6.2–§6.5). Verified sheets additionally show the **stamp** (§6.7) + verified-
by line. Returned sheets show the officer's reply chips/note at the top of
the body, then the corrective affordance. Sticky bottom: primary action only
when the step needs one (Apply / Upload / Join queue); verified/returned
sheets have no action bar unless re-upload applies.

### 6.2 Step 1 — Assessment
- **Not applied:** requirements/payments checklist (from `RequirementItem`,
  admin-managed) rendered read-only, then primary **"Apply for assessment"**.
- **Apply flow (confirm dialog):** tap Apply → dialog listing the
  requirements/payments again + explanation ("Officer checks your SIMS
  balance before stamping") → *Cancel* / **Apply**. Confirm → status flips to
  `Applied`, toast "Application received — awaiting officer review", dialog
  closes. Feedback on pointer-down (`design.md` §5.1); confirm is the second
  beat.
- **Applied (pending):** sheet shows a calm waiting state — navy "Applied"
  chip, copy "Awaiting officer review — check your notifications", no action
  bar, no re-apply (single application per year; idempotent guard).
- **Returned:** officer's reply chips ("Balance not yet settled", "Go to SBO
  office for payment", "Incomplete requirements" + note) at top + **"Apply
  again"** primary, which resets to `Applied`. (Rendering of the officers'
  reply flow — divergence note §11.1.)
- **Verified:** stamp display (§6.7) + verified-by line. No action bar.

### 6.3 Steps 2 / 4 / 5 — Evidence uploads (Social media, Mugshot, Consent)
Shared **evidence slot** UX (instant upload on selection):

1. Empty slot: dashed rounded placeholder, muted icon, label ("Upload
   screenshot", "Upload photo", "Upload signed papers (scan or photo)").
   Primary button + tap-anywhere target (≥44px).
2. Select file → **upload starts immediately** with inline progress (thin
   bar in the slot + percentage; UploadThing progress events). No confirm
   screen — kill latency (`design.md` §5.1).
3. Success: file replaces the placeholder as a **thumbnail** (rounded,
   ~96px) with a small check. Tap thumbnail → lightbox (full-size, Esc/X to
   close — reuse the officers' lightbox pattern, simplified: no zoom/pan in
   v1 on the student side unless free).
4. **Replaceable until stamped:** while `Pending`, an "×" on the thumbnail
   deletes the upload; the slot returns to empty and a fresh upload replaces
   it. The officer sees only the latest file. After `Verified`, uploads are
   locked (no delete affordance).
5. **Failure handling (inline retry):** error state under the slot —
   "Upload failed — tap to retry", the file is **preserved** in the slot and
   a retry button re-uploads the same file; no re-selection, no data loss.
   File-type/size rejection (non-`image/jpeg|png|webp`, >10MB,
   `erpsys-spec.md` §8) shows the specific inline message and drops only the
   rejected selection.

Step specifics:
- **Step 2 (Social media):** the sheet first lists the FB pages to
  like/follow ("COT SBO", "SSC", etc. — same list shown to everyone; source
  TBD, §11.3) as a compact checklist, then the evidence slot for the
  screenshot. Multiple screenshots allowed (append more thumbnails; evidence
  payload `uploadIds`).
- **Step 4 (Mugshot):** single photo slot. Copy notes either path: "Upload a
  photo, or have an SBO officer capture it at the office."
- **Step 5 (Consent):** single scan/photo slot; copy "Signed parent consent
  + medical form".

### 6.4 Step 3 — Profiling (Google Form)
- **Form set:** the sheet shows (a) a notice — "You'll return here to upload
  your success-page screenshot", (b) a primary **"Open the Google Form"**
  button → opens the form in a **new tab**, (c) the signed-in email hint —
  "Submit as `2401117078@student.buksu.edu.ph`" (tabular-nums, muted) — the
  form collects the respondent's Google email so officers can cross-check,
  (d) the evidence slot for the **success-page screenshot** ("Your response
  has been recorded"), same instant-upload UX as §6.3.
- **No form set (active year has no link):** notice card in the sheet — "Form
  not yet set up — see the SBO office." No link, no upload slot, no other
  affordances (§§11.2). The checklist card shows the standard `Pending` chip
  with hint "See SBO office" — the step is not hidden.
- Officer cross-checks the Google Sheet before stamping; the student just
  waits (system-spec flow; no in-app verification of the response).

### 6.5 Step 6 — Enrollment queue
- **Prerequisites not met:** blocked state — the sheet lists the missing
  steps ("You must complete: 1 Assessment, 3 Profiling") with no join
  affordance; the checklist card hint reads "Complete steps 1–5 first".
- **Prerequisites met:** the primary entry is the **all-set banner CTA**
  (§5.4.1); the step-6 ready card also opens this sheet. The sheet shows
  department cards (name, code, **queue status** — Open (navy dot) / Closed
  (gray dot) — and current position count ("12 waiting")). Department list =
  seeded, admin-editable data (`erpsys-spec.md` §14). Student chooses a
  department (not an adviser) → **Join queue** primary.
- **Queue closed** (no adviser of that department has availability open):
  join is blocked with the message "Queue closed — the adviser is not yet
  accepting students" (per `erpsys-spec.md` §12).
- **After joining:** the sheet flips to the joined state — large position
  number ("#12", tabular-nums, display-size, navy), department name, "We'll
  notify you when the adviser is ready." Position is **live-updating**:
  TanStack Query polling (~20s) refreshes the position; the number updates
  with a spring scale on change. One queue entry per student per year
  (idempotent — re-join blocked).
- **Enrollment completed:** the instructor's Enroll action atomically marks
  the queue entry done **and stamps step 6 `VERIFIED`** (`StepVerification`
  for `ENROLLMENT`, `verifiedById` = instructor — the official enrollment
  record; `instructor-page-spec.md` §6.4, §11.9). The student gets the
  confetti success screen (§6.8); the queue sheet shows "Enrolled — you're
  done 🎉" only via that screen; the step-6 card chip flips to `Verified`
  (enrolled) and the step-6 sheet shows the instructor's stamp (§6.7).
- No leave-queue action in v1 (completion is final per `erpsys-spec.md` §12).

### 6.6 Chat tab (chatbot)
- Bottom tab "Chat" → full-tab conversation surface (not a modal):
  - **Empty state:** calm illustration-free intro (thin-stroke navy icon,
    short copy "Ask about the enrollment process") + **suggested-question
    chips**: "What are the requirements?", "Where is the SBO office?", "What
    is step 3?", "How do I join the queue?" Chips are tappable, one question
    each.
  - Conversation: message bubbles — student right (navy), bot left (dirty-
    white surface), **streaming** bot responses (SSE from Groq; text appears
    as it generates). Typing indicator (three-dot pulse, subtle) before the
    first token.
  - Input: pinned above the keyboard (`inputmode` default), send button;
    Enter to send. Suggestion chips re-offer (scrollable row) above the
    input.
  - **Stateless:** no history persistence (v1, `erpsys-spec.md` §8); the tab
    may keep the in-memory conversation while the app is open — on reload the
    chat resets to the empty state. Flagged in §11.4.
  - Fallback: bot answers "I don't know — ask an SBO officer" for
    out-of-doc questions (knowledge-doc instructed; `erpsys-spec.md` §12).
  - Errors (Groq down): inline error bubble + retry on the last message.

### 6.7 The stamp — verified state (student side)
Rendering contract is fixed by `sbo-officers-page-spec.md` §7.6; **this spec
fixes its student-side placement**:

- The stamp renders on the **step sheet** (not the checklist card — compact
  chip there, §5.4). Position: a "Verified" block in the sheet body — the
  composed stamp (officer display name + date + optional transparent graphic
  + optional signature; navy text in a navy-outlined rounded badge, slight
  rotation; 70–80% opacity, `mix-blend-multiply` in light mode) over a subtle
  "VERIFIED" backdrop.
- **Stamp landing:** when a step flips to Verified *while the sheet is open*
  (or the notification arrives), the stamp animates in — scales/rotates from
  a small press-like origin with `damping 0.8, response 0.3` (momentum earned
  by the officer's action; `design.md` §5.3). No confetti, no sound
  (§2 G3). `aria-live="polite"` announces "Verified".
- Below the stamp: **verified-by line** — "Verified by `<officer name>` ·
  `<date/time>`" (muted, small). No other audit trail on the student side
  (§2 G4, §11.5).
- **Step 6 (Enrollment) uses the same contract, stamped by the instructor.**
  The step-6 stamp is **text-only in v1** — instructor display name + date
  (no graphic/signature, since instructors have no "My stamp" config surface
  on their page; the text-only stamp is the valid default per
  `sbo-officers-page-spec.md` §7.6). Navy text in a navy-outlined rounded
  badge, slight rotation, over the "VERIFIED" backdrop; the verified-by line
  reads "Enrolled by `<instructor name>` · `<date/time>`". If instructors
  need stamp graphics later, the officers' "My stamp" config can be extended
  (student-spec §11.10).
- If the sheet is closed when verification lands: the checklist card chip
  flips to Verified with a quiet spring, the progress pill increments, and a
  notification arrives (§7.6); opening the sheet shows the stamp landing
  (replays once on first open).

### 6.8 Enrollment success screen (the one celebration)
Full-screen moment when the adviser completes enrollment (system-spec flow,
`erpsys-spec.md` §5.6):

- Message: "You are now enrolled in `<Department name>`, `<semester>
  <academic year>`" (e.g. "1st Semester 2026-2027") — display-size type,
  navy on dirty-white.
- **Confetti** (the only confetti in the system): restrained — a brief
  (≈2.5–3s) burst of small navy/dirty-white/amber shapes falling over the
  message, then settling to a calm card with a "Done" button back to the
  checklist (now all six verified). Reduced-motion: confetti replaced by a
  static check + cross-fade.
- Emotion: achievement, earned — this is the payoff of six steps
  (`design.md` §4.8).

---

## 7. System-wide Decisions

### 7.1 Color language — 60 / 20 / 10 + 10 (same as officers)
| Share | Role | Tailwind tokens |
|---|---|---|
| 60% | **White / dirty white** — background, surfaces, cards | `--color-surface`, `--color-surface-raised` (`#f7f6f3`-family) |
| 20% | **Navy blue** — primary actions, active tab, progress fill, chips, links, focus rings, position number, verified marks | `--color-primary` (`#1e3a5f`-family) |
| 10% | **Black** — primary text | `--color-ink` |
| 10% | **Neutral gray** — secondary text, dividers, muted chrome | `--color-muted`, `--color-border` |

Semantic on top: `error` (red) for upload failures and duplicate student
number; `warning` (amber) for `Returned` chips and the outside-org banner.
**No green in the verified language** — verified is the navy stamp motif
(discipline, `design.md` §4.7). Dark mode: same ratios inverted; opt-in via
Settings (§2 NG5).

### 7.2 Status chips
| Status | Color | Detail |
|---|---|---|
| Pending | gray | default unverified |
| Applied | navy | step 1, awaiting officer review |
| Returned | amber | officer sent it back — reply visible on sheet + card preview |
| Verified | navy + checkmark | stamped |

Chips are color + label + (where meaningful) icon — never motion alone
(`design.md` §4 Craft). Motion never carries information (§7.8).

### 7.3 Typography
- System font stack (`system-ui`); `design.md` §5.11: negative tracking on
  headings (`-0.02em` at display sizes), body near `0`; tightened leading in
  dense sheet content.
- **tabular-nums** everywhere numbers must align/read: student number,
  queue position, progress pill, step numbers.
- All spacing `rem`/`em` — layout scales with the user's text-size setting.

### 7.4 Data freshness & rollover
- **Polling:** TanStack Query `refetchInterval` ~20s on the step list
  (reflects stamps and returns from officers) and the queue position
  (§6.5). `refetchOnWindowFocus` + pull-to-refresh on the checklist (mobile
  native pattern; refetch only, no full reload). Manual refresh affordance
  is not needed on mobile (pull-to-refresh + focus refetch suffice).
- **New data arrival:** when polling discovers a newly verified step, the
  card updates in place (spring), the pill increments (spring scale), and a
  notification fires if the sheet isn't already showing the stamp landing.
  If that step is the **5th**, the all-set banner also enters (§5.4.1) and
  the step-6 card flips to its ready state.
- **Rollover:** when the admin activates a new academic year, the checklist
  resets to all-pending with a **one-time notice** banner: "New academic
  year — steps reset. Previous year's stamps remain in your records."
  Previous-year archive is v2 (NG6). Year context elsewhere: implied only
  (stamp dates, §7.5).
- **No active year (fresh install):** before any academic year exists, the
  checklist renders all-pending with a calm notice banner — "No active
  academic year yet — the office will activate enrollment soon." — and step
  sheets open with **no actionable affordances** (no apply/upload/join;
  read-only step content only). The all-set banner never appears. This is the
  first-run counterpart of the rollover notice (same visual treatment; the
  admin side of the same state is `admin-page-spec.md` §5.3).
- Loading: skeleton cards matching the checklist (no spinner flash); errors:
  inline banner with Retry.

### 7.5 Academic year — hidden
No year label anywhere on the student page (explicit decision). Context comes
from content: stamp dates, the step-3 form, the enrollment success message.
Rollover notice (§7.4) is the only year-aware copy.

### 7.6 Notifications (bell)
- **Bell** in the app header (right), red unread badge with count; badge
  animates (spring scale) on change.
- **Events (v1):** step verified (stamp), queue joined / position update,
  department queue opened/closed (for joined students), enrollment
  completed.
- Click → **panel** anchored to the bell (`transform-origin` on the trigger,
  `damping 1.0, response 0.4`, enters/exits from the trigger — `design.md`
  §5.7, §6.3): newest first; each row = title, body, time, and for
  verification events a "View" action that opens the step sheet with the
  stamp landing.
- **Swipe-to-dismiss** individual items (mobile-native; `swipeleft`-type
  handling must keep continuous tracking per `design.md` §5.10 — use drag
  distance/velocity, not a final-state recognizer); **mark-all-read** button
  clears the badge; opening the panel marks items read by default.
- Generic notification component (reused across roles; v1 wires the student
  events only).

### 7.7 Theme
- **Default: light, always** (same rule as officers). Dark mode = opt-in
  preference in the existing Settings page; no in-page toggle.
- Honor `design.md` §5.13: `prefers-reduced-motion` (cross-fades, no
  springs/slides/confetti), `prefers-reduced-transparency` (solid surfaces,
  drop blur), `prefers-contrast: more` (near-solid backgrounds + defined
  borders).
- No abrupt brightness jumps on theme change.

### 7.8 Accessibility & keyboard
- Contrast: navy on dirty-white for primary text ≥ 4.5:1; muted ≥ 4.5:1 at
  token time (verify).
- Focus ring: navy, 2px offset, never removed; full keyboard path on desktop
  (Tab through cards, Enter opens sheet, Esc closes).
- Bottom sheets: focus-trapped; `aria-modal`; backdrop click + Esc dismiss;
  focus returns to the opening card.
- Upload slots: keyboard-accessible file buttons; `aria-live` for upload
  progress/error states.
- Stamps: `alt`-style accessible name (officer name + date); `aria-live`
  announces verify/return results.
- Touch targets ≥ 44px; hit padding ~10px around taps.
- Motion never carries information alone (§7.2); reduced-motion cross-fades
  everywhere (§7.8).

### 7.9 Performance
- Animate only `transform`/`opacity`; `will-change` only where motion is
  imminent (`design.md` §5.9).
- Thumbnails: server-resized variants; lightbox loads full image lazily.
- Chat streaming: incremental text via SSE — no layout thrash (fixed bubble
  width, `overflow-wrap`).
- One aggregate query per surface (`erpsys-spec.md` §10); checklist is a
  single read.

---

## 8. Motion Table (values are authoritative)

| Interaction | Spring / easing | Values |
|---|---|---|
| Checklist cards (entry), progress fill, pill/badge count, tab indicator | critically damped | `damping 1.0`, `response 0.3–0.4` |
| All-set banner arrival + ready-card pulse | critically damped | `damping 1.0`, `response 0.4`; cross-fade under reduced motion |
| Bottom sheet (enter/exit + drag) | sheet spring, velocity handoff | `damping 0.8`, `response 0.3`, same path both ways; rubber-band at bottom edge |
| Bell panel / popovers | reposition | `damping 1.0`, `response 0.4`, anchored to trigger |
| Stamp landing (step verified) | momentum spring | `damping 0.8`, `response 0.3`, scale+rotate from press origin |
| Position number update (queue) | spring scale | `damping 1.0`, `response 0.4` |
| Press states | CSS transition | `transform: scale(0.97)`, 100ms ease-out, pointer-down |
| Empty states / static reveals | cross-fade | 200ms opacity |
| Enrollment confetti | scripted burst | ≈2.5–3s, restrained palette; static check + cross-fade under reduced motion |
| Reduced motion | all of the above → | short opacity cross-fades only (confetti → static check) |

Bounce appears **only** where user/officer action carried momentum (sheet
drag, stamp tap). Nothing decorative bounces (`design.md` §4.8, §5.3).

---

## 9. Component Inventory

New components (Svelte 5 runes, in `apps/web/src/components/student/`):
`StudentTabBar` (Progress / Chat), `ProgressHeader` (pill + bar),
`OutsideOrgBanner`, `StudentNumberPrompt`, `StepChecklist`, `StepCard`
(chip + hint + chevron + returned preview), `AllSetBanner` (ready-to-queue
banner + CTA + done state), `StepSheet` (draggable shell),
`RequirementsList`, `ApplyDialog`, `EvidenceSlot` (instant upload + progress
+ inline retry + replace), `EvidenceLightbox` (simplified), `GoogleFormPanel`
(link + email hint + no-form notice), `DepartmentQueue` (department cards +
join + position), `NotificationBell` + `NotificationPanel`, `StampDisplay`
(shared rendering contract — imported/copied from the officers surface,
§6.7), `EnrollmentSuccess` (confetti screen), `ChatTab` (suggestion chips +
streaming bubbles), `ToastStack`, `EmptyState`.

Modified: existing `Header` gains the progress pill + bell slot;
`UserMenu` unchanged (student number is not edited there — it's read-only).

---

## 10. Implementation Notes

- Route: `apps/web/src/routes/dashboard/+page.svelte` (existing); role guard
  `STUDENT` with redirect to role-appropriate surfaces.
- Data: `orpc.student.*` (`getMySteps`, `applyAssessment`, `getProfilingForm`,
  `uploadEvidence`, `getMyQueueStatus`) + `orpc.notifications.*`
  (`listMine`, `markAllRead`) + `orpc.chatbot.ask` (SSE stream). TanStack
  Query keys `["student", "steps"]`, `["student", "queue"]` with
  `refetchInterval`; invalidate on local mutations.
- Identity: student-number derivation is a sign-in-side concern (parse email
  local-part); the page consumes `studentProfile.studentNumber` — if missing,
  render the prompt (§5.3).
- Styling: Tailwind v4 `@theme` tokens per §7.1; translucent materials via
  `backdrop-filter` utilities; `prefers-reduced-*` overrides at component
  scope (`design.md` §7.2).
- Motion: `svelte/motion` springs (`design.md` §7.1); sheet drag via Pointer
  Events + capture with velocity history; no new animation dependency unless
  velocity-blended sheet retargeting demands it.
- Uploads: UploadThing Svelte adapter with progress events
  (`erpsys-spec.md` §8); delete/replace = delete `Upload` row + re-upload
  (replaceable-until-stamped rule enforced server-side).
- Confetti: small dependency (e.g. `canvas-confetti`) or hand-rolled canvas;
  disabled entirely under reduced motion.

---

## 11. Divergences & Open Questions (TODO)

1. **`Returned` status rendering (student side).** The officers spec
   superseded the binary PENDING/VERIFIED model with reply flows
   (`sbo-officers-page-spec.md` §6.4, §11.1). This spec renders the student
   side (amber chip, reply preview on card, reply chips/note on sheet,
   corrective re-apply/re-upload). **Requires the system spec
   (`erpsys-spec.md`) to adopt a `RETURNED` status + reply persistence —
   flagged.**
2. **Step-3 no-form state** (notice card, no affordances) is fixed; whether a
   "notify me when available" toggle is worth a notification event type is
   deferred (user chose the minimal card; revisit after real use).
3. **Step-2 FB pages list source.** "Same list shown to everyone" — is it
   seeded static content or admin-editable data? Not a UI question; flagged
   for the data model. The sheet renders whatever the API returns.
4. **Chat session history.** Spec: stateless per request (v1). In-memory
   retention across tab switches while the app is open is a cheap win —
   decide during implementation; no server persistence either way.
5. **Student-side audit visibility.** Fixed: stamp + verified-by line only
   (no full timeline, §6.7). If officers need students to see more (applied
   time, upload time), add later — spec keeps the door open.
6. **Re-apply semantics after Returned (step 1).** "Apply again" resets to
   `Applied`; whether that clears/keeps the reply is a data-model question
   (recommend: keep the reply visible until the next stamp).
7. **Pull-to-refresh vs. polling only.** Pull-to-refresh is spec'd; confirm
   it plays well with the SvelteKit/TanStack setup during implementation
   (fallback: refresh button in the header).
8. **Outside-org student numbers.** Duplicate-number handling is spec'd
   (inline error); whether outside-org students *must* have a number to
   proceed (blocking vs. dismissible prompt) is undecided — current spec:
   dismissible, re-appears until saved.
9. **Post-enrollment banner state.** Spec'd as a calm "You're enrolled —
   all steps complete" flip with no CTA (§5.4.1); alternatively it could
   hide entirely once the success screen (§6.8) has shown. Confirm during
   real-user testing — the flip keeps the checklist self-explanatory
   (a missing banner might read as a bug).
10. **Instructor stamp graphics.** v1: the step-6 stamp is text-only
    (instructor name + date) — instructors have no "My stamp" config, unlike
    officers (§6.7). Extend the officers' config surface to instructors if
    the visual stamp matters on step 6 — not a blocker, flagged.
11. **No-active-year state (fresh install).** Added to §7.4: all-pending
    checklist with a notice banner and non-actionable step sheets until an
    admin activates a year. Previously undefined — first-run was conflated
    with rollover. Flagged by the spec-connectivity review.

---

## 12. Verification & Review

- Interactive prototype review per `design.md` §17: frame-by-frame pass on
  the stamp landing and sheet drag; slow-motion review of the progress pill
  and badge springs; confetti burst timing.
- Mobile pass on real devices (small + large phones): touch-target audit,
  bottom-sheet drag feel, keyboard/tab bar interplay, upload progress on slow
  networks (inline retry path).
- Reduced-motion / reduced-transparency / high-contrast passes (stamp
  landing → cross-fade; confetti → static check).
- Real-user test: a student completing steps 1–5 on a phone, receiving a
  return-reply and a stamp mid-session, joining a queue and watching the
  position move, then the enrollment success screen.
