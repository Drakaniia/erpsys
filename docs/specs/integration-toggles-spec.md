# Integration Toggles — Spec

Admins get a switch per external integration. Flipping one hides the surface in
the UI **and** closes the server-side door. Five integrations, no more:

| Key              | Integration           | What "off" means                                          |
| ---------------- | --------------------- | --------------------------------------------------------- |
| `turnstile`      | Cloudflare Turnstile  | Widget not rendered; sign-in runs unchallenged            |
| `r2`             | Cloudflare R2         | New uploads refused; reads of existing files keep working |
| `googleAuth`     | Google OAuth          | Email + password is the only sign-in path                 |
| `cloudflareChat` | Cloudflare Workers AI | Student chat tab is not rendered; stream endpoint 503s    |
| `email`          | Resend (email)        | No reset, turn or enrollment email is sent; in-app rows stay |

**Out of scope:** MongoDB, the queue-share HMAC, `PUBLIC_SITE_URL`, SSE, pdfmake,
marked/DOMPurify, Sonner, and Cloudflare Wrangler (a CLI, not a runtime
dependency). Those stay env-controlled.

---

## 1. Decisions (locked from the interview)

| Decision             | Choice                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| State location       | MongoDB document, one per integration, read through an in-process cache             |
| Effect of "off"      | Hide the UI **and** reject server-side                                              |
| Propagation          | Immediate — cache invalidated on write (single-instance assumption)                 |
| Google off           | Email + password only, period. Account-linking is off too                           |
| Turnstile off        | No widget, sign-in still works (open). Warning lives in the admin row               |
| R2 off               | New uploads blocked, existing reads/deletes keep working                            |
| Chat off             | Student chat tab not rendered at all; server 503s                                   |
| Fresh deploy default | On — except Google, which defaults on only when `GOOGLE_CLIENT_ID` is present       |
| Placement            | New **Integrations** admin tab                                                      |
| Toggle interaction   | Optimistic flip + 5-second undo toast. No modal                                     |
| Admin lockout        | Allowed. Logged to `adminActionLog`, named in the toast                             |
| Doc shape            | One doc per integration → per-key `updatedBy` / `updatedAt`                         |
| In-flight requests   | Finish what started; block the next one                                             |
| Admin editors        | Never disabled — knowledge doc, profiling form stay editable while a feature is off |
| Row content          | State + configured? + consequence when off + last changed by/at                     |
| Turnstile warning    | Inline in the admin row only. No login-screen banner                                |
| Undo window          | 5 seconds                                                                           |

---

## 2. Data model

New collection `integration_setting`, registered in `COLLECTIONS`
(`apps/server/src/lib/db/db.ts`):

```ts
integrationSetting: "integration_setting";
```

One document per integration:

```ts
type IntegrationSettingDoc = {
  _id: string; // genId("integration")
  key: "turnstile" | "r2" | "googleAuth" | "cloudflareChat" | "email";
  enabled: boolean;
  updatedById?: string;
  updatedAt: Date;
  createdAt: Date;
};
```

Indexed on `key` (unique). Add to `apps/server/src/lib/db/indexes.ts`.

**Why one doc per integration:** a toggle writes exactly one row, so two admins
flipping two different integrations never race a read-modify-write. It also buys
the per-key "last changed" the interview asked for, which a single settings blob
cannot express.

**Undocumented state is not an error.** A fresh database has no rows. Every read
falls back to the computed default (§3) rather than lazily inserting four rows on
first read — that keeps a read-only request from writing.

---

## 3. Defaults

Defaults are computed, never stored:

```ts
function defaultEnabled(key: IntegrationKey): boolean {
  switch (key) {
    case "googleAuth":
      return env.GOOGLE_CLIENT_ID.trim().length > 0;
    default:
      return true; // turnstile, r2, cloudflareChat
  }
}
```

Rationale: Turnstile, R2, and Workers AI already degrade gracefully today (empty
secret bypasses, empty token kills the chatbot), so "on" preserves today's
behaviour exactly. Google is the one that shows a visibly broken button when its
credentials are absent, so it keys off the credential.

A stored `enabled: false` always wins over a computed default. A stored row is
never deleted by this feature.

---

## 4. Server module

New file `apps/server/src/lib/platform/integration-settings.ts` (colocated with
`env.ts` / `turnstile.ts`, which are the other platform concerns). It must stay
out of `@erpsys/server`'s export map unless the web needs the key type — see §6.

```ts
export const INTEGRATION_KEYS = [
  "turnstile",
  "r2",
  "googleAuth",
  "cloudflareChat",
  "email",
] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export async function integrationEnabled(key: IntegrationKey): Promise<boolean>;
export async function allIntegrationStates(): Promise<
  Record<IntegrationKey, { enabled: boolean; updatedAt: string | null }>
>;
export function invalidateIntegrationCache(): void;
```

**Cache shape.** One module-level `Promise<Record<IntegrationKey, boolean>>`
holding the resolved flags plus an in-flight promise so a cold start does not
N-query. `invalidateIntegrationCache()` clears the slot; the next call re-reads
the four rows. A read error must **not** be cached — log and fall back to the
computed defaults, so a Mongo blip never silently disables production auth.

```ts
// ponytail: single-process cache; a second instance needs a Mongo change stream
// or a pub/sub channel behind invalidateIntegrationCache() — see §12.
```

**Writes** go through one function in the same module so the cache clear and the
audit line cannot drift apart:

```ts
export async function setIntegrationEnabled(args: {
  key: IntegrationKey;
  enabled: boolean;
  actorId: string;
}): Promise<void>;
```

It upserts the doc, invalidates the cache, and appends to
`COLLECTIONS.adminActionLog` using the same shape `admin-content.ts:27` already
writes: `{ _id: genId("admin-action"), actorId, action, targetRef, at }`.
Reuse the action-string vocabulary already in that file ("Updated chatbot doc",
"Updated profiling form") — this one reads `"Disabled Google sign-in"` /
`"Enabled Cloudflare R2 uploads"`.

**Admin lockout is deliberately not prevented.** The audit line is the record.

---

## 5. Enforcement points

Each integration gets exactly one gate. Do not sprinkle `if (flag)` across
call sites — the rule is one accessor per integration, read at the boundary.

### 5.1 Turnstile

- **Server** — `apps/server/src/lib/platform/turnstile.ts:21`. The existing
  early return `if (!secret) return { success: true }` becomes
  `if (!secret || !(await integrationEnabled("turnstile"))) return { success: true }`.
  This covers both auth paths at once, because `auth.ts:124` is the only caller.
- **Client** — `apps/web/src/components/auth/LoginCard.tsx:82`. Today
  `turnstileEnabled = turnstileSiteKey.trim().length > 0`. Change to
  `turnstileEnabled = hasFlag && siteKeyPresent`, where `hasFlag` comes from the
  public config. Both the `useEffect` that mounts `<Turnstile>` and the submit
  guard at `LoginCard.tsx:119` read that one variable, so no second edit.

### 5.2 Google OAuth

This is the sharp one: `socialProviders` is a better-auth config object built at
**module load** (`apps/server/src/lib/platform/auth.ts:65`). It cannot be
conditionally removed per request — better-auth would still mount the
`/api/auth/sign-in/social` endpoint and the callback.

Two-part fix:

1. **Client hides it.** `LoginCard.tsx:29` is `const showGoogle = googleAvailable(realm.id)`.
   Change to `googleAvailable(realm.id) && flags.googleAuth`. That also feeds
   `googleIsPrimary` and the post-failure `setShowGoogleRecovery(showGoogle)` at
   `LoginCard.tsx:139`, so the Google-rescue hint disappears too.
2. **Server rejects it.** The provider config stays as-is (so better-auth still
   registers the route and existing linked accounts are not corrupted), but the
   social sign-in endpoint is gated. Add a `hooks.after` / route guard, or —
   simpler and more honest — express it as a small Express middleware mounted in
   `apps/server/src/routes/auth.ts` **before** `toNodeHandler(auth)`:

   ```ts
   app.all("/api/auth/sign-in/social", async (_req, _res, next) => {
     if (await integrationEnabled("googleAuth")) return next();
     throw new ApiError("PRECONDITION_FAILED", {
       message: "Google sign-in is off.",
     });
   });
   ```

   The callback route `/api/auth/callback/google` is left open on purpose — a
   user mid-redirect when the flag flips must still land somewhere rather than
   hit a broken callback. The subsequent `getSession` is what gates them.

3. **Account-linking off.** `apps/web/src/app/auth-pages/accounts.tsx` hides its
   "Link Google" affordance when the flag is off. `use-google-sign-in.ts:73`
   already handles the "link" intent, so it needs no logic change — only the
   entry point disappears.

**Consequence to document:** a Google-only user with no password can no longer
sign in at all. `LoginCard`'s existing recovery copy (`signInFailureCopy`, fed by
`showGoogle`) should mention the forgot-password route when Google is off. This
is the one place the feature creates a dead end, and the copy has to say so.

### 5.3 Cloudflare R2

- **Server** — the gate belongs on **session mint only**
  (`apps/server/src/routes/v1/storage.ts`, `POST /api/v1/storage/session`).
  Block with a 503 + `R2_UPLOADS_ENABLED`-style maintenance message. Because the
  complete/status/content paths are untouched, an upload already in flight
  finishes and every existing file keeps rendering and downloading.
- **Client** — `apps/web/src/lib/storage/use-storage-upload.ts` plus the surfaces
  that own the buttons (`components/student/EvidenceSlot.tsx`,
  `components/officer/StampButton.tsx`, `components/student/EvidenceSheet.tsx`)
  hide their upload affordances when the flag is off. Downloads and thumbnails
  are unaffected.
- **Sweep** — `apps/server/src/lib/storage/sweep.ts` keeps running regardless. A
  disabled integration must not start orphaning objects.

### 5.4 Cloudflare Workers AI

- **Server** — `chatStreamHandler` (`apps/server/src/routes/chat.ts:176`) reads
  the flag **once at the top of the request** and returns the existing clean 503 +
  `CLOUDFLARE_MAINTENANCE_MESSAGE` path. Reading once at entry is what gives the
  interview's chosen semantics: a stream already streaming runs to completion,
  the next request is refused.
- **Client** — `apps/web/src/components/student/ChatTab.tsx` is not rendered when
  the flag is off, so `useChat` never mounts and no SSE connection is opened.
- **Admin** — the Chatbot Knowledge tab stays fully editable while chat is off.

---

## 6. API surface

### Public (no session)

```
GET /api/v1/integrations
→ { data: { turnstile: boolean, r2: boolean, googleAuth: boolean, cloudflareChat: boolean } }
```

Booleans only — no credential state, no `updatedBy`, no timestamps. It is
unauthenticated because the login page needs it before anyone has a session. This
is the same shape of concern as the existing `GET /api/v1/signup-options`
(`apps/server/src/routes/v1/signup-options.ts`).

Register it in `apps/server/src/routes/v1/index.ts` and add
`getIntegrations: { method: "GET", path: "/api/v1/integrations" }` to
`apps/web/src/lib/api-routes.ts` under `ROUTES.admin` — it is an admin-console
concern even though the route is public.

### Admin

```
GET  /api/v1/integrations          requireSession + requireSurface("admin")
     → { data: [{ key, enabled, configured, consequence, updatedByName, updatedAt }] }
PATCH /api/v1/integrations/:key    requireSession + requireSurface("admin")
     body: { enabled: boolean }    zod-validated with parseBody, like every other route
```

`configured` is a boolean derived from env presence, never the value itself:

| Key              | `configured` is true when                                             |
| ---------------- | --------------------------------------------------------------------- |
| `turnstile`      | `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY` both present     |
| `r2`             | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` all present |
| `googleAuth`     | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` both present            |
| `cloudflareChat` | `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` both present       |

`consequence` is a server-supplied human sentence per key, so the UI never
hardcodes behaviour and the string cannot drift from the enforcement above:

```ts
turnstile: "Sign-in and registration become unchallenged. Bots can reach the form.";
r2: "New uploads are refused. Existing files stay readable.";
googleAuth: "Email and password become the only sign-in. Google-linked accounts without a password need the reset flow.";
cloudflareChat: "The student chat disappears. Knowledge stays editable here.";
```

If the registrar outgrows the file, split it to `routes/v1/integrations/` per the
convention in `AGENTS.md`; at ~120 lines it will not.

**Export map.** The web app needs `IntegrationKey` and the response types. Add
`"./integrations": "./src/lib/platform/integration-settings.ts"` to
`apps/server/package.json` exports — but **type-only**. If that pulls the Mongo
client into the web bundle, instead declare the four keys in
`apps/web/src/lib/integrations/types.ts` and keep them in sync with a test that
asserts the arrays match. Same trap and same rule as `./report` in `AGENTS.md`.

---

## 7. Web app wiring

New `apps/web/src/lib/integrations/use-integrations.ts`:

```ts
useIntegrations(); // TanStack Query on ROUTES.admin.getIntegrations, public, no session needed
useAdminIntegrations(); // the authenticated list from the admin GET
useSetIntegration(); // the PATCH mutation
```

The public query keys on `["integrations", "public"]` with a generous
`staleTime` (a flag changes at most a few times a year — 5 minutes is plenty) so
the login page does not refetch it on every render.

**Cross-surface invalidation.** When the admin flips a flag, invalidate
`["integrations"]` (both variants). The login page is a different route tree and
may be cached in `sessionStorage` after navigation — a stale `false` there shows
a Google button that 503s. Bump a `version` in the query payload if the login
card memoises anything.

---

## 8. Admin UI — design spec

Follows `apple-design` and `antislop-ui`. **No new visual primitives and no new
dependencies.** Reuse `components/ui/AppleSwitch` for the switch,
`$lib/motion` `UI_SPRING`, and the existing `.material` / `.auth-card` /
`.bg-chrome` classes. The whole UI is one new panel file plus a small hook.

### 8.1 Tab

Add to `apps/web/src/lib/admin/tabs.ts`:

```ts
{ id: "integrations", label: "Integrations", key: "8", requiresYear: false }
```

Key `"8"` is free — `reports` is `"9"` and nothing uses `"8"`. This slot also
needs an `ADMIN_SHORTCUTS` entry and the `activeTab === "integrations"` branch in
`apps/web/src/app/admin-page.tsx`, wired to `registerRefresh` like `ChatbotEditor`
does.

### 8.2 Layout

A single-column list of four rows in one panel — **not** a four-card grid and not
a bento mosaic (antislop-ui R-05). Each row:

```
┌─────────────────────────────────────────────────────────────────┐
│  Google sign-in                          [ ●——— toggle ——— ]    │
│  Sign in and link accounts with Google.                          │
│  ─────────────────────────────────────────────────────────────  │
│  Credentials loaded · Sign-in becomes email and password only    │
│  Last changed by Ana Reyes · 3 days ago                          │
└─────────────────────────────────────────────────────────────────┘
```

Rows are separated by a hairline divider or whitespace, not by four bordered
cards. Reason: four equal cards say "these are the same kind of thing", which is
true, but they also imply equal importance and equal weight — a student-facing
sign-in method and a chat feature are not equal. A list with the consequential
integrations first is the honest hierarchy.

Order rows by blast radius, not alphabetically: `googleAuth`, `turnstile`,
`r2`, `cloudflareChat`. The two that gate _sign-in_ come first.

### 8.3 Row anatomy

1. **Name** — specific, not a category label. "Google sign-in", not "Auth".
2. **Description** — one sentence, what it does.
3. **Toggle** — right-aligned, `AppleSwitch size="md"` (`h-7 w-12` track).
4. **Meta line** — three facts separated by `·`: configured state, the
   consequence sentence, last-changed attribution.

**Configured state is a real state, so a real dot is allowed** (antislop-ui R-31)
— but one dot, no glow, no pulse. If credentials are missing the row must say so
in words ("Credentials not loaded") rather than relying on a colour alone; colour
alone fails for colour-blind users and for anyone reading a screenshot.

### 8.4 The toggle — reuse `AppleSwitch`, build nothing

**Do not write a new switch.** `apps/web/src/components/ui/AppleSwitch.tsx`
already implements every requirement of this section:

| Requirement                                  | Already handled by `AppleSwitch`                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `role="switch"` + `aria-checked`             | `AppleSwitch.tsx:116-117`                                                               |
| Accessible name                              | `ariaLabel` prop, applied when no visible `label` (`:118`)                              |
| Description wired to the control             | `aria-describedby` → `hintId` (`:119`)                                                  |
| Critically damped, no bounce                 | `useSpring(checked ? 1 : 0, UI_SPRING)` (`:36`)                                         |
| Interruptible, re-targets from current value | `useSpring` integrator reads `s.current` (`:56-70`)                                     |
| Reduced motion                               | `prefersReducedMotion()` → `setOn(target, true)`, hard snap, no travel (`:40`, `:49`)   |
| Pointer-down feedback                        | `group-active:scale-[1.06]` on the knob, `transition-transform duration-150` (`:91-93`) |
| Hit target ≥44px                             | `min-h-11` (`:123`)                                                                     |
| `busy` / `disabled` states                   | props + `aria-busy` (`:17`, `:120-121`)                                                 |

Two precedents to copy the _row_ shape from:
`apps/web/src/components/admin/RequirementList.tsx:280` (an admin screen that
already uses `AppleSwitch`) and
`apps/web/src/components/instructor/AvailabilitySwitch.tsx` (a thin wrapper that
pairs a label + description with the switch).

Usage here:

```tsx
<AppleSwitch
  checked={row.enabled}
  onchange={(next) => flip(row.key, next)}
  ariaLabel={`${row.label}, currently ${row.enabled ? "enabled" : "disabled"}`}
  busy={mutation.isPending && mutation.variables?.key === row.key}
/>
```

`size="sm"` fits the 1440px-wide admin console rows; `md` if the row reads thin.

**Optimistic only.** Flip immediately, fire the PATCH, roll back on error with a
toast. Never render a spinner inside the switch — `busy` already dims and blocks
it. And because `AppleSwitch` is controlled by the `checked` prop, the rollback
is just setting state back; the spring animates the correction from wherever it
is, which is exactly the interruptible behaviour apple-design §3 asks for.

`label` is deliberately **not** passed — the row supplies its own typography.
Passing `label` would make `AppleSwitch` swap `aria-label` for the visible text
(`:118`), losing the "currently enabled" state from the accessible name.

### 8.5 Undo toast

Sonner, 5 seconds, one action: **Undo**. It issues the inverse PATCH and
invalidates `["integrations"]`.

Copy names the consequence, because admin lockout is allowed:

- On → Off: `"Google sign-in disabled — email and password only."` + Undo
- Off → On: `"Google sign-in enabled."` + Undo
- Error: `"Could not change Google sign-in — restored."` (no Undo; it is already
  back)

The toast is the only place a confirmation lives. **No modal.** apple-design §16.2
reserves confirmation for irreversible actions, and every flip here is
reversible within 5 seconds — a dialog on top of a visible, self-evident toggle
trains admins to click through dialogs.

### 8.6 Turnstile warning

When `turnstile` is off, its row carries an inline warning line beneath the meta:

> Bot protection is off. Sign-in and registration are unchallenged.

Warning styling = the existing danger/warning token, one left-edge marker or an
icon plus text — **never** a bare red border, never a glow. It appears in place,
with no animation beyond a 100ms opacity fade. It is not a toast and not a dialog:
it must persist as long as the state does (antislop-ui R-19 — no looping motion,
and the state is not transient).

No warning on the login screen. Decided in the interview; do not add it later.

### 8.7 Accessibility

`AppleSwitch` covers the switch itself (`role="switch"`, `aria-checked`,
`aria-busy`, `min-h-11`, keyboard-reachable `<button>`). What the **panel** must
still own:

- Pass `ariaLabel` per row so the state is spoken, not just coloured. A switch
  with no accessible name is unusable with a screen reader.
- The full keyboard path is `Tab` to the switch, `Space`/`Enter` to flip — no
  extra work, it is a real `<button>`.
- The toast's Undo must be reachable by keyboard before the 5 seconds expire.
  Sonner renders actions as buttons; verify focus actually lands there.
- The configured/missing-credentials state must be stated **in words**, not only
  by the dot colour — colour alone fails for colour-blind users and for anyone
  reading a screenshot.
- The Turnstile warning line must be `role="status"` or otherwise announced, or
  at minimum be reachable in reading order directly after the switch it qualifies.
- Focus ring must survive the optimistic flip and the rollback (nothing in
  `AppleSwitch` sets `outline: none`, so the default focus ring is intact).

### 8.8 Reduced motion & transparency

**Already handled.** `AppleSwitch` reads `prefersReducedMotion()`
(`AppleSwitch.tsx:40`) and hard-snaps the knob instead of springing it (`:49`).
`AdminTabBar` does the same for the tab pill.

The panel adds nothing motion-wise. Specifically:

- **Do not animate the row entering or leaving.** Rows are static; a stagger
  would read as decoration (antislop-ui R-19, MOTION dial 1).
- The Turnstile warning appears/vanishes with a 100ms opacity cross-fade, or
  simply instantly — it is a state, not an event.
- The toast's enter/exit must cross-fade rather than slide, under reduced
  motion. This is the one motion element the panel introduces.
- If any new translucency is added it stays within the existing one-element
  budget (antislop-ui R-10). Prefer the existing `.material` / `.auth-card`
  classes over a new blur.

### 8.9 Anti-slop checklist (must all be yes)

- [ ] Not four identical cards, not a bento grid, not a table with a three-dot menu
- [ ] No glow, no blur on more than one element, no pill badges
- [ ] No decorative emoji, no `→` on any control
- [ ] Every dot marks a real state (configured / not configured)
- [ ] No endless pulse anywhere
- [ ] The layout is built around the one decision: "which integrations are live"
- [ ] Empty / loading / error states name the cause and the next action
- [ ] The one number that exists (`Last changed · 3 days ago`) is real data from
      `updatedByName` + `updatedAt`, never a placeholder

---

## 9. Edge cases

| Case                                                     | Behaviour                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fresh DB, no docs                                        | Computed defaults (§3). Reads never write.                                                                       |
| Mongo read error on the flag check                       | Log, fall back to computed defaults, do **not** cache the failure                                                |
| Missing credentials + toggle on                          | Row shows "Credentials not loaded". Feature still attempts and fails as it does today                            |
| Toggle flipped while a request is in flight              | That request finishes; the next is blocked (§5)                                                                  |
| Toggle flipped while an admin is on the tab              | Their own client refetches via `registerRefresh`; no stale pill                                                  |
| Undo pressed after the PATCH failed                      | Undo is not offered on error; the value is already restored                                                      |
| Two admins flip different toggles                        | Separate documents — no lost update                                                                              |
| Two admins flip the same toggle                          | Last write wins; both land in `adminActionLog`                                                                   |
| Google flipped off while a user is in the OAuth redirect | Callback still lands; the user is authenticated if they already had a session, otherwise they hit the reset flow |
| Google off + user has only a Google identity             | Locked out; recovery copy on the login screen points at forgot-password                                          |
| R2 off + upload in flight                                | Mint already happened → completes normally. Next mint 503s                                                       |
| Chat off + knowledge doc edited                          | Works. Knowledge persists for re-enable                                                                          |
| Server restart                                           | Cache rebuilds from the four rows on first read; state persists                                                  |
| Second server instance                                   | Not supported (§12)                                                                                              |

---

## 10. Tests

Server (`apps/server/src/routes/v1/integrations.test.ts`, colocated per
`AGENTS.md`):

- default resolution per key with no documents present
- a stored `false` overrides a computed `true` default
- `invalidateIntegrationCache()` makes a write visible to the next read
- a read failure falls back to defaults and is not cached
- PATCH writes an `adminActionLog` row and requires `admin` surface
- `GET /api/v1/integrations` (public) returns booleans and nothing else

Unit (`apps/server/src/lib/platform/integration-settings.test.ts`):

- `defaultEnabled()` per key, including Google with and without a client id
- `configured` derivation per key

Enforcement:

- `turnstile.test.ts` — flag off short-circuits before the siteverify fetch
- `storage.test.ts` — session mint 503s when off; complete/status/content still pass
- `chat.test.ts` — flag off returns the maintenance 503 without opening an upstream
  stream
- `auth` — the social sign-in middleware 503s when Google is off

Web (`*.test.tsx`, colocated):

- `LoginCard` renders no Google button and no `<Turnstile>` when the flags are off
- the Integrations tab renders four rows with correct labels and states
- flipping a toggle calls PATCH and shows the undo toast
- Undo calls the inverse PATCH
- a failed PATCH rolls the switch back and shows the error toast
- the Turnstile row shows its warning only when that integration is off

Gates before finishing: `pnpm check` and `pnpm test`, plus
`pnpm --filter web build` because this adds CSS.

---

## 11. Files

**New**

```
apps/server/src/lib/platform/integration-settings.ts
apps/server/src/lib/platform/integration-settings.test.ts
apps/server/src/routes/v1/integrations.ts
apps/server/src/routes/v1/integrations.test.ts
apps/web/src/components/admin/IntegrationsPanel.tsx
apps/web/src/components/admin/IntegrationsPanel.test.tsx
apps/web/src/lib/integrations/use-integrations.ts
```

`AppleSwitch` is reused as-is; no switch component and no new CSS file.

**Modified**

```
apps/server/src/lib/db/db.ts              COLLECTIONS entry
apps/server/src/lib/db/indexes.ts         unique index on key
apps/server/src/lib/platform/turnstile.ts the one flag read
apps/server/src/lib/platform/auth.ts      middleware for the social endpoint
apps/server/src/routes/auth.ts            mount it before toNodeHandler
apps/server/src/routes/v1/storage.ts      mint-session gate
apps/server/src/routes/chat.ts            flag read at request entry
apps/server/src/routes/v1/index.ts        register the new routes
apps/server/package.json                  export map, if the type seam is needed
apps/web/src/lib/api-routes.ts            two new entries
apps/web/src/lib/admin/tabs.ts            new tab + key "8"
apps/web/src/app/admin-page.tsx           render branch + refresh registration
apps/web/src/components/auth/LoginCard.tsx  gate Google + Turnstile
apps/web/src/components/student/ChatTab.tsx and its parent — hide when off
apps/web/src/lib/storage/use-storage-upload.ts + upload affordances — hide when off
apps/web/src/app/auth-pages/accounts.tsx  hide Link Google
```

---

## 12. Known ceiling

The cache is per-process. **Single instance only.** If a second Node process is
added, `invalidateIntegrationCache()` clears one process and the other serves a
stale flag indefinitely — which for `googleAuth` means either a dead button or a
live one after an admin killed it. The fix is one seam: subscribe to a Mongo
change stream on `integration_setting` and call the same invalidate function.
`lib/knowledge.ts` already has an `invalidateKnowledgeCache()` shape to copy.

The code carries a `ponytail:` comment naming this ceiling at the cache
declaration so the next reader does not have to rediscover it.

---

## 13. Documentation follow-ups

- `AGENTS.md` still says "Google Drive (DWD)" in the apps/server table. Google is
  now OAuth-only; storage is R2. Correct that line as part of this change.
- `docs/specs/google-drive-spec.md` is stale for the same reason — mark it
  superseded rather than deleting it.
- `.env.example` keeps the `*_ENABLED` kill switches (`CLOUDFLARE_CHAT_ENABLED`,
  `R2_UPLOADS_ENABLED`). After this feature the DB flag is the operator-facing
  control; the env vars become a boot-time floor. Note that relationship in
  `.env.example` so the two sources are not mistaken for rivals.

---

## 14. Amendment — 2026-10-27: the `email` key

Email delivery added a fifth integration row, so the "four rows" wording
elsewhere in this document describes the original design only.

| Key     | Integration | What "off" means                                                                |
| ------- | ----------- | -------------------------------------------------------------------------------- |
| `email` | Brevo       | No password reset, turn alert or enrollment-complete email; in-app rows stay     |

- **Configured** when `BREVO_API_KEY` and `MAIL_FROM` are both present.
- **No DNS:** Brevo's single-sender verification confirms one address by email,
  so the free tier works without domain records. (Resend was tried first and
  rejects every sender until a domain is verified, including its test address.)
- **Default on**, like Turnstile: an empty key simply skips delivery.
- **One gate**, in `lib/platform/mailer.ts` — every send passes through it, so the
  admin switch and the env floor cannot drift per call site.
- Off is honest about the damage: password reset becomes an office visit, because
  the link is no longer delivered anywhere.
