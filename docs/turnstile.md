# Turnstile — Domain Update Guide

**Status:** widget created with placeholder domain (`example.com`). Sitekey is stable; only the domain allowlist changes when production domain is known.

Current widget: `erpsys-login-register` via Wrangler

- **Sitekey:** `0x4AAAAAAEwSV9UhPGXOYZu3` (public, in `.env` as `VITE_TURNSTILE_SITE_KEY`)
- **Secret:** `TURNSTILE_SECRET_KEY` in `.env` (server-only, never commit)
- **Mode:** `managed`
- **Domains now:** `localhost`, `127.0.0.1`, `example.com`
- **Env allowlist:** `TURNSTILE_HOSTNAMES=localhost,127.0.0.1,example.com`

---

## Do I need to update Turnstile when I get a real domain?

**Yes — two places, one Wrangler command + one env change.** The sitekey/secret stay the same.

### 1. Update the Cloudflare widget domains

```bash
# Replace example.com with your real host (e.g. erpsys.buksu.edu.ph).
# Keep localhost + 127.0.0.1 for local dev — the same widget covers both.
npx wrangler turnstile widget update 0x4AAAAAAEwSV9UhPGXOYZu3 \
  --domain localhost \
  --domain 127.0.0.1 \
  --domain erpsys.buksu.edu.ph

# Verify
npx wrangler turnstile widget get 0x4AAAAAAEwSV9UhPGXOYZu3 --json | jq .domains
```

> Use `PUT` semantics (update replaces the whole list). Do NOT use `PATCH` — API returns `10405 Method not allowed` per Turnstile docs.

### 2. Update the server allowlist

In `.env` (and production env injection / systemd `Environment=` / secret manager):

```ini
TURNSTILE_HOSTNAMES=localhost,127.0.0.1,erpsys.buksu.edu.ph
# In production, omit localhost — prod allowlist should be exact:
# TURNSTILE_HOSTNAMES=erpsys.buksu.edu.ph
```

Restart the Node process after changing `.env`.

### 3. No code/CSP change needed

- `apps/web/src/hooks.server.ts` CSP already allows `https://challenges.cloudflare.com` for script/frame/connect.
- `packages/auth/src/turnstile.ts` and hooks in `packages/auth/src/index.ts:102` automatically read `TURNSTILE_HOSTNAMES`.
- Frontend `apps/web/src/components/auth/Turnstile.svelte` uses the same sitekey.

### Adding a second domain (e.g. www)

Just add it to **both** steps above:

```bash
npx wrangler turnstile widget update 0x4AAAAAAEwSV9UhPGXOYZu3 \
  --domain localhost --domain 127.0.0.1 \
  --domain erpsys.buksu.edu.ph --domain www.erpsys.buksu.edu.ph
```

```ini
TURNSTILE_HOSTNAMES=localhost,127.0.0.1,erpsys.buksu.edu.ph,www.erpsys.buksu.edu.ph
```

### Rotating secrets

Only needed if secret is leaked. Create a new widget (`wrangler turnstile widget create ...`) and replace **both** `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.

### Quick check

```bash
# Dummy probe — should return invalid-input-response (means secret is valid)
curl -X POST https://challenges.cloudflare.com/turnstile/v0/siteverify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "secret=$TURNSTILE_SECRET_KEY&response=XXXX.DUMMY.TOKEN.XXXX" | jq
# success:false + invalid-input-response = good; invalid-input-secret = bad secret
```
