# Instructor Page — UI/UX Design Specification

**Status:** Draft for review (compiled from interviews, 2026-08-21)
**Scope:** All UI/UX decisions for the Instructor (Enrollment Adviser) surface in `apps/web` (SvelteKit + Svelte 5 + Tailwind v4), desktop-first.
**Companion docs:** `design.md` (global Apple-style motion/materials baseline — normative where referenced), `docs/spec/erpsys-spec.md` (system spec — see §11 divergences), `docs/spec/sbo-officers-page-spec.md` (officer-side spec — shares the workbench chrome conventions), `docs/spec/student-page-spec.md` (student side of step 6 — the queue this page serves), `docs/spec/admin-page-spec.md` (admin side — department mapping and year configuration this page consumes), `docs/open_questions.md` (availability-toggle requirement), `docs/readme.md` (original request).
**Author:** Design interview synthesis

---

## 1. Overview

The Instructor page is where faculty enrollment advisers (role
`ENROLLMENT_ADVISER`, email domain `@buksu.edu.ph`) serve the **department
enrollment queues** — step 6 of the me-card process. Students who completed
steps 1–5 join a department queue; the instructor toggles their availability
(which is what students see as "Open / Closed"), serves the FIFO queue one
student at a time, and finalizes enrollment. The COR itself is generated in a
separate university system — the page presents the student's identity so the
instructor can do that externally.

**Core model:** the page is a **per-department FIFO workbench**, not a
notification center. Each department the instructor serves is a tab; each tab
shows who is next (a spotlight card), the rest of the line, and the
availability switch that gates student joining. The page is desktop-first and
deliberately minimal: no overview, no bell, no search, no history — the queue
*is* the page. Emotion: calm and confident (`design.md` §4.8) — precise,
unhurried, with the enrollment confirm as the single meaningful moment.

**Completing an enrollment does two things in one atomic action:** the queue
entry is marked **done** (`QueueStatus.COMPLETED`) **and step 6 is stamped
`VERIFIED` by the instructor** — the same `StepVerification` record used for
steps 1–5, which is what makes the student officially enrolled (§6.4).

**Terminology:** the user's chosen UI label is **"Instructor"**. The system
role remains `ENROLLMENT_ADVISER` (`erpsys-spec.md` §3); this spec renders it
as "Instructor" everywhere in the UI (see §11.1).

**The one celebration belongs to the student.** When the instructor completes
an enrollment, the student side fires the confetti success screen
(`student-page-spec.md` §6.8). On this page the same moment is a quiet
toast — restraint (`design.md` §4.8, NG4).

---

## 2. Goals & Non-Goals

### Goals
- **G1 — Serve fast and safely.** One glance tells who's next; serving takes
  one click + one confirm, with no mouse travel and no accidental enrollments.
- **G2 — Queue-state control.** The availability switch is the instructor's
  single lever over what students see (Open / Closed). State is obvious,
  and shared-department transparency prevents double-toggle confusion.
- **G3 — Trust before the final act.** The serve card shows identity *and*
  the steps 1–5 verified summary; the confirm dialog restates the context
  because enrollment is irreversible.
- **G4 — Calm under load.** Dense but scannable lists; motion that
  communicates order changes (who's next, position moves) without distraction.
- **G5 — Dead-simple absence handling.** A student not physically present can
  be moved to the end of the line without ceremony; the queue keeps moving.

### Non-Goals (v1)
- **NG1 —** No student-side UI (separate spec), no SBO-officer features
  (stamping, evidence review), no admin features (departments, mapping,
  years) — `erpsys-spec.md` §3, §9.
- **NG2 —** No Overview/home tab, no dashboard statistics (explicit
  decision — department tabs only, §4).
- **NG3 —** No notification bell for instructors (explicit decision — tab
  badges carry the signal, §7.5).
- **NG4 —** No student search in v1 (explicit decision — FIFO + position
  numbers make the queue self-locating, §5.4).
- **NG5 —** No on-page enrollment history / "enrolled today" list in v1
  (explicit decision — the audit trail lives server-side; revisit after real
  use, §11.5).
- **NG6 —** No undo / revoke enrollment in v1 — completion is final per
  `erpsys-spec.md` §12; the confirm dialog is the safeguard (§6.4, §11.6).
- **NG7 —** No COR generation, no note fields on enrollment (explicit
  decision — confirm dialog carries no extra inputs, §6.4).
- **NG8 —** No chat, no theme settings (exist elsewhere; referenced only).

---

## 3. Users & Access

| Who | Access |
|---|---|
| **Instructor** (`role: ENROLLMENT_ADVISER`) | Full instructor page; sees only departments mapped to them (`AdviserDepartment`). |
| **Admin** (`role: ADMIN`) | Sees the instructor page too (queue procedures are role-guarded `ENROLLMENT_ADVISER, ADMIN` in `erpsys-spec.md` §7). Same UI; no role-specific chrome in v1. |
| Student / SBO Officer / outside-org | Route-guarded out. |

Route: **`/instructor`**. Role guard requires `ENROLLMENT_ADVISER` or `ADMIN`;
otherwise redirect to the role-appropriate surface with the standard session
handling used by `/dashboard` and `/officer`.

**No departments mapped** (`getMyQueues` returns empty): the page shows a calm
empty state — "No departments assigned — contact your admin." with no tab bar
(§7.4). This is the only guard of its kind; every other state is inside a
department tab.

**No active academic year** produces a **distinct** empty state — "No active
academic year — contact your admin." (queues are per-year; without a year
there is no queue at all, so this must not be conflated with the
no-departments guard above — `admin-page-spec.md` §5.3).

---

## 4. Information Architecture

**Single route** `/instructor`, one tab per department the instructor serves.
State is URL-addressable: `?dept=<departmentId>` survives reload and is
back-button friendly. There is **no Overview tab** (explicit decision) — the
tabs are the departments themselves.

```
/instructor
├── [BSIT]        ← dept tab: spotlight (next) + waiting list + availability switch
├── [BSEMC]       ← dept tab (same anatomy)
└── [BS Food Tech] ← dept tab (same anatomy)
```

**Tab bar behavior** (mirrors the officers' tab bar, `sbo-officers-page-spec.md` §4):
- Pill/segmented tabs in a translucent material bar under the app header
  (`design.md` §5.10). Active tab: navy-filled pill; inactive: text-only.
  Active-state transition is a cross-fade of the pill background
  (`damping 1.0, response 0.3` spring on the indicator if a sliding thumb is
  used).
- **Tab badge:** waiting-count chip on each department tab (navy count, or
  gray "0" when empty — chip hidden at 0 to reduce noise). Badge animates
  (spring scale, `damping 1.0, response 0.4`) when the count changes.
- **Keyboard:** `1`–`N` switch departments (tab order = mapping order),
  `S` serve the spotlight student, `J`/`K` or ↑/↓ move through the waiting
  list, `Enter` serve the highlighted row, `Esc` close dialog, `?` shortcuts
  popover.
- **Page header (per tab):** department title, **active academic-year label**
  ("AY 2026-2027 · 1st Semester", quiet, right-aligned). Year is
  display-only — instructors never switch years.

Tab order is stable (the mapping order from the API). A department with
zero waiting students keeps its tab; its tab shows the drain state (§6.5).

---

## 5. Layout & Surfaces

### 5.1 Page shell
- Content sits under the existing app `Header`; the instructor page adds the
  department tab bar (translucent, `backdrop-filter` blur, no hard divider —
  scroll-edge fade mask per `design.md` §5.10).
- Max content width ~1200px, centered; generous left/right gutters on desktop.
- **Desktop-first** (office terminals). Below ~900px the tab bar becomes
  horizontally scrollable and the spotlight/waiting list stack full-width
  (best-effort mobile, `design.md` NG1).

### 5.2 Department tab anatomy (top to bottom)
1. **Tab header row** — department name + code, queue status dot + label
   (Open navy dot / Closed gray dot — the *derived* state students see),
   waiting count ("12 waiting"), and the **"Accepting students" switch** (§6.2).
2. **Spotlight card** — the next student in line (§5.3).
3. **Waiting list** — everyone behind them, FIFO (§5.4).
4. **Drain state** replaces 2+3 when the queue is empty (§6.5).

### 5.3 Spotlight card — "Next in line"
A single large card, the visual anchor of the tab (the one thing the
instructor must see):

| Element | Detail |
|---|---|
| Label | "Next in line" (muted, small) |
| Avatar | Initial-based, navy-on-dirty-white (same as officers' rows) |
| Name | Ink, medium-weight, display-ish size |
| Student number | `tabular-nums`, muted |
| Joined time | "Joined 12m ago" (relative, muted, small) |
| Steps 1–5 summary | Compact verified summary — "All 5 steps verified" with five small navy checkmarks (or a single navy "Verified ✓" chip); renders whatever the API returns, so a partial summary is impossible in practice (join is gated server-side) but the summary is the trust check before enrolling |
| Primary action | **"Serve"** (navy, ≥48px) → opens the enrollment confirm (§6.4) |
| Secondary action | **"Not present — move to end"** (text button) → skip-to-end (§6.3) |

- Card surface: raised dirty-white (`--color-surface-raised`), hairline
  border, press feedback `scale(0.97)` on pointer-down (`design.md` §5.1).
- **Transitions:** when the spotlight student is served or moved, the card
  content cross-fades out and the new next student settles in with a
  critically damped spring (`damping 1.0, response 0.4`) sliding up from the
  list — position and spotlight stay in sync. The spotlight is never empty
  while the queue has waiting students.
- **While the confirm dialog is open**, the spotlight stays highlighted
  beneath the scrim (the action source stays visible — spatial consistency,
  `design.md` §5.7).

### 5.4 Waiting list
Rows under the spotlight, oldest first (FIFO by `joinedAt`):

| Column | Detail |
|---|---|
| Position | `#1`-style number, `tabular-nums`, navy for the next few, muted beyond ~5 (the top of the line matters) |
| Student | Name (ink) + student number (muted, `tabular-nums`) |
| Joined | Relative time ("12m ago"), muted |
| Action | "Move to end" (subtle text button, appears on row hover/selected on keyboard; also always available on the spotlight's secondary) |

- Rows 52–56px, hairline dividers (neutral-gray at low opacity — not black),
  row hover = subtle dirty-white lift.
- **New arrivals enter at the bottom** of the list (they join the end of the
  FIFO) with a short spring (`damping 1.0, response 0.4`); the tab badge and
  the header's waiting count increment with a spring scale. No "N new" chip
  (explicit simplification — students arrive at the back, which is
  self-explanatory in a FIFO).
- **Position renumbering** (after a serve or a move-to-end): numbers update
  in place with a spring (`damping 1.0, response 0.4`) — they match what the
  student sees on their own live position (§6.5 of the student spec).
- Virtualize rows if a department exceeds ~200 waiting (unlikely in v1;
  `design.md` §5.9).

---

## 6. Core Interactions

### 6.1 Data freshness
- **Auto-refresh polling:** TanStack Query `refetchInterval` ~15s on the
  department queue (`["queue", deptId, year]`) — slightly tighter than the
  officers' 20s because this page *acts* on the queue — plus
  `refetchOnWindowFocus` and a manual refresh button (spins while fetching)
  in the tab header. No SSE/websocket in v1.
- New students, position changes (from skips elsewhere), and colleague
  availability changes arrive via polling and render in place (springs
  per §5.3/§5.4). A colleague serving the same department is reflected when
  the row count drops.

### 6.2 Availability switch — "Accepting students"
The instructor's single lever over the department's join state (students see
Open / Closed per department; joining is blocked when no instructor of that
department has availability on — `erpsys-spec.md` §5).

- A real toggle (**`<button role="switch">`** with `aria-checked`), labeled
  "Accepting students", in the tab header next to the derived status dot.
- **Open (on):** the switch flips with a spring; if students are waiting, a
  toast confirms "Queue open — N waiting." Students can now join; the status
  dot turns navy.
- **Close (off) with waiting students** → **confirm dialog first** (the
  queue pauses new joins and processing; queued students stay):
  - Copy: "**N students still waiting — close anyway?** They stay queued and
    see the queue as closed until you reopen." Buttons: *Cancel* / **Close**.
  - Confirmed → switch flips, toast "Queue closed — N students remain
    queued."
- **Close (off) with zero waiting** → flips immediately, no confirm
  (nothing is at stake).
- **Colleague has the department open** → the switch area renders the
  derived state read-only: **"Open by `<colleague name>`"** (navy dot,
  muted text, switch disabled) — transparency prevents double-toggle
  confusion (§2 G2). The instructor can still open their own availability
  *after* a colleague closes theirs (the control returns once no colleague
  has it open). An instructor may always close their own availability even
  when a colleague has it open — the derived state then reflects the
  colleague's.
- **Serving while closing:** an in-progress enrollment completes normally;
  closing never interrupts the student being served (`erpsys-spec.md` §12).
- Switch press feedback on pointer-down (`scale(0.97)`); state change is the
  single beat — no decorative animation.

### 6.3 Skip-to-end ("Not present — move to end")
The next student isn't physically at the office; the line must keep moving.

- **Affordances:** "Not present — move to end" on the spotlight card
  (secondary) and per-row "Move to end" on the waiting list.
- **Behavior:** the student keeps their queue entry but is pushed to the back
  of the department's FIFO; positions renumber (spring); the next student
  rises into the spotlight; toast "Moved to end — <name>."
- **No confirm dialog** — the action is reversible in effect (the student
  keeps their place in the queue, just later) and the change is immediately
  visible. It is the one queue mutation the instructor can do besides
  enrolling.
- **Audit:** the move is logged server-side (who/when) so the queue history
  is explainable — exact payload shape TBD (see §11.2).
- Students see their new position live via their own position polling.

### 6.4 Enrollment completion (the final act)
1. Instructor presses **Serve** (spotlight or list row, pointer-down
   feedback) → **confirm dialog** opens (modal task with dimming scrim —
   `design.md` §5.10 "dim to focus"; `design.md` §4 Agency: an irreversible
   action gets a confirm).
2. Dialog restates the full context, exactly:
   - Name + student number (`tabular-nums`),
   - "Department: `<dept name>`",
   - "Semester: `<semester> <AY>`" (e.g. "1st Semester 2026-2027"),
   - the steps 1–5 verified summary line,
   - a calm note: "Enrollment is final." — **no extra input fields**
     (explicit decision, NG7).
   - Buttons: *Cancel* / **Enroll** (navy). Focus is trapped; Esc or Cancel
     dismisses; focus returns to the Serve button.
3. On **Enroll**: `completeEnrollment` fires and does **two things in one
   atomic server-side action** — (a) marks the queue entry **done**
   (`QueueStatus.COMPLETED`, `servedById`/`completedAt` recorded) and
   (b) **stamps step 6 as `VERIFIED`** (the `StepVerification` for
   `ENROLLMENT`: `verifiedById` = instructor, `verifiedAt` = now). The step-6
   stamp is the official enrollment record — the student is now officially
   enrolled (`student-page-spec.md` §6.5, §6.7). The dialog closes with a
   quick cross-fade; the student leaves the queue (row/spotlight spring out);
   the next student settles into the spotlight (§5.3); the waiting count and
   tab badge decrement (spring scale).
4. **Feedback on this page is the quiet toast:** "Enrolled — `<name>`"
   (`aria-live="polite"` announces the same). No confetti, no sound — the
   celebration is the student's success screen
   (`student-page-spec.md` §6.8). Reduced-motion: the toast is the
   feedback regardless.
5. **Idempotency:** an already-enrolled student (race with a colleague, or a
   double click) → server-side no-op; the client shows "Already enrolled —
   <name>." and the row disappears on the next poll (see §11.3).

### 6.5 Drain state — queue empty
When the last student is served (or the queue is empty on load) while the
switch is on:

- The spotlight and list collapse into a **calm empty state**:
  thin-stroke navy icon, "No students waiting", and a quiet hint —
  **"Flip the switch off when you're done for the day."** (explicit decision:
  suggest, don't auto-close — §11.7).
- The status dot still reads Open (students may join at any moment); the
  empty state and the hint are *not* a toast — they are a persistent state
  that disappears the moment a student joins (row enters at the bottom,
  spotlight fills).
- If the switch is off, the empty state drops the hint — "Queue closed — no
  students waiting." (nothing to do, nothing to suggest).

---

## 7. System-wide Decisions

### 7.1 Color language — 60 / 20 / 10 + 10 (same as officers/student)
| Share | Role | Tailwind tokens |
|---|---|---|
| 60% | **White / dirty white** — page background, surfaces, cards | `--color-surface`, `--color-surface-raised` (`#f7f6f3`-family) |
| 20% | **Navy blue** — primary actions, active tab, status-open dot, verified summary, focus rings, position numbers | `--color-primary` (`#1e3a5f`-family) |
| 10% | **Black** — primary text | `--color-ink` |
| 10% | **Neutral gray** — secondary text, dividers, muted chrome, closed dot | `--color-muted`, `--color-border` |

Semantic on top: `error` (red) for action failures (e.g. "Already
enrolled" conflict); `warning` (amber) reserved for the close-with-waiting
dialog's emphasis. **No green in the verified language** — verified is the
navy checkmark motif (discipline, `design.md` §4.7). Dark mode: same ratios
inverted; opt-in via Settings (out of this spec's scope).

### 7.2 Status language
| State | Expression |
|---|---|
| Queue Open | Navy dot + "Open" label (derived: any instructor available) |
| Queue Closed | Gray dot + "Closed" label |
| Waiting student | Gray position row, no chip |
| Student being served | Spotlight highlight + dialog open (transient; no persistent "serving" chip in v1 — §11.3) |
| Enrolled | Leaves the queue; quiet toast. Queue entry `COMPLETED` + step 6 stamped `VERIFIED` by this instructor — the official enrollment record (§6.4) |

Motion never carries information alone — every state is color + shape + label
(`design.md` §4 Craft; §7.8).

### 7.3 Typography
- System font stack (`system-ui`); `design.md` §5.11: negative tracking on
  headings (`-0.02em`), body near `0`; tightened leading in the waiting list.
- **`tabular-nums`** everywhere numbers must align/read: student numbers,
  position numbers, waiting counts.
- All spacing `rem`/`em` — layout scales with the user's text-size setting.

### 7.4 Empty states
Calm, no illustration-library art: thin-stroke navy icon, short copy, one hint:
- **No departments:** "No departments assigned — contact your admin."
- **Queue empty (open):** §6.5 (with the suggest-closing hint).
- **Queue empty (closed):** §6.5 (no hint).
- Empty states fade in (200ms cross-fade; none under reduced-motion).

### 7.5 Notifications — none (explicit decision)
**No bell on the instructor page.** The queue tabs *are* the notification
channel: tab badges (waiting counts) and the derived Open/Closed dot carry
everything the instructor needs. A bell would duplicate the page's own
surface (NG3). (The generic notification component exists for student/officer
surfaces and stays untouched.)

### 7.6 Chrome & keyboard (mirrors officers)
- **AY label** in the page header (right-aligned, quiet, display-only) —
  same as `sbo-officers-page-spec.md` §4.
- **Shortcuts** (documented in the `?` popover, one-time hint on first
  visit): `1`–`N` department tabs, `S` serve spotlight, `J`/`K` or ↑/↓
  waiting-list rows, `Enter` serve highlighted row, `Esc` close dialog, `?`
  shortcuts.
- Focus ring: navy, 2px offset, never removed (`design.md` §4 Craft).

### 7.7 Theme
- **Default: light, always** (same rule as officers/student). Dark mode =
  opt-in preference in Settings; no in-page toggle.
- Honor `design.md` §5.13: `prefers-reduced-motion` (cross-fades, no
  springs/slides), `prefers-reduced-transparency` (solid surfaces, drop
  blur), `prefers-contrast: more` (near-solid backgrounds + defined borders).
- No abrupt brightness jumps on theme change.

### 7.8 Accessibility & keyboard
- Contrast: navy on dirty-white ≥ 4.5:1; muted ≥ 4.5:1 at token time
  (verify).
- Switch: real `<button role="switch">` with `aria-checked` + visible label;
  keyboard operable.
- Confirm dialogs: focus-trapped, `aria-modal`, Esc + backdrop click
  dismiss, focus returns to the trigger (Serve / Close).
- `aria-live="polite"` announces: enrollment, move-to-end, queue open/close
  results, action failures.
- Touch targets ≥ 44px on the best-effort mobile layout; hit padding ~10px.
- Motion never carries information alone (§7.2).

### 7.9 Performance
- Animate only `transform`/`opacity`; `will-change` only where motion is
  imminent (`design.md` §5.9).
- One aggregate query per department tab (`getMyQueues`); waiting list
  paginated server-side if it ever grows past ~200 rows (virtualize).
- No heavy media on this surface (no evidence images — those live on the
  officers page).

---

## 8. Motion Table (values are authoritative)

| Interaction | Spring / easing | Values |
|---|---|---|
| Tab indicator, badge counts, waiting counts | critically damped | `damping 1.0`, `response 0.3–0.4` |
| Spotlight student change (next slides in) | critically damped | `damping 1.0`, `response 0.4`, slide-up from the list |
| Waiting rows (entry at bottom, position renumber) | critically damped | `damping 1.0`, `response 0.4` |
| Switch flip | critically damped | `damping 1.0`, `response 0.4` |
| Confirm dialog (enter/exit) | modal scrim + spring | `damping 1.0`, `response 0.3`; cross-fade under reduced motion |
| Toasts (enrolled, queue open/close, moved) | reposition | `damping 1.0`, `response 0.4`, anchored bottom/top; no bounce |
| Popovers (shortcuts `?`) | reposition | `damping 1.0`, `response 0.4`, anchored to trigger |
| Press states | CSS transition | `transform: scale(0.97)`, 100ms ease-out, pointer-down |
| Empty states / static reveals | cross-fade | 200ms opacity |
| Reduced motion | all of the above → | short opacity cross-fades only |

Bounce appears **only** where the user's action carried momentum — and on
this page there is no gesture-driven surface (no sheets, no drags). Nothing
decorative bounces (`design.md` §4.8, §5.3).

---

## 9. Component Inventory

New components (Svelte 5 runes, in `apps/web/src/components/instructor/`):
`InstructorTabBar` (dept tabs + waiting badges), `DeptTabHeader` (status dot
+ label + waiting count + refresh + switch), `AvailabilitySwitch` (role=
switch, colleague read-only state), `NextSpotlight` (serve card + move-to-end
secondary), `WaitingList` + `WaitingRow` (position, identity, move-to-end),
`ServeConfirmDialog` (context restatement, Cancel/Enroll),
`MoveToEndToast` / `EnrollToast` (shared `ToastStack`), `QueueEmptyState`
(drain + suggest-closing hint), `NoDepartmentsState`, `ShortcutsPopover`.

Modified: `Header` gains the AY label slot (or reused from the officer
layout); `ToastStack` and `EmptyState` are shared components
(imported, not duplicated — consistent with how the surfaces reuse the
stamp/notification components).

---

## 10. Implementation Notes

- Route: `apps/web/src/routes/instructor/+page.svelte`; role guard
  `ENROLLMENT_ADVISER, ADMIN` mirroring the `/officer` pattern.
- Data: `orpc.queue.*` (`getDepartments`, `getQueueStatus`, `setAvailability`,
  `getMyQueues`, `processNextStudent`, `completeEnrollment`) — TanStack Query
  keys `["queue", deptId, year]` with `refetchInterval` ~15s + manual
  refresh; invalidate on enroll / move-to-end / toggle. `completeEnrollment`
  must write the queue `COMPLETED` state and the step-6 `StepVerification`
  (`VERIFIED`) in one transaction (see §11.9).
- URL state: `?dept=` drives the active tab — one source of truth.
- Styling: Tailwind v4 `@theme` tokens per §7.1; translucent materials via
  `backdrop-filter` utilities; `prefers-reduced-*` overrides at component
  scope (`design.md` §7.2).
- Motion: `svelte/motion` springs (`design.md` §7.1); no new animation
  dependency (no gesture-driven surfaces here — §8).
- Skip-to-end needs a server-side reorder mutation (see §11.2) —
  `moveToEnd` (or equivalent) alongside the existing queue procedures.

---

## 11. Divergences & Open Questions (TODO)

1. **UI label "Instructor" vs role `ENROLLMENT_ADVISER`.** The user chose
   "Instructor" as the page/nav label. The system spec and data model keep
   `ENROLLMENT_ADVISER`. No functional impact; keep the mapping documented.
2. **Skip-to-end is a new semantic.** `erpsys-spec.md` §5 has no
   skip/requeue operation; this spec adds "move to end" (queue entry kept,
   FIFO position moved to the back, positions renumber, change logged).
   **Requires a system-spec update**: a mutation (e.g. `moveToEnd`) +
   audit logging (`movedById`/`movedAt` or a queue-event record).
3. **Multi-instructor race on serve.** Two instructors with the same
   department open can both see the same next student; both may click Serve.
   Resolution: server-side idempotent `completeEnrollment` (second attempt →
   "Already enrolled"); the `IN_PROGRESS` state in `QueueStatus` is for the
   in-flight window between confirm and completion, not a persistent UI
   "serving" lock in v1. Confirm the API shape
   (`processNextStudent` → `completeEnrollment` as one client action vs. two)
   during implementation.
4. **Move-to-end confirm?** Spec'd with no confirm (reversible in effect,
   immediately visible). Revisit if real use shows accidental skips — a light
   confirm is a cheap addition later.
5. **No history in v1** (explicit). The server audit trail
   (`servedById`, `completedAt`) exists; if instructors need an on-page
   tally for COR matching, add an "Enrolled today" list (§6.4 of this spec
   stays minimal). Revisit after real use.
6. **No undo/revoke in v1.** Completion is final per `erpsys-spec.md` §12;
   the confirm dialog is the safeguard. If mistakes surface in testing,
   mirror the officers' revoke-stamp pattern (§6.5 of that spec) — requires
   a system-spec change and a `REVOKED`/re-open path on the unique
   constraint.
7. **Suggest-closing hint copy.** "Flip the switch off when you're done for
   the day." — confirm wording with instructors during testing; auto-close on
   drain was explicitly rejected.
8. **Colleague-open read-only switch.** Spec'd as disabled + "Open by
   <name>". Confirm the instructor can always close *their own* availability
   (yes — per §6.2) and that the derived dot reflects the department, not
   their own toggle.
9. **Step-6 stamp on `completeEnrollment`.** `erpsys-spec.md` §5 originally
   defined enrollment completion via the queue without stating that the same
   action writes the `ENROLLMENT` `StepVerification` (`VERIFIED`,
   `verifiedById` = instructor). This spec fixes it: `completeEnrollment`
   atomically marks the queue `COMPLETED` **and** stamps step 6 `VERIFIED` —
   the official enrollment record, surfaced to the student as their step-6
   stamp (student spec §6.5/§6.7). **Reconciled:** `erpsys-spec.md` §5 flow
   item 6, §5 rules, §6 `StepVerification` note, and §7 `completeEnrollment`
   now carry the same transactional contract.
10. **No-active-year state.** Distinct from the no-departments guard (§3):
    no active year → "No active academic year — contact your admin."
    Previously the no-departments copy would have shown for the wrong reason.
    Fixed in §3.

---

## 12. Verification & Review

- Interactive prototype review per `design.md` §17: spotlight transitions
  (serve → next student rises), position renumbering, switch flip, dialog
  enter/exit.
- Keyboard walkthrough: serve a student end-to-end without the mouse
  (`1` → `S` → `Enter`), move-to-end with `J`/`K` + `Enter`.
- Multi-instructor simulation: two sessions on one department — verify the
  loser sees "Already enrolled" and the list converges on poll.
- Reduced-motion / reduced-transparency / high-contrast passes (dialog →
  cross-fade; spotlight change → cross-fade).
- Real-user test with an instructor: open the queue with 10+ seeded waiting
  students, serve several (watching the student-side confetti/notification
  land), move a no-show to the end, close with students still waiting
  (warn + confirm), reopen, drain to the suggest-closing state.
