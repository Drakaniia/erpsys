# Turnstile Implementation Audit & Auth UI Fix — Spec

**Status:** Draft — pending approval
**Date:** 2026-09-11
**Author:** Automated interview + codebase audit
**Related files:**
- `packages/auth/src/turnstile.ts:1` — canonical `verifyTurnstile`
- `packages/auth/src/index.ts:102` — `before` hook (siteverify call)
- `packages/auth/src/turnstile.test.ts:1`
- `apps/web/src/components/auth/Turnstile.svelte:1`
- `apps/web/src/components/auth/LoginCard.svelte:1`
- `apps/web/src/components/auth/RegisterCard.svelte:1`
- `apps/web/src/components/auth/RealmChip.svelte:1`
- `apps/web/src/hooks.server.ts:1` — CSP
- `packages/env/src/server.ts:72` / `packages/env/src/web.ts:1`
- `docs/turnstile.md:1`
- `.env` — `VITE_TURNSTILE_SITE_KEY=0x4AAAAAAEwSV9UhPGXOYZu3`, `TURNSTILE_SECRET_KEY=0x4AAAAAAEwSV0zHh808YFTTl4KHeV2_kjI`

---

## 1. Context & Request

User reported Turnstile landed but three regressions ship in dev (`pnpm run dev`, `localhost:5173`, keys set to real-looking `0x4AAAA…` values):

1. **Always "Checking your account…"** below the auth card (`apps/web/src/components/auth/LoginCard.svelte:349`).
2. **Back button hover never morphs** — `RealmChip.svelte:63` `realm-chip` stays on `accentLabel`, never shows "Back".
3. **Cannot click Sign In** even after valid email + password — button stays `disabled` when Turnstile widget is visible.

User asked: *is the turnstile implementation correct? all edge cases missing?* and wants a spec before code changes.

**Interview decisions** (3 rounds via `ask_user`):

| Question | Answer | Implication |
|----------|--------|-------------|
| `Checking…` expectation | **Remove entirely** | Delete `{#if $sessionQuery.isPending}` block; do not show status below card. Session still fetched for mismatch dialog, but UI stays silent for anonymous. |
| Back hover | **No morph at all** on desktop mouse (keyboard not tested) | Root cause is interaction/CSS, not animation curve. Must fix hover detection + spring measurement. |
| Sign In disabled | **Widget shows** (not placeholder box) but token never enables button, in **Dev localhost** since Turnstile PR | Widget renders but `onToken` never fires → `turnstileToken` stays `""`, `disabled={turnstileEnabled && !turnstileToken}` locks button. |
| Flows to protect | **Creds only** | `POST /sign-in/email` and `POST /sign-up/student` only; no Google / reset-password / sign-out. |
| Fail mode | **Retry UI** | Fail-closed + explicit retry. Never fail-open in dev except placeholder mode (see below). Show error + `Retry challenge` button when script load, error-callback, network, or siteverify fails. |
| Token lifecycle | **Recommended** | Single-use, ~5 min expiry. Auto-reset on error/expire/success; show inline `Verification expired — please complete the challenge again.` with `aria-live`. |
| Hostname/action | **Recommended (strict hard block)** | `expectedAction` (`login`/`signup`) and `hostname` allowlist must hard-block on mismatch; add prod domain to `TURNSTILE_HOSTNAMES` and Cloudflare widget when known. |
| Button UX | **Enable + validate** | Button enabled when form fields valid; Turnstile absence/error validated on submit and shown as `formError` inline + `aria-live`. Do not keep button permanently disabled. |
| A11y | **Yes** | Loading / error / expired / retry states need `aria-live="polite"` / `role="status"` / `role="alert"` and keyboard-focusable retry. |
| Audit scope | **Full audit** | This spec covers UI bugs + security edge cases (replay, bypass, secret leakage, CSP, rate limiting, etc.). |
| Placeholder | **Keep box** | When `VITE_TURNSTILE_SITE_KEY` is empty, show dashed `Verification disabled (placeholder domain…)` box (`Turnstile.svelte:140`) and server bypasses (`packages/auth/src/index.ts:106` + `turnstile.ts:32`). Explicit flag not needed. |

---

## 2. Current Implementation Review (as shipped)

### 2.1 Server — `packages/auth/src/turnstile.ts:26` & `packages/auth/src/index.ts:102`

- `verifyTurnstile(token, opts)` canonical per `turnstile-spin §9`:
  - Early returns `{success:true}` when `secret` empty (placeholder/disabled) — `turnstile.ts:32`.
  - Validates `token.length 1..2048` -> `invalid-input-response` without calling siteverify — `turnstile.ts:36`.
  - Builds `URLSearchParams {secret, response, remoteip?}` and `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `AbortSignal.timeout(10_000)` — `turnstile.ts:60`.
  - Fails closed on non-2xx (`siteverify-${status}`) and on network (`siteverify-network-error`) — `turnstile.ts:66`/`68`.
  - Validates `json.success`, then `expectedAction` mismatch -> `action-mismatch` — `turnstile.ts:81`, then hostname allowlist checks -> `hostname-mismatch` / `hostname-missing` — `turnstile.ts:90`/`100`.
- Hook in `packages/auth/src/index.ts:104` gates `ctx.path === "/sign-in/email" || "/sign-up/student"`, extracts token from `body["cf-turnstile-response"] || body["turnstileToken"] || header cf-turnstile-response`, enforces `!token -> 400 "Verification required"`, then calls `verifyTurnstile` with `remoteIp` (x-forwarded-for / cf-connecting-ip / x-real-ip), `expectedAction` (`login`|`signup`), `hostSet` from `env.TURNSTILE_HOSTNAMES`. Fails with `400 "Verification failed"` on `!result.success`.
- Bypass when `!env.TURNSTILE_SECRET_KEY` (no call, no throw) — `index.ts:106`.
- `packages/auth/src/turnstile.test.ts:1` covers 9 cases (empty, too long, success, action/host mismatch, network, non-2xx, bypass, success false).

**CSP** — `apps/web/src/hooks.server.ts:11` already allows `script-src https://challenges.cloudflare.com`, `connect-src https: https://challenges.cloudflare.com`, `frame-src https://challenges.cloudflare.com`. Production-only; dev HMR skips CSP. Correct per `docs/turnstile.md:47`.

**Env** — `packages/env/src/server.ts:72` validates `TURNSTILE_SECRET_KEY` (default `""`), `TURNSTILE_HOSTNAMES` (default `"localhost,127.0.0.1,example.com"`). Client `VITE_TURNSTILE_SITE_KEY` in `packages/env/src/web.ts:7`.

### 2.2 Client — `apps/web/src/components/auth/Turnstile.svelte:1`

- Props `{sitekey, action, onToken, onExpire?, onError?}`.
- `isPlaceholder = $derived(!sitekey || sitekey.trim().length===0)` — `Turnstile.svelte:21`. Placeholder renders dashed box and immediately calls `onToken("")` in `onMount` — `Turnstile.svelte:93`.
- `loadScript()` dedupes global `window.turnstile` or existing `<script src*="challenges.cloudflare.com/turnstile">`, appends `api.js` async+defer — `Turnstile.svelte:23`.
- `renderWidget()` calls `turnstile.render(container, {sitekey, action, theme:"light", callback:(t)=>onToken(t), "expired-callback":()=>{onToken(""); onExpire?.(); turnstile.reset(id)}, "error-callback":()=>{onToken(""); onError?.();}})` — `Turnstile.svelte:48`.
- `reset()` exported — `Turnstile.svelte:81` — calls `turnstile.reset(id)` + `onToken("")`.
- Lifecycle: `onMount` calls `loadScript().then(()=>{scriptLoaded=true; renderWidget()})` with `cancelled` flag and cleanup `turnstile.remove(id)` — `Turnstile.svelte:92`. `$effect` re-renders when `sitekey`/`action` change and `scriptLoaded && container && !isPlaceholder` — `Turnstile.svelte:122`.

### 2.3 Consumers — `LoginCard.svelte:103` & `RegisterCard.svelte:49`

- `turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY ?? ""`, `turnstileEnabled = $derived(sitekey.trim().length>0)`.
- State: `turnstileToken = $state("")`, `turnstileRef: {reset}|undefined` via `bind:this`.
- `<Turnstile bind:this={turnstileRef} sitekey={turnstileSiteKey} action="login"|"signup" onToken={(t)=>turnstileToken=t} onExpire/onError={()=>turnstileToken=""} />` — `LoginCard.svelte:295`, `RegisterCard.svelte:277`.
- `onSubmit` guards `if (turnstileEnabled && !turnstileToken) { formError="Please complete the verification challenge."; return; }` — `LoginCard.svelte:111`, `RegisterCard.svelte:56`.
- Passes `"cf-turnstile-response": turnstileToken` in `authClient.signIn.email` / `authClient.signUp.student` payload — `LoginCard.svelte:119`, `RegisterCard.svelte:68`.
- Button: `disabled={state.isSubmitting || (turnstileEnabled && !turnstileToken)}` inside `form.Subscribe` selecting `isSubmitting` — `LoginCard.svelte:317`, `RegisterCard.svelte:299`. Submit handler is `onsubmit={(e)=>{e.preventDefault(); e.stopPropagation(); form.handleSubmit()}}`.

### 2.4 RealmChip — `apps/web/src/components/auth/RealmChip.svelte:1`

- Button with `onmouseenter(()=>hovered=true)`, `onmouseleave(()=>hovered=false)`, `onfocus/blur`, `chipActive = hovered||focused`. Width spring `chipWidth` morphs between `labelW` and `backW` measured via `ResizeObserver` + `offsetWidth+24` — `RealmChip.svelte:25`.
- CSS: `.realm-chip::after { inset:-8px }` (hit-hysteresis) without `pointer-events:none` — `RealmChip.svelte:135`.

---

## 3. Bug Analysis & Required Fixes

### Bug 1 — Always "Checking your account…" — `LoginCard.svelte:349`

```svelte
{#if $sessionQuery.isPending}
  <p class="mt-3 text-center text-xs text-muted" role="status" aria-live="polite">
    Checking your account…
  </p>
{/if}
```

- `authClient.useSession()` is a tanstack-query; `isPending` is true while the initial `GET /api/auth/get-session` inflight. On anonymous cold load the request resolves to `null` user, but:
  - If Better Auth endpoint is slow / fails / never resolves (e.g., `BETTER_AUTH_URL` mismatch, cookie race), `isPending` stays true indefinitely -> permanent line.
  - Even when it resolves quickly, the line flashes on every anonymous visit (undesired; user said **remove entirely**).
  - Placement is outside the card (`mt-3`), always visible below auth component, not inside card, so it feels like page chrome not a loading state.
  - `RegisterCard.svelte` has no equivalent line — inconsistency.
- **Fix spec:** Delete the `{#if $sessionQuery.isPending}` block entirely. No replacement. The `$effect` that watches `sessionQuery` for mismatch (`LoginCard.svelte:42`) and `RealmMismatchDialog` remain functional; they already gate on `!isPending` and show dialog/inline only when `mismatch` exists. If a loading indicator is ever needed, it should be skeleton/card-level, not persistent text below card. (Interview: **Remove entirely**).
- **Acceptance:** Anonymous visits to `/login/student`, `/login/instructor`, `/login/register` show no `Checking…` text at any point. Existing mismatch flows still work (sign in -> effect -> dialog or inline dismissed state).

### Bug 2 — Back button hover never morphs — `RealmChip.svelte:63`

**Symptoms:** `hovered` never becomes true, so `chipActive` false, `chipWidth` stays at `labelW`, `realm-chip__label` opacity 1, `realm-chip__back` opacity 0.

**Hypothesized root causes (audit, not yet proven with browser repro — verify during implementation):**

1. **`::after` hit-hysteresis without `pointer-events:none`** — `RealmChip.svelte:135` expands hit area via `inset:-8px` but without `pointer-events:none`, the pseudo-element participates in hit testing in some browsers and can disrupt `mouseenter`/`mouseleave` dispatch on the button itself. Should add `pointer-events:none`.
2. **Measurement race:** `labelW`/`backW` start 0, `measuredOnce` false, `chipWidth` initialized 0. If `ResizeObserver` fires before fonts load or if `labelEl`/`backInnerEl` not yet laid out (e.g., `auth-enter` animation running, `overflow-hidden` on parent, `will-change-transform`), measurements can be 0 or stale and effect at `RealmChip.svelte:46` bails `if (!measuredOnce || labelW===0 || backW===0) return;` leaving button stuck. The `auth-enter` animation (400ms) is on the ancestor `.auth-enter` — transformed ancestors are containing blocks for fixed but also affect offsetWidth timing.
3. **Inline transition style with Svelte 5 reactivity:** The `style` attr on label/back spans uses template `{chipActive ? ...}` interpolated inside a string; Svelte 5 `$derived` updates should trigger but if `chipActive` toggles before `chipWidth` spring is ready, the `transform`/`opacity` transitions may be overridden by `chipStyle` width spring. Verify that hover still drives opacity/transform even when width spring lags.
4. **No touch fallback not relevant** per interview (desktop mouse broken), but keyboard focus (`onfocus`) should morph too — verify focus-visible path.

**Fix spec:**

- Add `pointer-events:none` to `.realm-chip::after`.
- Ensure initial measurement runs after `auth-enter` completes or after `document.fonts.ready` — already does `document.fonts.ready.then(measure)` but also add fallback `requestAnimationFrame(measure)` and ensure `labelEl`/`backInnerEl` exist.
- Make `chipStyle` derive guard not block hover: if `measuredOnce` false, still allow CSS opacity/transform morph even if width not yet sprung (width fallback `auto`).
- Add explicit `:hover`/` :focus-visible` debug: add `data-chip-active={chipActive}` for test selectors.
- Add Playwright / Vitest interaction test: hover -> expect `Back` visible, `opacity` 1, width ≈ `backW`.

**Acceptance:** Desktop mouse hover expands chip to Back width with cross-fade (label fades out/blur, Back fades in), `focus` via Tab does same, `mouseleave`/`blur` restores label. Reduced-motion path works.

### Bug 3 — Cannot click Sign In even with valid email+password — `LoginCard.svelte:317` + `Turnstile.svelte:48`

**Why widget shows but token never set (dev localhost, keys set):**

1. **Load race:** `onMount` does `loadScript().then(()=>{scriptLoaded=true; renderWidget()})`. `renderWidget` checks `!container` guard. `container` is `bind:this` on `<div class="cf-turnstile">`. In Svelte 5, `bind:this` assignment may not be flushed before `loadScript` resolves (cached script resolves synchronously if already present). The `$effect` at `Turnstile.svelte:122` re-renders when `scriptLoaded && container && !isPlaceholder`, but it reads `void sitekey; void action;` then checks those — it should eventually render. However if `sitekey` is defined via `env.VITE_TURNSTILE_SITE_KEY` which is `""` until Vite env hydration completes, `isPlaceholder` may be true at mount then flip to false after env resolves — `$effect` should handle but `onMount` placeholder path already called `onToken("")` and did not enter load path. Need to handle late sitekey arrival.
2. **Invisible explicit render without sitekey binding:** The Cloudflare api.js defaults to implicit render via `data-sitekey` attributes. Our `container` has `data-sitekey={sitekey}` and `class="cf-turnstile"` — but we use explicit `turnstile.render(container, {sitekey})`. If `api.js` loads with `?render=explicit` param missing, it may conflict. Current src is `https://challenges.cloudflare.com/turnstile/v0/api.js` without `?render=explicit` — Cloudflare docs require explicit render to opt out of auto. Could cause double-render or token not delivered via `callback`.
3. **Disabled button lockout:** `disabled={turnstileEnabled && !turnstileToken}` means button is permanently disabled until `onToken` fires. If widget fails (network, CSP, siteverify domain mismatch, render failure), user is stuck with no feedback except `formError` only after attempted submit — but submit can't fire because button disabled prevents `form.handleSubmit()` from being reached via click. Keyboard Enter may still trigger form submit, but click is dead.
4. **No error/loading UI:** `Turnstile.svelte` has no visible loading or error state besides container div. On `loadScript` reject or `error-callback`, only `onError?.()` is called which in `LoginCard` just clears token — no `formError`, no retry button, no `aria-live` announcement. User sees enabled-looking widget but disabled Sign In.
5. **Sitekey validity for localhost:** `VITE_TURNSTILE_SITE_KEY=0x4AAAAAAEwSV9UhPGXOYZu3` with domains `localhost,127.0.0.1,example.com`. If widget was created with those domains, it should render on localhost. Verify via `npx wrangler turnstile widget get … --json | jq .domains`. If not, widget shows error internally (Cloudflare challenges fail) and `error-callback` fires but button stays disabled with no message.
6. ** CSP is correct** (`hooks.server.ts:13`) but dev skips CSP — not a blocker in `pnpm run dev`.

**Fix spec (per interview: Enable + validate, Retry UI, Yes a11y, Keep placeholder box):**

- **Turnstile.svelte changes:**
  - Support late sitekey: react to `sitekey` change after mount — already has `$effect` but also ensure `onMount` placeholder path does not early-return permanently; instead watch `isPlaceholder` reactively.
  - Append script with `?render=explicit` or ensure widget uses explicit render correctly — test both; document decision.
  - Expose states: `loading`, `error`, `ready`. Render `role="status" aria-live="polite"` area showing `Loading verification…` while script loads, `Verification failed — Retry` button on `error-callback` or `loadScript` reject, and hidden widget container otherwise.
  - Add `onLoad` and `onError` callbacks that set error state and allow parent to show `formError`.
  - Ensure `bind:this={container}` is available before `renderWidget` — use `$effect` that depends on `container` and `scriptLoaded`, not just `onMount`.
  - Add `timeout-callback` handling if Turnstile provides it (widgets can stall) — fallback retry after 15s.
  - Keep placeholder dashed box behavior when `isPlaceholder` — no script load, `onToken("")` called once.

- **LoginCard / RegisterCard changes:**
  - Change button `disabled` to `disabled={state.isSubmitting}` only (remove `turnstileEnabled && !turnstileToken` lock). Validate on submit:
    ```ts
    if (turnstileEnabled && !turnstileToken) {
      formError = "Please complete the verification challenge.";
      // Optionally focus the Turnstile container or retry button
      return;
    }
    ```
    This matches interview **Enable + validate**.
  - When `Turnstile` reports error/expire, set `formError` to actionable message (`Verification failed. Click Retry and complete the challenge again.` / `Verification expired — please complete the challenge again.`), clear `turnstileToken`, and show inline `FieldErrors`-style alert with `role="alert"`.
  - Add `turnstileError` state and pass `onError` that sets it; render error below widget when `turnstileError` truthy with `Retry` button calling `turnstileRef.reset()` or re-render.
  - After successful submit or failed submit due to server siteverify rejection, call `turnstileRef.reset()` and clear token (already does on error path) — extend to success path conceptually (token is single-use, so reset after any server response is correct — spec recommends **Reset always**).
  - Make `turnstileToken` reset also on `expired-callback` with user-visible message.

- **Acceptance:**
  - On dev localhost with valid keys, widget renders centered, user completes challenge, Sign In button is enabled before challenge (form valid) and also after; clicking with valid inputs + completed challenge succeeds; clicking without challenge shows inline `Please complete the verification challenge.` and focuses widget.
  - If Turnstile script fails (offline test: block `challenges.cloudflare.com` in DevTools), UI shows `Verification failed — Retry` button, `aria-live` announces it, Sign In remains enabled but shows error on click, Retry re-loads widget.
  - Placeholder mode (empty `VITE_TURNSTILE_SITE_KEY`) still shows dashed box, button enabled, server bypasses — existing behavior preserved.

---

## 4. Full Edge-Case Audit (Fail-Closed Security + UX)

### 4.1 Token lifecycle (recommended: Reset always + expire message)

- Tokens are single-use JWTs valid ~300s; Cloudflare enforces one siteverify per token. Current `onSubmit` only resets on `result.error` path and on `expired-callback` auto-resets. Should also reset after server-side failure due to siteverify (`400 Verification failed`) and after success path before redirect (defense-in-depth). Document that `verifyTurnstile` consumers must treat tokens as consumed regardless of outcome.
- Expired tokens: widget calls `expired-callback` -> currently resets silently. Add user-visible `formError = "Verification expired — please complete the challenge again."` with `aria-live`.

### 4.2 Bypass & injection vectors

- **Direct POST bypass:** Hook already blocks `!token` with `400 Verification required` when `TURNSTILE_SECRET_KEY` set — `index.ts:115`. Good. Audit: also need to ensure attacker cannot send token via other field names (`turnstileToken`) bypassing length check — current `verifyTurnstile` validates length 1..2048 before calling siteverify — good. But hook accepts either `cf-turnstile-response` or `turnstileToken` or header — keep allowlist small; prefer only `cf-turnstile-response`.
- **Placeholder bypass:** When `TURNSTILE_SECRET_KEY === ""`, both `verifyTurnstile` (`turnstile.ts:32`) and hook (`index.ts:106`) bypass. This is intentional for local dev without keys, but must never happen in production. Add startup check: if `NODE_ENV==="production"` and `TURNSTILE_SECRET_KEY===""`, log error and fail healthcheck; also consider returning 500 rather than success in prod. Keep dashed box for dev only — interview said **Keep box**.
- **Secret leakage:** `TURNSTILE_SECRET_KEY` is server-only (`@steps/env/server`), never exposed via `VITE_` or `web.ts` — verified. Ensure no client logs token+secret together.
- **Replay:** Siteverify will return `timeout-or-duplicate` for reused token; current code surfaces `success:false` with `error-codes` -> hook returns 400. Good. No DB needed.
- **Brute force:** Turnstile protects `/sign-in/email` and `/sign-up/student` credential endpoints; this is complementary to rate limiting per `docs/spec/rate-limiting-spec.md`. No change needed, but document interaction: rate limiter should run before Turnstile to avoid burning siteverify quota on already-limited IPs.

### 4.3 Hostname & action strictness (recommended: hard block + add prod domain)

- `verifyTurnstile` correctly fails closed on `action-mismatch`, `hostname-mismatch`, `hostname-missing` — `turnstile.ts:81`/`90`/`100`. This is correct per Turnstile purpose (prevent token theft across actions/domains). Keep hard block, surface generic `Verification failed. Please try again.` to user (don't leak which check failed), log specific error-codes server-side.
- `TURNSTILE_HOSTNAMES` currently includes placeholder `example.com` — per `docs/turnstile.md:41`, prod should omit localhost and be exact host (`erpsys.buksu.edu.ph`). Add TODO in spec: when prod domain known, update both Cloudflare widget domains and `TURNSTILE_HOSTNAMES`.
- Action values: `login` for `POST /sign-in/email`, `signup` for `POST /sign-up/student` — validated — good. Ensure widget `action` prop matches server `expectedAction` exactly (case-sensitive).

### 4.4 Network / availability edge cases

- **siteverify 10s timeout:** `AbortSignal.timeout(10_000)` — good. On timeout, returns `siteverify-network-error` -> hook throws 400. UI should offer retry, not infinite spinner. Current UI has no retry because button disabled prevents retry attempt. After **Enable + validate** fix, user can retry immediately; widget reset gives new token.
- **Cloudflare down / non-2xx:** Returns `siteverify-${status}` — good, fails closed. Ensure logging (server `console.error` with status) for ops.
- **Script load failure:** `loadScript` reject -> `onError?.()` only. Add explicit loading/error UI with retry button as required by **Retry UI** decision.
- **Slow script load:** Widget container shows blank while `scriptLoaded===false`. Add `Loading verification…` text with `aria-live` for a11y.

### 4.5 Client validation & a11y (recommended: inline errors, live regions, focus management)

- Current `formError` is rendered as `<p role="alert">` — good for assertive announcement. Ensure Turnstile errors also set `formError` and are not swallowed.
- Widget container already has `aria-live="polite"` but empty when placeholder — good. When loading/error, ensure container or sibling has `role="status"` with text.
- Retry button must be keyboard-focusable, visible focus ring, `aria-label="Retry verification challenge"`.
- Widget iframe from Cloudflare is already accessible; no extra label needed beyond `action` attribute.
- Color: error text uses `text-error` on `bg-error/10` — ensure contrast passes WCAG.

### 4.6 State & navigation edge cases

- **Session race with Turnstile:** `$sessionQuery.isPending` removal (Bug 1) decouples loading UI from Turnstile readiness — no interaction.
- **Dialog overlap:** `RealmMismatchDialog` portals to `document.body` to avoid containing block of `.auth-enter` — correct. No change.
- **Google OAuth not protected:** Per interview **Creds only**, `signIn.social` (`POST /sign-in/social`) is not Turnstile-gated. This is acceptable; Google already has bot protection. Document as intentional.
- **Password reset:** Not gated — intentional per interview.
- **Multiple tabs / token reuse:** Already covered by single-use nature and reset-after-submit.

### 4.7 Env & configuration

- `VITE_TURNSTILE_SITE_KEY` default `""` — correct for placeholder mode.
- `TURNSTILE_SECRET_KEY` default `""` — correct.
- Ensure `.env.example` documents both keys and `TURNSTILE_HOSTNAMES` (already in `docs/turnstile.md`).
- Validate that Vite injects `import.meta.env.VITE_TURNSTILE_SITE_KEY` at build time — `packages/env/src/web.ts:9` uses `import.meta.env`. This requires restart after `.env` change — document.

### 4.8 CSP (already correct)

- `hooks.server.ts:11` allows `script-src https://challenges.cloudflare.com`, `connect-src https://challenges.cloudflare.com`, `frame-src https://challenges.cloudflare.com`. No change. Verify production headers are actually served (not `dev` branch where CSP skipped). Dev does not send CSP so local `pnpm run dev` is unaffected — this matches user repro: widget shows in dev despite CSP.

### 4.9 Testing gaps

- Unit: `turnstile.test.ts:1` covers length, success, action/host mismatch, network, non-2xx, bypass. Missing: token >2048, `hostname-missing`, `siteverify` returning success but missing hostname with empty allowlist (should succeed), `remoteIp` propagation, `secret` empty early-return. Also missing hook integration test for `POST /sign-in/email` with/without token.
- E2E: No Playwright test for disabled state, retry UI, expired-callback, placeholder box, or RealmChip hover. Spec recommends adding:
  - `LoginCard` — valid email+password, no token -> submit -> expect `Please complete the verification challenge.`
  - `LoginCard` — placeholder mode -> button enabled -> submit succeeds with dummy token
  - `Turnstile.svelte` — mock `window.turnstile`, verify `onToken` called
  - `RealmChip` — hover -> text `Back` visible

---

## 5. Requirements (Acceptance Criteria)

### Must (P0) — fixes the reported regressions

1. **R1 — Remove Checking line:** No `Checking your account…` text appears for anonymous or authenticated state outside mismatch dialog. (`LoginCard.svelte:349` deleted).
2. **R2 — RealmChip hover:** Desktop mouse `mouseenter` shows `Back` chip, `mouseleave` restores label; `focus`/`blur` same; `::after` has `pointer-events:none`; spring measurement not blocking hover. Verified manually and with interaction test.
3. **R3 — Sign In not locked:** With `VITE_TURNSTILE_SITE_KEY` set and widget visible, Sign In button is enabled when `email` and `password` are non-empty and field-level validations pass (per TanStack form state), regardless of Turnstile token presence. Clicking without token sets `formError` inline and focuses widget/retry; with valid token, `authClient.signIn.email` called with `cf-turnstile-response`.
4. **R4 — Retry UI:** When Turnstile script fails to load, widget `error-callback`, or siteverify fails (server returns 400 `Verification failed`), UI shows inline error + `Retry` button that resets/re-renders widget and clears token. Retry is keyboard accessible and announces via `aria-live`.

### Must (P1) — correctness & edge cases

5. **R5 — Fail-closed:** When `TURNSTILE_SECRET_KEY` is set, any missing/empty/invalid token -> server returns 400 and login/register does not proceed. Token length >2048 -> `invalid-input-response` without siteverify call.
6. **R6 — Strict action/hostname:** `expectedAction` (`login` vs `signup`) and `hostname` vs `TURNSTILE_HOSTNAMES` mismatches -> `400 Verification failed` (generic to client, specific logged server-side). Production hostlist update documented.
7. **R7 — Token single-use & expiry:** After any submit (success or server 400), `turnstileRef.reset()` called and `turnstileToken=""`. Expired token shows `Verification expired — please complete the challenge again.` inline with retry.
8. **R8 — Placeholder mode preserved:** When `VITE_TURNSTILE_SITE_KEY==""`, dashed box shown, client allows submit without token, server bypasses verification (when `TURNSTILE_SECRET_KEY==""`). No change to `docs/turnstile.md` flow.
9. **R9 — A11y:** Loading / error / expired states announced via `aria-live="polite"` or `role="alert"`; error text has sufficient contrast; retry button has visible focus ring and label.
10. **R10 — CSP:** Production CSP still includes `https://challenges.cloudflare.com` for script/connect/frame; no `unsafe-inline` added.

### Should (P2)

11. **R11 — Tests:** Add unit for `hostname-missing` and hook integration; add component tests for enabled+validate and hover morph.
12. **R12 — Observability:** Server logs `errorCodes`/`hostname`/`action` on verification failure (no PII) for ops.
13. **R13 — Docs:** Update `docs/turnstile.md` note about button UX (Enable + validate) and retry UI; ensure `.env.example` lists keys.

---

## 6. Design Decisions (Interview-Resolved)

- **Checking UX:** Delete, don't gate or timeout. Rationale: value is negative (confusing below card) and mismatch state already has dialog+inline.
- **Back hover:** `pointer-events:none` on `::after` + measurement resilience. Rationale: `No morph at all` indicates hit-test or measurement race, not design preference.
- **Button enabled:** Enable when form valid, validate Turnstile on submit. Rationale: permanently disabled button with silent failure is perceived as broken; showing error on click is standard and accessible.
- **Fail mode:** Retry UI not fail-open. Rationale: security purpose of Turnstile is bot protection; failing open defeats it. Placeholder mode remains explicit bypass for local dev only.
- **Token lifecycle:** Reset after every submit + show expired error. Rationale: single-use + short TTL, consistent with `turnstile-spin §9` token lifecycle and existing `single-use — reset so user can retry` comment in `LoginCard.svelte:124`.
- **Strict validation:** Hard block on action/hostname. Rationale: prevents cross-action token replay and domain spoofing.
- **A11y:** Full live regions. Rationale: verification is a security gate; silent failure excludes AT users.

---

## 7. Out of Scope / Explicitly Deferred

- Rate limiting changes (`docs/spec/rate-limiting-spec.md` separate).
- CAPTCHA for Google OAuth or password reset (interview: **Creds only**).
- Disabling placeholder bypass in production via `NODE_ENV` check — recommended follow-up, not required for UI fix but noted in §4.2.
- `Turnstile` `size` / `appearance` modes or `execution: execute` (Managed mode sufficient).
- Adding explicit `TURNSTILE_ENABLED` env flag — interview: **Keep box** (key-empty inference is sufficient).

---

## 8. Implementation Plan (No Code Yet — Spec Only)

**Phase 1 — LoginCard / RegisterCard button & error handling**
- File: `apps/web/src/components/auth/LoginCard.svelte:308` & `RegisterCard.svelte:290` — change `disabled` to `state.isSubmitting` only.
- Add `turnstileError` state, `onError`/`onExpire` handlers that set `formError` with actionable text and `aria-live`.
- Ensure `onSubmit` guard `turnstileEnabled && !turnstileToken -> formError` remains and focuses widget container.
- Call `turnstileRef.reset()` after server 400 `Verification failed` and after success (defense).

**Phase 2 — Turnstile.svelte loading/error/retry + late sitekey**
- File: `apps/web/src/components/auth/Turnstile.svelte:1`.
- Add `loading`/`error` `$state`, render `Loading verification…` while `!scriptLoaded && !isPlaceholder && !error`, render error + retry button when `error`.
- Change script src to `api.js?render=explicit` if explicit render preferred; verify via manual test on localhost.
- Make render reactive to `container`, `scriptLoaded`, `isPlaceholder`, `sitekey` without early-return trapping.
- Add `pointer` test hooks (`data-testid="turnstile-container"`).

**Phase 3 — RealmChip hover**
- File: `apps/web/src/components/auth/RealmChip.svelte:135` — add `pointer-events:none` to `::after`.
- Harden measurement: `requestAnimationFrame` fallback, guard `chipStyle` not blocking hover morph, ensure `ResizeObserver` cleanup not disconnecting prematurely.

**Phase 4 — Cleanup & tests**
- Delete `LoginCard.svelte:349` block.
- Add unit tests for `hostname-missing`, hook 400 cases; add component interaction tests.
- Manual QA: dev localhost with real keys, dev with empty keys (placeholder), block `challenges.cloudflare.com` to test retry, test Tab hover, test expired callback via DevTools throttle.

---

## 9. Verification Checklist (Manual QA)

- [ ] Anonymous visit `/login/student` — no `Checking…` text; `/login/instructor` — same; `/login/register` — same.
- [ ] Hover RealmChip (desktop) -> width animates to `Back`, label cross-fades; Tab focus -> same; leave/blur -> restores.
- [ ] Fill valid `email` + `password`, do NOT complete Turnstile -> click Sign In -> inline `Please complete the verification challenge.` visible, `role=alert`, Turnstile container focused.
- [ ] Complete Turnstile -> Sign In succeeds -> redirects to `/loading?message=Signing+you+in…`.
- [ ] Block `challenges.cloudflare.com` (offline) -> Turnstile shows `Verification failed — Retry` with `aria-live`; Sign In remains enabled; clicking shows error; Retry re-attempts.
- [ ] Expire simulation (wait >5min or force `expired-callback`) -> inline `Verification expired…` + widget resets.
- [ ] Placeholder mode (`VITE_TURNSTILE_SITE_KEY=""`) -> dashed box shown, Sign In enabled, login succeeds without token.
- [ ] Production CSP header includes `https://challenges.cloudflare.com` (check `curl -I` on prod).

---

## 10. Open Questions for Follow-Up (Not Blocking Fix)

- Q1: Confirm Cloudflare widget domains for prod — is `erpsys.buksu.edu.ph` final or will there be `www.` alias? (affects `docs/turnstile.md:23` step).
- Q2: Should `Turnstile.svelte` use `render=explicit` or keep implicit? Requires manual verification on localhost after change.
- Q3: Add `NODE_ENV===production && TURNSTILE_SECRET_KEY==="" -> fail` guard? Interview kept bypass for dev but prod safety may want explicit check.
- Q4: Log `errorCodes` from siteverify to server logs/monitoring (e.g., `console.warn` with requestId) — adopt or keep silent?

---

## 11. References

- `packages/auth/src/turnstile.ts:1` — canonical verify, timeout 10s, hostname/action checks.
- `docs/turnstile.md:1` — domain update guide, wrangler commands, env allowlist.
- `apps/web/src/hooks.server.ts:11` — CSP allowlist already correct.
- Cloudflare Turnstile docs — `https://developers.cloudflare.com/turnstile/` (siteverify, render modes, managed/invisible).
- Interview responses 2026-09-11 — Checking: Remove entirely, Back: No morph at all, Sign-in: Widget shows / Dev localhost, Flows: Creds only, Fail: Retry UI, Token: recommended Reset+expire, Hostname: strict hard block, Button: Enable+validate, A11y: Yes, Audit: Full, Placeholder: Keep box.
