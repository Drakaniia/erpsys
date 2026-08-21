# Admin Page — UI/UX Design Specification

**Status:** Draft for review (compiled from interviews, 2026-08-21)
**Scope:** All UI/UX decisions for the Admin surface in `apps/web` (SvelteKit + Svelte 5 + Tailwind v4), desktop-first.
**Companion docs:** `design.md` (global Apple-style motion/materials baseline — normative where referenced; see §11.12), `docs/spec/erpsys-spec.md` (system spec — see §11 divergences), `docs/spec/sbo-officers-page-spec.md` (officer side — shares the profiling-form panel and workbench chrome), `docs/spec/instructor-page-spec.md` (instructor side — adviser/department relationship this page maps), `docs/spec/student-page-spec.md` (student side — surfaces this page configures), `docs/readme.md` (original request).
**Author:** Design interview synthesis

---

## 1. Overview

The Admin page is where system administrators configure ERPSYS: role
management (student ↔ SBO officer), departments, adviser↔department mapping,
academic years, the step-1 requirements list, the step-3 Google Form link, and
the chatbot knowledge document. It is a **single desktop-first page with a
top-level tab bar** (mirroring `/officer`), built on the ERPSYS design
baseline: calm, confident, Apple-style materials and motion (`design.md` §2,
§4.8).

**Core model:** this page *configures* the system; students and officers
*consume* it. Most edits are **live** — a saved change is immediately visible
to students (requirements list, profiling form link, chatbot doc). The page
is deliberately not an operations surface: no verification queues, no queue
processing (those live on `/officer` and `/instructor`, which admins reach
through a header role-switcher).

**Emotion:** calm and confident (`design.md` §4.8). A precise control room —
dense but unhurried — where the meaningful moments are deliberate,
consequence-aware confirmations (role changes, year activation).

**Role derivation (critical):** roles are **domain-derived at sign-in**, not
manually assigned — `@student.buksu.edu.ph` → Student (promotable to SBO
Officer by an Admin), `@buksu.edu.ph` → Instructor/Enrollment Adviser
**automatically** (no admin action; example address: `alistairybad6@buksu.edu.ph`).
Admins are bootstrapped from the env list (`ADMIN_EMAILS`). The admin's only
role lever is **promoting/demoting students ↔ SBO officers** (§6.2).

---

## 2. Goals & Non-Goals

### Goals
- **G1 — Configure everything in one place.** Every system-level setting the
  roles depend on lives on this page: users, departments, mapping, years,
  requirements, form link, chatbot doc.
- **G2 — Consequences are legible.** Role changes and year activation are
  irreversible-feeling acts; each carries a confirm dialog that states what
  the change *does* (access granted, stamps retained, steps reset).
- **G3 — Live edits, honest freshness.** Student-facing content updates
  immediately (edit = live); the page shows updated-by/time so concurrent
  admin work is visible.
- **G4 — Health at a glance.** The overview tab answers "how is the term
  going" — role counts, active year, step progress, enrollment tallies —
  without leaving the page.
- **G5 — Safe by default.** No destructive deletion, no self-lockout:
  departments soft-deactivate, years with data are locked, the last admin and
  self-demotion are guarded.

### Non-Goals (v1)
- **NG1 —** No student lookup (search a student, see their step status) —
  explicit decision; student data lives on officer surfaces (§11.3).
- **NG2 —** No notification bell — explicit decision, mirrors the instructor
  page (NG3 of that spec); tab badges and the overview carry the signal.
- **NG3 —** No version-history UI for the chatbot document (server keeps
  `ChatbotKnowledge.version`; no in-app restore — §11.7).
- **NG4 —** No draft/publish staging — edits are live (explicit decision,
  §6.6).
- **NG5 —** No admin promotion in the user list — admins come from the
  `ADMIN_EMAILS` bootstrap only (§11.1).
- **NG6 —** No theme-settings page (exists elsewhere; referenced only).
- **NG7 —** No hard deletion of departments or non-empty years (§6.3, §6.4).

---

## 3. Users & Access

| Who | Access |
|---|---|
| **Admin** (`role: ADMIN`) | Full admin page. |
| Student / SBO Officer / Instructor / outside-org | Route-guarded out. |

Route: **`/admin`**. Role guard requires `ADMIN`; otherwise redirect to the
role-appropriate surface with the standard session handling used by
`/dashboard`, `/officer`, and `/instructor`.

**Role-switcher (header):** the app `Header` gains a surface-switcher menu,
visible only to admins, listing **Student / Officer / Instructor / Admin**.
This is the admin's path to the officer and instructor surfaces they are also
allowed to use (their procedures are role-guarded `SBO_OFFICER, ADMIN` and
`ENROLLMENT_ADVISER, ADMIN`). Other roles keep their existing single-surface
navigation; the switcher is admin-only chrome.

**First-run:** a fresh install has no `AcademicYear`, no departments, and no
users beyond the bootstrapped admin. The page shows a **guided blocking
banner** (§5.3) until the first academic year is activated.

---

## 4. Information Architecture

**Single route** `/admin`, one top-level tab bar. State is URL-addressable:
`/admin?tab=users` — tab survives reload and is back-button friendly. (The
officer page keys its tabs by `?step=`; the admin page uses `?tab=` because
sections are not numbered steps.)

```
/admin
├── [Overview]          ← admin home: stat cards + recent activity + first-run banner
├── [Users]             ← role management (student ↔ officer), search/filter/paginate
├── [Departments]       ← department CRUD (soft deactivate)
├── [Adviser Mapping]   ← per-adviser department assignment
├── [Academic Years]    ← create / activate / edit current / lock past
├── [Requirements]      ← step-1 requirements list (reorder + toggle + CRUD)
├── [Profiling Form]    ← step-3 Google Form link (shared with officers)
└── [Chatbot Knowledge] ← markdown editor + live preview
```

Tab order is fixed (above). **Tab bar behavior** (mirrors officers/instructor):

- Pill/segmented tabs in a translucent material bar under the app header
  (`design.md` §5.10). Active tab: navy-filled pill; inactive: text-only.
  Active-state transition is a cross-fade of the pill background
  (`damping 1.0, response 0.3` spring on the indicator if a sliding thumb is
  used).
- **Tab badges:** only where a count is meaningful — Users shows nothing
  (search dominates); Departments/Requirements show nothing. Badges are
  **not** used for "unreviewed" signals (no bell, no pending work — NG2).
- **Keyboard:** `0`/`H` Overview, `1` Users, `2` Departments, `3` Adviser
  Mapping, `4` Academic Years, `5` Requirements, `6` Profiling Form,
  `7` Chatbot Knowledge. `?` opens the shortcuts popover. (Full set — same
  scope as the officer page, explicit decision.)
- **Page header (per tab):** tab title, **active academic-year label**
  ("AY 2026-2027 · 1st Semester", quiet, right-aligned) + manual refresh
  button. Year is display-only here — admins switch years on the Academic
  Years tab, never from the header.

---

## 5. Layout & Surfaces

### 5.1 Page shell
- Content sits under the existing app `Header`; the admin page adds the tab
  bar (translucent, `backdrop-filter` blur, no hard divider — scroll-edge
  fade mask per `design.md` §5.10).
- Max content width **~1440px**, centered (explicit decision — wider than
  the 1200px officer/instructor workbench; admin tables and editors benefit
  from the width). Generous left/right gutters on desktop.
- **Desktop-first** (admin terminals). Below ~900px the tab bar becomes
  horizontally scrollable and tables collapse to stacked cards (best-effort
  mobile, `design.md` NG1).
- All interactive targets ≥ 44px on the best-effort mobile layout; hit
  padding ~10px.

### 5.2 Overview tab
Four stat cards in a responsive grid (2–4 per row at 1440px), then a recent-
activity strip:

1. **Users by role** — four counts (Student / SBO Officer / Instructor /
   Admin) with the total; clicking a count jumps to the Users tab with that
   role filter applied.
2. **Academic year status** — active year + semester label, or a
   "No active year" state with an **Activate first year** CTA (→ Academic
   Years tab). Shows year-activation state at a glance.
3. **Step verification totals** — per-step verified counts for the active
   year (1–6, compact; e.g. five small bars + numbers). Reads "how far the
   term has progressed".
4. **Enrollment tallies by department** — per-department waiting / enrolled
   counts for the active year.

Stat cards: raised dirty-white (`--color-surface-raised`), hairline border,
press feedback `scale(0.97)` on pointer-down; entry with critically damped
springs (`damping 1.0, response 0.4`).

**Recent activity strip** below the grid: last 5 admin actions — actor name,
action ("Promoted X to SBO Officer", "Activated AY 2027-2028", "Updated
chatbot doc"), target, relative time (absolute on hover), newest first, small
type. Source: `AdminActionLog` (§11.8). Empty state: quiet line — "No admin
actions yet."

### 5.3 First-run banner (guided, blocking)
When no `AcademicYear` is active:

- A prominent but calm banner at the top of the **Overview tab** (and
  repeated as a slim strip on every tab — persistent, not a toast):
  **"No active academic year — activate one to begin."** Primary CTA
  **"Activate academic year"** → Academic Years tab.
- **Year-gated sections are disabled** until a year exists: the **Profiling
  Form** tab (a `ProfilingForm` is per-year) renders a disabled state with
  "Requires an active academic year"; overview stats 3–4 show placeholders
  ("—", no data). Users, Departments, Adviser Mapping, Requirements, and
  Chatbot Knowledge remain fully usable (they are not year-scoped).
- The banner disappears the moment a year is active (§6.4). It is a state,
  not a notification — no animation beyond a 200ms cross-fade in.

---

## 6. Core Interactions

### 6.1 Users tab — the list
Server-side search + filter + pagination (no client-side list assembly —
the user base can exceed thousands).

| Element | Detail |
|---|---|
| Search | Debounced (~300ms) query across **name, student number, email**; placeholder "Search by name, student number, or email" |
| Filters | Role (All / Student / SBO Officer / Instructor / Admin) + Outside org (All / Inside / Outside) — segmented or select controls, state in the URL (`?role=`, `?outside=`) |
| Table columns | Checkbox (bulk), Avatar (initial-based, navy-on-dirty-white), Name (ink), Student number (`tabular-nums`, "—" when unset), Email (muted), Role chip, Outside-org badge, Joined (relative + absolute on hover), Actions |
| Role chip | `STUDENT` gray · `SBO OFFICER` navy · `INSTRUCTOR` navy-outlined with an "(auto)" tooltip ("Derived from email domain") · `ADMIN` ink — the instructor/admin chips render **no action button** (roles are domain/env-derived) |
| Outside-org badge | Amber chip ("outside org") — same tint as the student page banner |
| Rows | 52–56px, hairline dividers (neutral-gray at low opacity — not black), hover = subtle dirty-white lift, selected row = navy-tinted background |
| Pagination | Server-side; default 50/page, options 25/50/100; total shown ("1,204 users") |
| Sort | Student number / joined / name; default joined newest-first |

Loading: skeleton rows (no spinner flash). Errors: inline banner with Retry,
toast for action failures.

### 6.2 Users tab — role changes
**The only role lever: student ↔ SBO officer.** (Advisers and admins are
domain/env-derived; the UI renders no affordance for them — §11.1.)

- **Per-row action:** a "Promote"/"Demote" text button (visible on hover /
  keyboard focus; always visible for clarity on small lists).
- **Confirm dialog with consequences** (explicit decision — heavier than the
  design baseline's undo-toast default; role changes grant PII access):
  - *Promote*: "Promote `<name>` to SBO Officer?" + "This grants access to
    student verification data (evidence, stamps, mugshots)." Buttons:
    *Cancel* / **Promote**.
  - *Demote*: "Demote `<name>` to Student?" + "Officer access is removed.
    Their past stamps remain attributed to them in the audit trail."
    Buttons: *Cancel* / **Demote**.
- **Bulk actions** (explicit decision — useful at term start): checkbox
  column + "select all on page"; a floating action bar appears with selected
  count — **"Promote N to officer"** / **"Demote N to student"** → same
  dialog with the count ("Promote 12 students to SBO Officer?"). Selection is
  current-page-only in v1 (§11.9).
- **Guards (server + client):**
  - **Self-demotion blocked:** demoting your own row is disabled with a
    tooltip "You cannot demote yourself."
  - **Last-admin protected:** demoting the final remaining admin is blocked
    ("At least one admin must remain") — both the action button and the
    server reject it.
  - These guards also apply inside a bulk selection (the offending rows are
    excluded and the dialog copy notes the exclusion).
- On success: toast ("Promoted `<name>` to SBO Officer"; bulk: "Promoted 12
  students") + the row's chip flips with a spring scale
  (`damping 1.0, response 0.4`). `aria-live="polite"` announces the result.

### 6.3 Departments tab
A table of departments: name, code, status (Active navy / Inactive gray
chip), mapping count, actions.

- **Add** (primary, in the tab header) / **Edit** (inline): fields **name** +
  **code** (e.g. "BSIT"). Duplicate code → inline error under the field
  (`design.md` §5.12). Save = live; toast confirms.
- **Deactivate / Activate** (soft only — explicit decision, NG7; the data
  model's `Department.isActive`):
  - Deactivate → confirm dialog: "Deactivate `<name>`?" + "Students can no
    longer join this department's queue. Queued students and past
    verifications are unaffected." Buttons: *Cancel* / **Deactivate**.
  - Activate → immediate, no confirm (nothing at stake).
  - **No hard delete in v1** — a deactivated department is hidden from
    student/queue surfaces but its history stays intact (§11.5).
- Departments shown to students at step 6 come from this list (seeded once,
    admin-editable — `erpsys-spec.md` §14).

### 6.4 Academic Years tab
A table of years: label, semester label, status chip (`Active` navy /
`Past` gray), created, actions.

| Action | Behavior |
|---|---|
| **Create** | Inline/in-modal form: year label ("2027-2028"), semester label ("1st Semester"), optional **"Activate immediately"** checkbox. Creating without activating leaves it as a future year. |
| **Activate** | Only on a non-active year. Opens the **consequences-preview confirm** (§ below). |
| **Edit** | Current (active) year only — label + semester, inline. Past years are read-only (history). |
| **Delete** | **Empty years only** (no `StepVerification`s, no queue entries, no `ProfilingForm`). Years with data show a disabled button with tooltip "Cannot delete — contains records". Deleting asks a plain confirm. |

**Activation confirm — consequences preview** (the page's heaviest moment):

- Dialog copy: "Activate **AY 2027-2028 · 1st Semester**?" then a bulleted
  preview of exactly what resets:
  - "**N students**' steps reset to pending for the new year."
  - "Previous years' stamps remain in records (archived)."
  - "Queues are cleared; students redo steps 1–6."
- Buttons: *Cancel* / **Activate year** (navy). The N is the live count of
  students with verifications in the current year (server-derived at dialog
  open).
- On activation: toast "AY 2027-2028 is now active"; the header's AY label
  updates; overview stats re-derive; the first-run banner disappears (if
  this was the first year); student pages reset to all-pending (their
  surface's concern — `student-page-spec.md` §7.4).

### 6.5 Adviser Mapping tab (per-adviser editor)
Advisers are the users whose email domain is `@buksu.edu.ph` (they derive
the role at sign-in). This tab assigns their **departments**.

- **List:** adviser-role users, each row: avatar, name, email, and their
  assigned **department chips** (navy-outlined, removable), plus an **Edit
  mapping** action.
- **Editor:** a row expands (or a panel opens) to a **multi-select of
  departments** — chip toggles from the full department list. Save persists
  the mapping; toast confirms; the instructor page picks it up on its next
  poll ("No departments assigned — contact your admin" when empty —
  `instructor-page-spec.md` §3).
- **Empty state:** "No instructors have signed in yet — instructors appear
  here after their first login with a `@buksu.edu.ph` account." (Users exist
  only after first sign-in; §11.6.)
- Search within the adviser list if it grows (~>20 rows).
- Removing all departments from an adviser does **not** demote them (role is
  domain-derived) — it just leaves their instructor page in the
  no-departments state. The confirm dialog says exactly that.

### 6.6 Requirements tab (step-1 list)
`RequirementItem` rows, in display order (the order students see at step 1):

- **Reorder:** up/down buttons per row (drag is optional polish; up/down is
  keyboard- and pointer-simple). Order persists server-side.
- **Toggle:** per-item Active switch (`<button role="switch">` with
  `aria-checked`) — inactive items are hidden from students but kept.
- **Edit:** inline label field (prefilled, save on blur/Enter).
- **Add:** input row at the bottom + Add button.
- **Delete:** confirm dialog — "Delete '<label>'? Students will no longer
  see this requirement." Destructive styling (red-tinted text button, not
  filled).
- **Edit = live** (explicit decision): a saved change is immediately what
  students see at step 1. All changes toast + invalidate the shared query
  cache.

### 6.7 Profiling Form tab (shared with officers)
Mirrors the officer surface's Profiling Form tab (`sbo-officers-page-spec.md`
§6.6) — both mutate the same per-year `ProfilingForm` record; the component
is shared, not duplicated:

- **No form set:** empty state + "Add Google Form link" → inline editor
  (URL field + Save; copy notes the form must collect the respondent's
  Google email).
- **Form set:** card with the URL (opens in new tab), set-by / updated time,
  **Edit** (prefilled) and **Remove** (confirm — destructive) actions.
- One form per academic year; **tab disabled** (with the §5.3 note) when no
  year is active.
- **Concurrency:** two admins (or an admin + an officer) editing the same
  year's link — last-write-wins; the card shows who updated it last and
  when, so the state is legible. `updatedById`/`updatedAt` recorded.
- Edit = live: students see the new link immediately.

### 6.8 Chatbot Knowledge tab
The `ChatbotKnowledge.content` markdown document that grounds the Groq
chatbot (injected into the prompt — `erpsys-spec.md` §8):

- **Split editor:** markdown textarea (or editor) left, **live preview**
  right (rendered), at ~1440px. Below ~900px: toggle between Edit/Preview.
- **Save:** explicit Save button; dirty state shown (an unsaved-dot on the
  tab or button label "Save (unsaved)"). Saving bumps `version`
  server-side and is **live** — the chatbot answers from the newest saved
  content.
- **Meta line:** last updated by `<name>` · `<relative time>` · version N.
- **Unsaved-changes guard:** switching tabs/leaving with unsaved edits →
  confirm "Discard unsaved changes?" (*Cancel* / **Discard**).
- Word count (small, muted) to sanity-check document size.
- No version-history UI in v1 (NG3); the version field is server-side
  bookkeeping (§11.7).
- Error state (save failure): inline error + the edits are **preserved** in
  the editor — nothing is lost on retry.

---

## 7. System-wide Decisions

### 7.1 Color language — 60 / 20 / 10 + 10 (same as all other surfaces)
| Share | Role | Tailwind tokens |
|---|---|---|
| 60% | **White / dirty white** — background, surfaces, cards | `--color-surface`, `--color-surface-raised` (`#f7f6f3`-family) |
| 20% | **Navy blue** — primary actions, active tab, chips, links, focus rings, active-year chip, open status | `--color-primary` (`#1e3a5f`-family) |
| 10% | **Black** — primary text | `--color-ink` |
| 10% | **Neutral gray** — secondary text, dividers, disabled chrome, past chips | `--color-muted`, `--color-border` |

Semantic on top: `error` (red) for destructive actions and failures;
`warning` (amber) for the outside-org badge and consequence emphasis in
confirm dialogs. **No green in the status language** (discipline,
`design.md` §4.7). Dark mode: same ratios inverted; opt-in via Settings (out
of this spec's scope).

### 7.2 Status language
| State | Expression |
|---|---|
| Role — Student / Officer / Instructor / Admin | Gray / navy / navy-outlined (+ "(auto)") / ink chips; instructor & admin chips have no action |
| Outside-org user | Amber chip in the user row |
| Active year | Navy chip "Active" |
| Past year | Gray chip "Past" (read-only) |
| Department active / inactive | Navy "Active" / gray "Inactive" |
| Requirement active / inactive | Switch on/off |

Motion never carries information alone — every state is color + shape +
label (`design.md` §4 Craft).

### 7.3 Typography
- System font stack (`system-ui`); `design.md` §5.11: negative tracking on
  headings (`-0.02em`), body near `0`; tightened leading in tables.
- **`tabular-nums`** everywhere numbers must align/read: student numbers,
  counts, versions.
- All spacing `rem`/`em` — layout scales with the user's text-size setting.

### 7.4 Data freshness
- **No polling on admin lists** (explicit — config data is static; polling
  would be noise). Every list uses `refetchOnWindowFocus` + a manual refresh
  button (spins while fetching).
- **Overview stats poll** `refetchInterval` ~30s (the one live-ish surface:
  role counts, step totals, enrollment tallies) + focus refetch.
- Mutation success invalidates the affected query keys immediately (edit =
  live semantics).
- Loading: skeleton rows/cards matching the active view; errors: inline
  banner with Retry; action failures: toast.

### 7.5 Notifications — none (explicit decision)
**No bell on the admin page** (mirrors the instructor page, NG2). The
overview stats and tab content carry everything the admin needs; a bell
would duplicate the page's own surface. The generic notification component
for student/officer surfaces stays untouched.

### 7.6 Chrome & keyboard (mirrors officers, full set)
- **AY label** in the page header (right-aligned, quiet, display-only) —
  same as `sbo-officers-page-spec.md` §4.
- **Shortcuts** (documented in the `?` popover, one-time hint on first
  visit): `0`/`H` Overview, `1`–`7` tabs (order in §4), `J`/`K` or ↑/↓ rows
  (user list, requirements, mapping), `Enter` open/edit/confirm, `Esc` close
  dialog/sheet/popover, `?` shortcuts.
- Focus ring: navy, 2px offset, never removed (`design.md` §4 Craft).

### 7.7 Theme
- **Default: light, always** (same rule as every other surface). Dark mode =
  opt-in preference in Settings; no in-page toggle.
- Honor `design.md` §5.13: `prefers-reduced-motion` (cross-fades, no
  springs/slides), `prefers-reduced-transparency` (solid surfaces, drop
  blur), `prefers-contrast: more` (near-solid backgrounds + defined borders).
- No abrupt brightness jumps on theme change.

### 7.8 Accessibility
- Contrast: navy on dirty-white ≥ 4.5:1; muted ≥ 4.5:1 at token time
  (verify).
- Confirm dialogs: focus-trapped, `aria-modal`, Esc + backdrop click
  dismiss, focus returns to the trigger.
- Switches: real `<button role="switch">` with `aria-checked` + visible
  label.
- Inline validation errors (duplicate code, duplicate student number in
  search contexts): `aria-live` announcement + visible inline message
  (`design.md` §5.12).
- `aria-live="polite"` announces: role changes, activation, saves, deletes,
  bulk actions.
- Touch targets ≥ 44px on the best-effort mobile layout.
- Motion never carries information alone (§7.2).

### 7.9 Performance
- Animate only `transform`/`opacity`; `will-change` only where motion is
  imminent (`design.md` §5.9).
- Server-side pagination/search on the user list (never ship the whole user
  table to the client); overview stats are one aggregate read per card.
- Chatbot preview renders on the client (marked-safe markdown); no heavy
  media on this surface.

---

## 8. Motion Table (values are authoritative)

| Interaction | Spring / easing | Values |
|---|---|---|
| Tab indicator, stat cards (entry), chips, badge/count changes | critically damped | `damping 1.0`, `response 0.3–0.4` |
| Confirm dialogs (enter/exit) | modal scrim + spring | `damping 1.0`, `response 0.3`; cross-fade under reduced motion |
| Toasts (role change, activate, save, delete) | reposition | `damping 1.0`, `response 0.4`, anchored bottom/top; no bounce |
| Popovers (shortcuts `?`) | reposition | `damping 1.0`, `response 0.4`, anchored to trigger |
| First-run banner arrival | cross-fade | 200ms opacity |
| Press states | CSS transition | `transform: scale(0.97)`, 100ms ease-out, pointer-down |
| Empty states / static reveals | cross-fade | 200ms opacity |
| Reduced motion | all of the above → | short opacity cross-fades only |

Bounce appears **only** where the user's action carried momentum — and this
page has no gesture-driven surfaces. Nothing decorative bounces
(`design.md` §4.8, §5.3).

---

## 9. Component Inventory

New components (Svelte 5 runes, in `apps/web/src/components/admin/`):
`AdminTabBar` (tabs + badges + disabled state), `OverviewStats` (stat card
grid), `StatCard` (clickable → filtered tab), `ActivityStrip`,
`FirstRunBanner` (blocking year CTA + slim per-tab strip),
`UserTable` + `UserRow` (checkbox, identity, role chip, outside badge,
actions), `RoleChip` (+ instructor "(auto)" tooltip), `OutsideOrgBadge`,
`UserSearch` + `RoleFilter`, `RoleChangeDialog` (consequences copy,
count-aware for bulk), `BulkActionBar` (floating selection bar),
`DepartmentTable` + `DepartmentForm` (inline add/edit, duplicate-code
validation), `AdviserMappingList` + `AdviserRow` (department chips +
multi-select editor), `AcademicYearTable` + `YearForm`,
`ActivateYearDialog` (consequences preview), `RequirementList` +
`RequirementRow` (reorder + toggle + inline edit + delete),
`ProfilingFormPanel` (**shared** with the officer surface — imported, not
duplicated), `ChatbotEditor` (split markdown/live-preview, dirty state,
unsaved-changes guard), `ShortcutsPopover`.

Shared (imported, not duplicated — consistent with how the surfaces reuse
stamp/notification components): `ConfirmDialog`, `ToastStack`, `EmptyState`,
`SkeletonRows`.

Modified: `Header` gains the **role-switcher** (admin-only surface menu) and
the **AY label slot** (reused from the officer layout).

---

## 10. Implementation Notes

- Route: `apps/web/src/routes/admin/+page.svelte`; role guard `ADMIN`
  mirroring the `/officer` pattern.
- Data: `orpc.admin.*` procedures (`listUsers`, `setRole`, departments CRUD,
  adviser↔department mapping, academic year CRUD/activate,
  `listRequirementItems`/`upsertRequirementItem`, `updateChatbotKnowledge`,
  `upsertProfilingForm`) + new: bulk role change, requirement reorder,
  overview stats aggregates, admin-actions log (see §11). TanStack Query keys
  per tab (`["admin","users"]`, `["admin","departments"]`, …) with focus
  refetch; overview `refetchInterval` 30s; invalidate on mutation.
- URL state: `?tab=`, `?role=`, `?outside=`, `?q=`, `?page=` — one source of
  truth.
- Styling: Tailwind v4 `@theme` tokens per §7.1; translucent materials via
  `backdrop-filter` utilities; `prefers-reduced-*` overrides at component
  scope (`design.md` §7.2).
- Motion: `svelte/motion` springs (`design.md` §7.1); no new animation
  dependency (no gesture-driven surfaces — §8).
- Role derivation: server-side (email-domain check at sign-in) — the client
  renders chips/actions from the session's role and `isOutsideOrg` only.

---

## 11. Divergences & Open Questions (TODO)

1. **Role model vs `erpsys-spec.md` §3.** The user clarified the adviser
   role: **anyone signing in with `@buksu.edu.ph` automatically becomes an
   Enrollment Adviser (Instructor)** — no admin assignment needed; and the
   admin's *only* role lever is student ↔ SBO officer. Admin promotion stays
   env/bootstrap (`ADMIN_EMAILS`). The system spec's "Admins manage
   promotions" wording should be reconciled to this domain-derived model.
2. **Confirm-with-consequences vs undo-toast.** The design baseline
   (`design.md` §4 Agency) prefers light confirms for reversible actions;
   the user explicitly chose the heavier confirm dialog for role changes
   (PII access at stake) and for year activation (irreversible-feeling).
   Recorded as an explicit decision.
3. **No student lookup** (explicit). System spec §9's admin surface list
   doesn't include it; this spec keeps it out. If admins need
   "where is this student stuck?" later, add a read-only lookup tab.
4. **Bulk role change is a new API surface.** `erpsys-spec.md` §7 lists
   `setRole` (single); this spec adds multi-select bulk promote/demote —
   needs a bulk variant (e.g. `setRoleBulk(ids, role)`) + the guards in
   §6.2 enforced server-side.
5. **Department soft-deactivate only** (explicit). No hard delete in v1;
   system spec's `Department.isActive` already supports it. Behavior for
   students *already queued* under a deactivated department is a data-model
   question: recommended — they stay queued and are still served; only new
   joins stop. Flagged.
6. **Adviser mapping only for signed-in users.** Users are created at
   sign-in, so an adviser who has never logged in cannot be mapped yet.
   The mapping tab shows an explanatory empty state; whether the admin needs
   a "pre-register by email" affordance is a v2 candidate.
7. **No chatbot version-history UI** (explicit). The `version` field stays
   server-side bookkeeping; in-app view/restore is a later option.
8. **Recent-activity strip needs a log source.** No `AdminActionLog` model
   exists in `erpsys-spec.md` §6. Flagged: a lightweight
   `AdminActionLog` (actorId, action, targetRef, at) or reuse of
   `updatedBy`/`verifiedBy` fields. Also: whether the strip should include
   *officer* stamp actions or only admin actions — v1: admin actions only.
9. **Bulk selection is current-page-only** in v1 (cross-page selection
   needs a stable selection store — later option).
10. **Requirements reorder is a new semantic.** System spec has no ordering
    mutation; needs `order` updates on `RequirementItem` (or a reorder
    procedure). The step-1 student view already renders in order.
11. **Overview stats are new aggregate reads.** Step-verification totals and
    enrollment tallies per department are not in the system spec's admin
    router — add aggregate procedures (one per card).
12. **`design.md` (created 2026-08-21).** Previously cited-but-missing
    across every spec; now written at `docs/design.md` and grounded in the
    **`apple-design` skill** (the project's design/animation baseline per
    `AGENTS.md`). Its `§`-references are normative; values are duplicated
    inline in each spec's §8 Motion Table and §7 color/typography rules —
    keep both in sync when design.md changes.
13. **Profiling Form dual editors.** Admin tab + officer tab both edit the
    same `ProfilingForm`; last-write-wins with `updatedById`/`updatedAt`
    surfaced. No conflict resolution in v1 (optimistic concurrency is a
    later option).

---

## 12. Verification & Review

- Interactive prototype review per `design.md` §17: frame-by-frame pass on
  the confirm dialogs and stat-card entries; slow-motion review of chip
  flips and count springs.
- Keyboard walkthrough: promote a batch without the mouse
  (`1` → search → `J`/`K` select → `Enter` → `Enter` confirm), activate a
  year (`4` → `Enter` → `Enter`).
- First-run flow: fresh install → banner → create + activate first year →
  banner clears, Profiling Form tab enables.
- Guard checks: self-demotion blocked, last-admin blocked, bulk selection
  excludes guarded rows, department with data cannot be deleted, year with
  data cannot be deleted.
- Edit = live verification: change a requirement / form link / chatbot doc
  and confirm the student-side surface reflects it immediately.
- Reduced-motion / reduced-transparency / high-contrast passes (dialogs →
  cross-fade).
- Real-user test with an admin: first-run onboarding, bulk-promote a seeded
  batch of students, map instructors to departments, create + activate a
  year, edit the requirements list and chatbot doc, and verify student-
  facing impact end-to-end.
