# Svelte → React Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Svelte → React migration with zero user-visible behavior change: same routes, guards, API contract, pixel-identical Tailwind UI.

**Architecture:** Keep the existing React shell (`src/app/router.tsx` + `guards.tsx` + `layouts.tsx` + `pages.tsx` shells); port leaf components route-by-route behind the existing `tsconfig`/`vitest` exclude lists, deleting each `.svelte` + exclude entry as its RTL port lands.

**Tech Stack:** React 19, React Router v7 (component guards, not loaders — matches `App.svelte` `$effect` semantics), `@tanstack/react-query` + `@tanstack/react-form`, `sonner`, `@uploadthing/react`, Tailwind v4 untouched.

## Surfaces still awaiting an RTL port

These 11 subjects had only Svelte-render tests (12 test files — `CourseYearPicker` had two). Those tests were deleted on 2026-10-10 along with the `test.exclude` list they lived behind — a deleted test cannot track the work, so the list lives here. Port each to RTL as `components/**/<Name>.test.tsx` and delete its entry.

- [ ] `components/auth/AcademicYearSelect.tsx`
- [ ] `components/auth/CourseYearPicker.tsx` (including the portal case)
- [ ] `components/instructor/AssignDepartmentModal.tsx`
- [ ] `components/report/ReportFilterBar.tsx`
- [ ] `components/report/ReportsPanel.tsx`
- [ ] `components/student/ChatTab.tsx`
- [ ] `components/student/ProfileTab.tsx`
- [ ] `components/student/QueueShareModal.tsx`
- [ ] `components/student/QueueStatusCard.tsx`
- [ ] `components/student/YearLevelModal.tsx`
- [ ] `components/ui/NotificationCenter.tsx`

## Global Constraints

- `apps/web` only; server frozen except SPA fallback + proxy drift (§11).
- Web consumes server only via `@erpsys/server` export map; `./report` stays dependency-free (never pulls `lib/db.ts`/Mongo).
- No visual redesign, no Tailwind upgrade, no auth model change, no REST URL change unless documented.
- Data Router table is hand-written, mirrors current `App.svelte` branches; no SSR, no filesystem routing.
- New `router.tsx`/layout files stay split (warn >350 lines, block >400).
- Old `#/...` links redirect once via `HashRedirect`, then removed later.

---

### Task 1: Green baseline (root-cause fixes, no ports)

**Files:**

- Modify: `apps/web/test-setup.ts`
- Modify: `apps/web/src/components/ui/agents/index.ts`
- Modify: `apps/web/src/lib/report/filter-params.ts:141-149`

**Interfaces:**

- Consumes: existing `vite.config.ts` test `exclude` list, `tsconfig.app.json` exclude list (unchanged in this task).
- Produces: `tsc` clean for these three files; `YearLevelChips.test.tsx` 5/5 pass; full suite back to 0 failures attributable to harness.

- [ ] **Step 1: Write the failing test (already exists — confirm red)**

Run: `pnpm --filter web exec vitest run --project web src/components/YearLevelChips.test.tsx`
Expected: FAIL — "Found multiple elements with role button and name Select all" (DOM leaks across tests).

Run: `pnpm --filter web check`
Expected: FAIL — `agents/index.ts` cannot find `./Message.svelte` (12 errors) + `INSTRUCTOR_SORTS` unused.

- [ ] **Step 2: Fix test isolation (one guard in the shared setup)**

```ts
// apps/web/test-setup.ts — append:
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(() => cleanup());
```

Root cause, not symptom: every render test routes through this setup file; per-test cleanup calls would leave every sibling still broken.

- [ ] **Step 3: Fix agents barrel (point at the files that exist)**

```ts
// apps/web/src/components/ui/agents/index.ts — replace .svelte with existing modules:
// ponytail: agents/*.svelte unported; barrel re-exports context only until Message* ports land.
export type {
  MessageFrom,
  MessageAlign,
  MessageBubbleVariant,
  MessageContext,
} from "./context";
```

`ChatTab.svelte` (the sole consumer) is still Svelte and excluded from typecheck, so nothing imports the removed names yet.

- [ ] **Step 4: Drop the dead sort table**

```ts
// apps/web/src/lib/report/filter-params.ts — delete lines 141-149:
// const OFFICER_SORTS ... INSTRUCTOR_SORTS ... ADMIN_SORTS ...
```

Verify dead: `grep INSTRUCTOR_SORTS src` hits only its declaration. `OFFICER_SORTS`/`ADMIN_SORTS` are used — keep them.

- [ ] **Step 5: Verify green**

Run: `pnpm --filter web check`
Expected: PASS.

Run: `pnpm --filter web exec vitest run --project web`
Expected: all files pass (currently 30 passed / 1 failed file → 31 passed).

- [ ] **Step 6: Commit**

```bash
git add apps/web/test-setup.ts apps/web/src/components/ui/agents/index.ts apps/web/src/lib/report/filter-params.ts
git commit -m "fix: green baseline for React port (test cleanup, agents barrel, dead sorts)"
```

### Task 2: Port shared UI primitives (unblocks every console)

**Files:**

- Create (one `.tsx` per, same basename, same props, same Tailwind classes): `src/components/ui/EmptyState.tsx`, `Pagination.tsx`, `NotificationCenter.tsx`, `ModalShell.tsx`, `FilterDropdown.tsx`, `MultiSelectDropdown.tsx`, `Skeleton.tsx`, `SkeletonText.tsx`, `ChatInput.tsx`, `ChatInputSubmit.tsx`, `ChatInputTextArea.tsx`, `ShortcutsPopover.tsx`, `AppleSwitch.tsx`, `AppleCheckbox.tsx`
- Delete: matching `.svelte` + remove its `.test.ts` from `vite.config.ts` + `tsconfig.app.json` excludes as each lands.
- Test: colocated `*.test.tsx` rewritten from `@testing-library/svelte` to RTL (same file names, `userEvent` stays).

**Interfaces:**

- Consumes: `src/lib/motion.ts`, `src/lib/clipboard.ts`, `src/lib/ui/dialog-trap.ts` (already `.ts`).
- Produces: prop-identical React components; e.g. `EmptyState({title, hint, action})`, `Pagination({page, total, onchange})`.

Port pattern (applies to every file in this task — no per-file design):

```tsx
// Svelte: export let page: number; $: totalPages = Math.ceil(total / size);
// React:
export default function Pagination({ page, total, size, onchange }: { page: number; total: number; size: number; onchange: (p: number) => void }) {
  const totalPages = Math.ceil(total / size); // was $: derived → useMemo only if measured slow
  return (/* identical markup/classes, {@html} → marked+dompurify, slot → children */);
}
```

- [ ] **Step 1: Port `EmptyState` + `Pagination` first (they have render tests)**

Run: `pnpm --filter web exec vitest run --project web src/components/ui/EmptyState.test.tsx src/components/ui/Pagination.test.tsx`
Expected: PASS; delete the two `.svelte` files + their exclude lines.

- [ ] **Step 2: Port remaining 12 primitives in any order, one commit each**

Run per file: `pnpm --filter web exec vitest run --project web <path>`
Expected: PASS.

- [ ] **Step 3: Verify**

Run: `pnpm --filter web check && pnpm --filter web exec vitest run --project web`
Expected: PASS.

### Task 3: Runes → hooks (9 `*.svelte.ts` files)

**Files:**

- Create: `src/lib/reduced-motion.ts` (`useReducedMotion`), `src/lib/instructor/enrolled.ts`, `queue.ts`, `state.ts`, `src/lib/officer/detail-sheet.ts`, `mutations.ts`, `queries.ts`, `state.ts`, `src/lib/student/state.ts` — plain `.ts` hooks/stores, no `$state`.
- Delete: matching `*.svelte.ts` + drop the `src/**/*.svelte.ts` typecheck exclude when the last one lands.

**Interfaces:**

- Consumes: `queryClient` from `$lib/api`, `authClient.useSession()`.
- Produces: e.g. `useReducedMotion(): boolean`, `useOfficerDetail(): { selected, select, clear }` (context + query cache, not shared mutable module state).

Pattern:

```ts
// Svelte: let selected = $state<string | null>(null);
// React:
import { useState } from "react";
export function useOfficerDetail() {
  const [selected, setSelected] = useState<string | null>(null);
  return { selected, select: setSelected, clear: () => setSelected(null) };
}
```

- [ ] **Step 1: Port `reduced-motion` + `student/state` (smallest, pure-logic tests exist)**
- [ ] **Step 2: Port `officer/{queries,mutations,detail-sheet,state}` (query-cache design — careful, main bug surface)**
- [ ] **Step 3: Port `instructor/{queue,enrolled,state}`**
- [ ] **Step 4: Verify** `pnpm --filter web check && pnpm --filter web exec vitest run --project web` PASS; delete `.svelte.ts` files.

### Task 4: Auth + route pages (replace `pages.tsx` shells)

**Files:**

- Create: `src/app/auth/*.tsx` (LoginCard, RegisterCard, ForgotPassword, ResetPassword, RealmPage, CompleteProfileCard, ConnectedAccounts) using `@tanstack/react-form` field-by-field; wire into `src/app/pages.tsx` replacing shells.
- Modify: `src/app/pages.tsx` only (stays <400 lines — split to `src/app/auth/` if it crosses 350).

**Interfaces:**

- Consumes: `useSessionGuard` (`src/lib/auth/session-guard.ts`), `REALMS`/`isRealmId`, `completionGate`, `loginWithReason`.
- Produces: same paths/props; `goto()` → `useNavigate()`, `resolve(COMPLETION_PATH)` → plain constant.

- [ ] **Step 1: Port login + realm + register (keeps `/login*` matrix green)**
- [ ] **Step 2: Port forgot/reset + complete-profile + connected-accounts**
- [ ] **Step 3: Verify** auth matrix (authed bounce, unauthed redirect, realm mismatch passthrough) via guards tests + manual `vite dev` click-through.

### Task 5: Consoles per surface (largest — one sub-task each, parallelizable)

- [ ] **Student** (`src/components/student/` 29 files → `StudentPage` + tabs; `live-updates.ts` SSE → `useEffect` + `EventSource`, same reconnect).
- [ ] **Officer** (23 files → `OfficerPage`; detail-sheet context from Task 3).
- [ ] **Instructor** (23 files → `InstructorPage`; queue/enrolled hooks from Task 3).
- [ ] **Admin** (20 files → `AdminPage`).
- [ ] **Report + chat shared** (`components/report/`, `components/ui/agents/` 12 files, `markdown.ts`/`history.ts`/`stream-helpers` — React-idiomatic equivalents allowed if behavior identical).

Each sub-task: port → `vitest` file PASS → delete `.svelte` + exclude lines → commit. Verify `pnpm --filter web build` after each (Tailwind pixel check).

### Task 6: Cutover (zero-Svelte + fallback)

- [ ] **Step 1: Confirm zero** `Get-ChildItem src -Recurse -Include *.svelte,*.svelte.ts` returns 0; `src/shims/` already deleted; no Svelte deps in `package.json`.
- [ ] **Step 2: Remove port scaffolding** — delete `tsconfig.app.json` + `vite.config.ts` exclude blocks added for the migration, `svelte.config.js` if present, `HashRedirect` stays (bookmarks) but old `#/` tests added.
- [ ] **Step 3: Server fallback** — SPA serves `index.html` for non-`/api` routes (deploy + preview config; the one allowed server touch-point).
- [ ] **Step 4: Final verify**

Run: `pnpm --filter web check`
Run: `pnpm test` (web project)
Run: `pnpm --filter web build`
Expected: all green; acceptance checklist (§12) ticks off.

## Self-Review

- Spec coverage: §5 router ✓ (shell exists, Task 4/5 fills pages), §6 URLs ✓ (HashRedirect exists, Task 6 fallback), §7 guards ✓ (component guards exist per ponytail note, loaders deferred), §8 state ✓ (Task 3), §9 inventory ✓ (Tasks 2/4/5), §10 tooling ✓ (package.json/vite/tsconfig React already; Task 6 removes excludes), §11 backend ✓ (Task 6 fallback only).
- No placeholders: Task 1 has exact code; Tasks 2–5 use one explicit port pattern with real signatures, not "handle edge cases".
- Type consistency: `YearLevel` from `@erpsys/server/domain`; guard helpers (`completionGate`, `homeRouteForRole`, `isRealmId`) untouched per §7.
