# Deployment runbook

ERPSYS deploys to **one Ubuntu VM** as a single origin: Nginx serves the built
SPA and proxies the API to a single Node process managed by systemd, with
MongoDB Atlas as the only datastore.

Read `docs/specs/load-resilience-design.md` for why the shapes here
are what they are. This document is the operational half.

The target is 300–1000 students concurrently on the queueing page at peak,
which is why almost every number below is written down rather than left to
defaults: at that load, a default that is fine on a laptop is an outage.

---

## 1. Topology

```
  student browser
        │  HTTPS
        ▼
  nginx  (:80 → :443)                     single-origin
        ├── /                static       /srv/erpsys/apps/web/dist
        ├── /assets/         static       immutable, 1y
        ├── /api/events      proxy        127.0.0.1:3001   SSE, 3600s
        ├── /api/auth/*      proxy        rate-limited, tight
        ├── /rpc/*           proxy        rate-limited, generous
        └── /api/*           proxy        127.0.0.1:3001   30s read timeout
        ▼
  erpsys.service  (systemd, user `erpsys`)
        node --max-old-space-size=3072 dist/index.js
        MemoryMax=4G   TimeoutStopSec=30   Restart=always
        ▼
  MongoDB Atlas                            appName=erpsys, maxPoolSize=25
```

One process, no cluster. The SSE fan-out map and the rate limiters are
in-process, so a second process would silently break live updates. Revisit
above roughly 2000 concurrent.

### Files

| Path                                 | Purpose                                                |
| ------------------------------------ | ------------------------------------------------------ |
| `/srv/erpsys`                        | The checkout. Owned by `erpsys`, mode `0755`.          |
| `/srv/erpsys/apps/server/dist`       | `tsc` output; what systemd runs.                       |
| `/srv/erpsys/apps/web/dist`          | `vite build` output; what Nginx serves.                |
| `/etc/erpsys.env`                    | All runtime configuration. `root:erpsys`, mode `0640`. |
| `/etc/systemd/system/erpsys.service` | Installed from `deploy/erpsys.service`.                |
| `/etc/nginx/conf.d/erpsys.conf`      | Installed from `deploy/nginx/erpsys.conf`.             |
| `/var/log/nginx/erpsys.access.log`   | Per-request log with upstream timings.                 |
| `journalctl -u erpsys`               | Application log.                                       |

---

## 2. Prerequisites

### Hardware

|      | Minimum   | Notes                                                            |
| ---- | --------- | ---------------------------------------------------------------- |
| vCPU | 4         | One process, but V8 uses all cores for JIT and GC.               |
| RAM  | 8 GB      | `MemoryMax=4G` is a share; the rest is OS, Nginx, and Atlas TLS. |
| Disk | 80 GB SSD | `dist/`, `node_modules/`, and Atlas connection churn.            |

### Node — the version pin

**Node 24 LTS (24.x), and the pin does not exist yet.** There is no `.nvmrc`,
no `engines` field in the root `package.json`, and nothing in
`pnpm-workspace.yaml`. Meanwhile the repo contains three different answers to
"which Node is this?":

| Where                                          | Says                    | Enforced?                                          |
| ---------------------------------------------- | ----------------------- | -------------------------------------------------- |
| `.github/workflows/ci.yml` and `load-gate.yml` | `node-version: 22`      | Yes — every PR                                     |
| The working checkout                           | v24.12.0                | No, but it is what a developer is actually running |
| `apps/web/package.json`                        | `@types/node: ^24.13.3` | No, but it is what the code is written against     |

**This deployment should run Node 24**, and the reason is support runway
rather than a language feature: Node 22 is in maintenance LTS while Node 24 is
active LTS, so 24 is the version that will still receive security fixes in two
years. Node 24 is also what `@types/node` and local development already assume.

**But shipping 24 while CI tests 22 is exactly the drift that produces a 2am
surprise** — the version that gets deployed is the version nobody ever ran a
test against. So the pin is one change across three files, and all three
belong to whoever owns the repo's toolchain:

1. **Move CI to 24.** `node-version: 22` → `24` in both
   `.github/workflows/ci.yml` and `.github/workflows/load-gate.yml`. Without
   this, the other two files below are decoration.
2. **`.nvmrc`** at the repo root, containing `24`.
3. **`"engines": { "node": ">=24 <25" }`** in the root `package.json`, plus
   `"packageManager": "pnpm@10"` — pnpm is _also_ unpinned, and
   `pnpm-lock.yaml` is `lockfileVersion: '9.0'`. `corepack use pnpm@10
&& corepack use node@24` writes both files.

None of those three files are part of this change; they are outside the deploy
artifacts. **Until they land, treat the Node version as unpinned and verify it
by hand** — `node --version` on the server, and the two workflow files before
a release.

The alternative, for completeness: pin production to **22** to match CI as it
stands today. That is defensible — CI green on 22 is the only enforced
evidence in the repo that the code runs on any particular version — and it
costs you the longer support runway. If you take it, change §11's expectations
accordingly: `server.keepAliveTimeout` still defaults to 72s from Node 19 on,
so the explicit 65000 in `index.ts` matters either way, and
`closeIdleConnections()`/`closeAllConnections()` (shutdown steps 4 and 5) exist
in both.

On the server, and note that `apt-get install nodejs` will not give you either
version — Ubuntu ships v18 on 24.04 and v12 on 22.04:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version    # v24.x — check this before anything else
```

### pnpm

`corepack enable && corepack use pnpm@10` at the repo root, then commit the
`packageManager` field. Install **with dev dependencies present** — see §13,
`tsx` is a devDependency and the repair step needs it.

### MongoDB Atlas

- **Tier: M10 or higher.** The free M0 tier is not viable: it pauses after
  ~30 minutes idle, pauses are counted against your monthly hours, and a
  paused cluster accepts no connections. During enrollment the app sits idle
  for minutes at a time, and a paused cluster shows up as "the site is down"
  with the process healthy and `/api/ready` correctly returning 503.
- **Network Access: IP allowlist is mandatory.** Add the VM's _public egress
  IP_ under Atlas → Network Access → IP Access List. `0.0.0.0/0` works and is
  how a student database becomes a public one. Find the egress IP with
  `curl -s https://ifconfig.me` **from the VM** — it is not the VM's private
  address and not necessarily the same as its inbound address.
- **Connection string** goes in `DATABASE_URL`, with the database name in the
  path. Keep `retryWrites=true&w=majority` (the driver defaults) — the app
  relies on single-document atomicity from unique indexes, not on
  transactions, so a free or shared tier works as long as it is not M0.
- M10 gives 5000+ concurrent connections and dedicated vCPU; the app needs 25.

### One egress address?

Before enrollment day, find out whether the campus is behind a single NAT
egress. `deploy/nginx/erpsys.conf` keys both rate-limit zones on
`$binary_remote_addr`, and if every student shares one public address then
those zones are per-campus limits, not per-student ones. The shipped rates are
sized for that case (§6) — and they are currently the _only_ rate limiting in
front of the app, because the two application limiters in `lib/rate-limit/rate-limit.ts`
are not mounted yet (§3). Confirm before opening enrollment, not during.

---

## 3. Environment variables

**34 variables**, derived from `apps/server/src/lib/platform/env.ts` as it stands: 33
read through the `env` object, plus
`VITE_TURNSTILE_SITE_KEY`, which is read outside it. One more
(`SEED_PASSWORD`) appears in `.env.example` and is read by nothing at all.

**Boot-fatal** means the process refuses to start in production
(`assertProductionEnv`, `lib/platform/env.ts:193`, and `assertPublicOrigin`,
`lib/platform/env.ts:203`). Six of the 31 are.

### Boot-fatal

| Variable             | Default                            | Notes                                                                                                                                                                        |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           | `development`                      | Must be exactly `production`. The default serves stack traces to students. Set in the unit file as well as the env file.                                                     |
| `DATABASE_URL`       | `mongodb://localhost:27017/erpsys` | Still at that literal value is a fatal error. Atlas SRV string.                                                                                                              |
| `BETTER_AUTH_SECRET` | `""`                               | Fewer than 32 characters is fatal. `openssl rand -hex 32`. Rotating it logs everyone out.                                                                                    |
| `PORT`               | `3001`                             | Only fatal if a value was supplied and could not be parsed (`lib/platform/env.ts:38` remembers the fallback). Must match the `upstream` block in `deploy/nginx/erpsys.conf`. |
| `PUBLIC_SITE_URL`    | falls back to `BETTER_AUTH_URL`    | Unset in production is fatal. A `localhost`/`127.0.0.1` value is fatal — queue share links built from it send every student to their own machine.                            |

### Required in practice, not boot-fatal

| Variable                                    | Default                                        | Notes                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`                           | `http://localhost:5173`                        | The public origin, `https://` included. Used as `baseURL` and `trustedOrigins` for better-auth (`lib/auth/auth.ts:36-46`) **and** as the only allowed `Origin` for `POST /rpc` (`routes/rpc.ts:14-22`). A mismatch here is a 403 on every RPC write. |
| `QUEUE_SHARE_SECRET`                        | falls back to `BETTER_AUTH_SECRET`             | HMAC key for share tokens. Set it separately so share links can be rotated without invalidating every session.                                                                                                                                       |
| `TURNSTILE_SECRET_KEY`                      | `""`                                           | Empty disables verification entirely (`lib/auth/auth.ts:81`, `lib/turnstile/turnstile.ts:20`). **Security-critical, and currently the only thing between a public sign-in endpoint and an unthrottled one** — see the warning below.                 |
| `TURNSTILE_HOSTNAMES`                       | `localhost,127.0.0.1`                          | Comma-separated, must match the widget's hostnames exactly or `siteverify` fails.                                                                                                                                                                    |
| `METRICS_TOKEN`                             | `""`                                           | Empty means `/api/metrics` is loopback-only. See §9 — behind Nginx, empty means effectively world-readable unless Nginx blocks the path.                                                                                                             |
| `ADMIN_EMAILS`                              | `admin@buksu.edu.ph`                           | Comma-separated. Everyone listed gets the ADMIN role on sign-in.                                                                                                                                                                                     |
| `R2_BUCKET`                                 | `erpsys-dev` (`erpsys-prod` in prod)           | Shared R2 bucket, Standard class only. Empty refuses prod boot. Buckets are created via `npx wrangler r2 bucket create <name>`.                                                                                                                      |
| `R2_ENDPOINT`                               | `https://<accountId>.r2.cloudflarestorage.com` | S3-compatible endpoint. Empty refuses prod boot.                                                                                                                                                                                                     |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | `""`                                           | R2 API token with Object Read & Write on this bucket only (R2 dashboard → API tokens). Wrangler cannot mint these — paste by hand. Half-set or empty refuses prod boot / 503s mint.                                                                  |
| `R2_QUOTA_BYTES`                            | `8589934592` (8 GiB, 80% of free tier)         | Hard block: session-mint answers 503 past this.                                                                                                                                                                                                      |
| `R2_UPLOADS_ENABLED`                        | `true`                                         | `false` forces the same 503 (ops kill switch).                                                                                                                                                                                                       |
| `BREVO_API_KEY`                             | `""`                                           | Brevo v3 API key for password reset, turn alerts and enrollment-complete mail. Empty disables delivery — resets are logged in dev and silently dropped in production. Free tier: 300/day. Keep the admin **Email delivery** toggle on as well.          |
| `MAIL_FROM`                                 | `""`                                           | Sender added under Brevo → Senders & Domains, as `Name <addr>` or a bare address. No DNS or domain verification is needed — confirm the link Brevo emails to that address. Together with `BREVO_API_KEY`, this makes the admin row read "Credentials loaded". |

### ⚠ The application rate limiters are not mounted yet

`lib/rate-limit/rate-limit.ts` exports two ready-to-mount limiters —
`authRateLimit` (20 requests per 5 minutes, per IP) and `rpcRateLimit` (300
per minute, per user) — and its own doc comment gives the intended wiring:

```ts
app.all("/api/auth/*splat", authRateLimit, authHandler);
app.use("/rpc", rpcRateLimit, rpcHandler);
```

**Neither is mounted in `apps/server/src/index.ts` as it stands.** Until they
are, the _only_ rate limiting between the internet and the sign-in endpoint is
the `erpsys_auth` zone in `deploy/nginx/erpsys.conf` (20r/m, burst 10).

That is survivable but thin, and it is why this row is boot-fatal-adjacent in
practice: **an empty `TURNSTILE_SECRET_KEY` currently leaves sign-in and
sign-up with no bot protection and only a coarse per-address throttle.** With
a campus behind one NAT address, that throttle is per-campus.

Two things to do before enrollment opens, in this order:

1. Mount both limiters in `index.ts` as shown above. This is a code change, not
   an ops change, and it is outside this runbook's scope — it is called out
   here because the deployment's security posture depends on it.
2. Set `TURNSTILE_SECRET_KEY` to a real widget secret. With the limiters
   mounted the empty-secret case degrades to rate-limit-only; without them it
   degrades to almost nothing.

Verify the Nginx side is doing what you think it is. `erpsys_auth` is
`rate=20r/m burst=10 nodelay`: one request every 3 seconds sustained, up to 10
in excess, and `nodelay` rejects the excess immediately instead of queueing it.
So a burst of 21 gets roughly 11 through and 10 rejected, and a loop spaced 3
seconds apart gets 20 through and the 21st rejected:

```bash
# Burst: expect a run of 200s followed by 429s.
for i in $(seq 1 21); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST \
    -H 'content-type: application/json' -d '{}' \
    https://erpsys.example.edu.ph/api/auth/sign-in/email
done; echo

# Sustained: expect 20x200 then a 429.
for i in $(seq 1 21); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST \
    -H 'content-type: application/json' -d '{}' \
    https://erpsys.example.edu.ph/api/auth/sign-in/email
  sleep 3
done; echo
```

The status is `401`/`400` rather than `200` because the body is a stub — the
point is the status sequence, not the response. **If all 21 return 401/400 and
none is 429, the zone is not being applied**: check that the
`location ^~ /api/auth/` block is present and that `limit_req_zone` and
`limit_req_status` are in the `http` context (`nginx -T` shows the effective
config). A `429` here does not tell you whether the app-side limiter is also
contributing, because the two are indistinguishable from outside — which is
exactly why mounting it is worth doing.

### Cloudflare R2 (S3-compatible API, no Worker)

All uploads (evidence, mugshot, stamp) live in one shared private bucket —
full design in `docs/specs/cloudflare-r2-spec.md`. Replaces the old
per-student Drive design (`docs/specs/google-drive-spec.md`, superseded:
the team has no Workspace admin access for the DWD grant).

- **Provision:** `npx wrangler r2 bucket create erpsys-dev` (dev) /
  `erpsys-prod` (prod), Standard class. Then mint an R2 API token with
  Object Read & Write on that bucket only and paste `R2_ACCESS_KEY_ID` /
  `R2_SECRET_ACCESS_KEY` into `.env`. Verify with
  `pnpm --filter @erpsys/server r2:verify`.
- **CORS (per bucket, once):** the browser PUTs bytes direct to R2, so each
  bucket needs the policy in `deploy/r2/cors.json` or every upload fails
  client-side with a network error while session-mint stays green:
  `npx wrangler r2 bucket cors set <bucket> --file deploy/r2/cors.json -y`,
  then `npx wrangler r2 bucket cors list <bucket>` to confirm. The file
  already covers `:5173` (dev) and `https://erpsys.buksu.edu.ph` (prod) —
  add any new web origin there and re-apply. Rule propagation can take
  ~30 s.
- **Boot check:** empty `R2_BUCKET`/`R2_ENDPOINT`/keys refuse prod boot;
  in dev, session-mint fails until all three are set.
- **Quota guard:** session-mint answers 503 past 80% of the 10 GB free
  tier (8 GiB default); `R2_UPLOADS_ENABLED=false` forces the same 503.
- **Nginx note:** no `client_max_body_size` change needed — bytes go
  browser → R2 directly and bypass Express entirely. Only
  session-mint/complete JSON passes through the proxy.

### Optional

| Variable                                | Default                                                                       | Notes                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`                      | `""`                                                                          | Empty hides the Google sign-in button.                                                                                    |
| `GOOGLE_CLIENT_SECRET`                  | `""`                                                                          |                                                                                                                           |
| `CLOUDFLARE_ACCOUNT_ID`                 | `""`                                                                          | Account that owns the Workers AI allocation; `wrangler whoami` prints it. Empty does not break boot; the chatbot is dead. |
| `CLOUDFLARE_API_TOKEN`                  | `""`                                                                          | Workers AI–scoped token. Empty does not break boot; the chatbot is dead.                                                  |
| `CLOUDFLARE_PRIMARY_MODEL`              | `@cf/openai/gpt-oss-20b`                                                      | Leads the chain.                                                                                                          |
| `CLOUDFLARE_FALLBACK_MODELS`            | `@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/meta/llama-3.1-8b-instruct-fp8` | Comma-separated fallback chain, order preserved.                                                                          |
| `CLOUDFLARE_RPM`                        | `30`                                                                          | Ceiling this server aims at. Workers AI publishes no per-minute quota — this is self-protection.                          |
| `CLOUDFLARE_DAILY_NEURON_CAP`           | `10000`                                                                       | The account-wide free daily allocation; the guard rests at 90% of it.                                                     |
| `CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY` | `20000`                                                                       | Per-student fairness share (~6 turns at the documented prompt sizes).                                                     |
| `CLOUDFLARE_CHAT_ENABLED`               | `true`                                                                        | `false` → clean 503 + the maintenance copy. The incident kill switch.                                                     |
| `CLOUDFLARE_MAINTENANCE_MESSAGE`        | `""` (code fallback)                                                          | What a student reads while the kill switch is off.                                                                        |
| `CLOUDFLARE_REQUEST_DEADLINE_MS`        | `30000`                                                                       | Hard deadline for one upstream conversation. Must stay well below nginx's `proxy_read_timeout 120s`.                      |

### Student chatbot (Cloudflare Workers AI)

`POST /api/chat/stream` calls the Workers AI REST API **from this Express
process** — there is no Cloudflare Worker, nothing to deploy, and `wrangler`
never runs in production. Setup and the manual smoke checklist live in
[cloudflare-ai-verification.md](cloudflare-ai-verification.md); the design is
[../specs/cloudflare-ai-spec.md](../specs/cloudflare-ai-spec.md).

- **The daily Neuron ceiling is a product state, not an error.** The free
  allocation is 10,000 Neurons/day for the **whole account**, reset at 00:00
  UTC — roughly 150 turns/day for the entire cohort. The guard in
  `lib/chat/budget.ts` counts each turn from estimated tokens, keeps a 10%
  reserve, and gives each student a daily share. Over either limit the student
  gets a "resting until midnight UTC" reply instead of a raw 429. Watch for the
  `[chat] the account's daily neurons are used up (3036)` line; if it appears
  before noon the cohort is too large for the free tier and the school has to
  choose Workers Paid or AI Gateway credits.
- **Estimates, not invoices.** Neurons are computed from character counts, so
  the daily figure drifts from the real spend. The 1.25 safety factor and the
  10% reserve cover it, and Cloudflare's own `3036` is the authoritative
  backstop. Compare the guard's number with the dashboard after the first smoke
  run (checklist item 8) and re-tune `NEURON_SAFETY_FACTOR` from evidence.
- **Data flow.** The knowledge document and the student context block (name,
  verified steps, current step, queue status) leave the school's servers for
  Cloudflare on every turn, exactly as they left for Google before. No student
  record beyond that block is sent.
- **Rollback.** The Gemini path is gone, so there is no env flip back to the
  previous provider — rolling back is `git revert` of the cutover commit. If
  the chatbot must be stopped in place, set `CLOUDFLARE_CHAT_ENABLED=false`
  (clean 503, maintenance copy, no redeploy) and point students at the SBO
  office.
- **Boot.** A missing `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` is not a
  boot failure; the chatbot answers with the friendly failure and the process
  logs `[chat] ... are not set`.

### Shutdown timing

These three must stay consistent with `deploy/nginx/erpsys.conf`. See §7.

| Variable            | Default | Notes                                                                                                      |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `DRAIN_DELAY_MS`    | `2000`  | Readiness flips to 503, then wait this long. Must be **shorter** than `proxy_next_upstream_timeout` (15s). |
| `SHUTDOWN_GRACE_MS` | `10000` | Force-close deadline. `DRAIN_DELAY_MS + SHUTDOWN_GRACE_MS` must stay **below** `TimeoutStopSec=30`.        |

### Mongo client

Driver option, default, and why. `MONGO_APP_NAME` makes the connection
identifiable in Atlas.

| Variable                            | Default  |
| ----------------------------------- | -------- |
| `MONGO_MAX_POOL_SIZE`               | `25`     |
| `MONGO_MIN_POOL_SIZE`               | `5`      |
| `MONGO_WAIT_QUEUE_TIMEOUT_MS`       | `5000`   |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `5000`   |
| `MONGO_CONNECT_TIMEOUT_MS`          | `10000`  |
| `MONGO_SOCKET_TIMEOUT_MS`           | `45000`  |
| `MONGO_MAX_IDLE_TIME_MS`            | `60000`  |
| `MONGO_APP_NAME`                    | `erpsys` |

`MONGO_WAIT_QUEUE_TIMEOUT_MS` is the one that matters. The driver default is
`0` — infinite — so request 26 does not fail, it waits forever holding an
Express handler open, and a momentary spike becomes a permanent hang. Five
seconds then a 503 is the intended behaviour. See §10.1.

### Build-time only

| Variable                  | Read by                   | Notes                                                                                                                                                                           |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_TURNSTILE_SITE_KEY` | `apps/web/src/lib/env.ts` | Baked into the SPA bundle by `vite build`. It is a **public** key. It must be present on the **build** host, not on the server — changing it requires a rebuild, not a restart. |
| `V2_API_TARGET`           | `apps/web/vite.config.ts` | Dev-server proxy target only. Unused by `vite build`.                                                                                                                           |

### Not read by anything

`SEED_PASSWORD` appears in `.env.example` but has **zero references** in the
repo — the seed script it was written for does not exist. Do not put a real
password in it. `.env.example` also refers to `packages/env/src/server.ts`
and `bun db:seed`, neither of which exists; the file is stale in several
places and is not a reliable source for this table.

### Writing the file

`/etc/erpsys.env`, `root:erpsys`, `0640`. systemd's `EnvironmentFile` format:
`KEY=value`, no `export`, no quotes, no line continuations. Values containing
spaces or `#` must be quoted.

```bash
sudo install -o root -g erpsys -m 0640 /dev/null /etc/erpsys.env
sudo -e /etc/erpsys.env
```

> **Do not create `/srv/erpsys/.env`.** `lib/platform/env.ts:4` dotenv-loads
> `../../.env` relative to `cwd`, which under this unit resolves to
> `/srv/erpsys/.env`. It will not override `EnvironmentFile` (dotenv never
> overwrites an already-set variable), but it _will_ silently supply anything
> you forgot to put in `/etc/erpsys.env`. The failure mode is a config that
> works until someone deletes the file.

### Handover and credential rotation

`/etc/erpsys.env` is the floor. An admin can save an integration credential in
Admin → Integrations; it is stored encrypted in MongoDB and overrides the file
**after a restart**. The panel says so per row (`Restart required`), and names
the command: `sudo systemctl restart erpsys`.

1. **Before rotating `BETTER_AUTH_SECRET`**, open Integrations and `Reset to
   .env` every group that has stored credentials, or re-enter them afterwards.
   The secret is the encryption root: rotated without that step, every stored
   group becomes unreadable and the server falls back to the env values.
2. **To move the deployment**, use `Export .env` on the Integrations panel,
   install the block into `/etc/erpsys.env`, restart, then confirm every row
   reads `Credentials loaded` and no `Restart required` badge remains.
3. **The new owner's first login** must be an `ADMIN_EMAILS` account — that key
   stays in the env file by design, and is listed in the panel's read-only
   Core configuration section.

---

## 4. First deploy

```bash
# 1. Service account and checkout
sudo adduser --system --group --home /srv/erpsys --shell /usr/sbin/nologin erpsys
sudo -u erpsys git clone <repo-url> /srv/erpsys
```

Deploy dependencies first so the build has something to run against.

> **Do not `apt-get install nodejs` for the runtime.** Ubuntu's `nodejs`
> package is v18 on 24.04 and v12 on 22.04 — both far below the pin in §2, and
> neither prints a warning. Install from NodeSource as shown there, and check
> `node --version` before building anything.

```bash
sudo apt-get update
sudo apt-get install -y nginx git ca-certificates curl gnupg

curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version    # v24.x
```

Then, as `erpsys`:

```bash
cd /srv/erpsys
corepack enable
pnpm install --frozen-lockfile     # NOT --prod: §13 needs tsx
pnpm check                         # tsc --noEmit + svelte-check/tsc
pnpm test
pnpm build                         # pnpm -r run build -> apps/server/dist, apps/web/dist
```

```bash
ls -l apps/server/dist/index.js apps/web/dist/index.html
```

If either is missing, the build did not run — stop here. Continuing produces a
unit that starts and immediately crashes, or an Nginx that 404s every route.

`VITE_TURNSTILE_SITE_KEY` must be in the environment **for `pnpm build`**
(it is compiled into the bundle). If it is only in `/etc/erpsys.env`, export
it into the build shell as well.

Then §5 and §6, then:

```bash
sudo systemctl status erpsys
curl -s localhost:3001/api/health     # {"ok":true}
curl -s localhost:3001/api/ready      # {"ok":true,"ready":true}
curl -sI https://erpsys.example.edu.ph/ | head -1   # HTTP/2 200
```

---

## 5. systemd

```bash
sudo install -o root -g root -m 0644 deploy/erpsys.service /etc/systemd/system/erpsys.service
sudo systemctl daemon-reload
sudo systemctl enable --now erpsys
systemctl status erpsys
sudo journalctl -u erpsys -f
```

Expected on a good boot, in this order:

```
[indexes] preflight audit clean - creating indexes
[server] database reachable, indexes ensured
[server] listening on :3001
```

`assertPublicOrigin()` and `assertProductionEnv()` both run at import time,
before any route is mounted, so a config problem is the first thing in the
journal and the process exits without ever accepting a connection.

`refusing to boot in production` lists **every** problem at once, not one per
attempt. The four it can report: `NODE_ENV` is not `production`,
`DATABASE_URL` is the localhost default, `BETTER_AUTH_SECRET` is under 32
characters, `PORT` could not be parsed. `PUBLIC_SITE_URL` problems come from
`assertPublicOrigin` with their own message.

`boot failed — refusing to accept traffic` is a different class of failure —
Mongo unreachable, or the Phase 1 audit found violations (§13). The process
exits 1 and systemd retries it, so a permanently failing unit here means a bad
`DATABASE_URL` or data that needs the repair script, not a restart loop to
wait out.

The timeouts are set after `listen()`, on the retained server handle:
`keepAliveTimeout=65000`, `headersTimeout=70000`, `requestTimeout=120000`,
`maxConnections=2048`. `server.timeout` is left at 0, which is what keeps a
long-lived SSE stream from being killed by an inactivity timer. If these ever
move, §11 is the checklist.

Useful commands:

```bash
systemctl restart erpsys     # the deploy path (§7)
systemctl stop erpsys
sudo journalctl -u erpsys --since '10 min ago' --no-pager
systemctl show erpsys -p MemoryMax -p MemorySwapMax -p LimitNOFILE
```

If the unit will not start at all, `systemd-analyze verify /etc/systemd/system/erpsys.service`
and `sudo journalctl -u erpsys -n 50`. Sandboxing failures show up there as
`Failed to set up mount namespacing` or a permission error on `/proc`.

---

## 6. Nginx

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx/erpsys.conf /etc/nginx/conf.d/erpsys.conf
sudo rm -f /etc/nginx/sites-enabled/default     # else :80 default_server clash
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` must pass **before** the reload. The most likely failure is
`unknown directive "brotli"`, which means the brotli filter is not loaded.
Either fix it or delete the commented-in brotli lines; gzip alone is a
complete, correct configuration.

### brotli

Ubuntu's nginx does not include it. Install the filter and load it as the
first line of `/etc/nginx/nginx.conf`, above `events`:

```bash
sudo apt-get install -y libnginx-mod-http-brotli-filter
ls /usr/lib/nginx/modules/ | grep brotli
```

```nginx
load_module /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so;
```

`load_module` is main-context only, which is why it cannot live in
`deploy/nginx/erpsys.conf`. Then uncomment the `brotli_*` block in the `server`
block. `nginx -t` will confirm.

### TLS — in this order, or it will not work

The shipped config references certificate paths that do not exist yet, so
`nginx -t` fails and Nginx will not start, and `certbot --nginx` cannot run
against a stopped Nginx. Get the certificate **first**, with only the HTTP
block installed.

```bash
sudo apt-get install -y nginx
sudo apt-get install -y certbot

# 1. Install the config with the whole 443 server block commented out.
#    The :80 block's ACME location is what serves the challenge.
sudo cp deploy/nginx/erpsys.conf /etc/nginx/conf.d/erpsys.conf
sudo rm -f /etc/nginx/sites-enabled/default     # else :80 default_server clash
sudoedit /etc/nginx/conf.d/erpsys.conf          # comment from "server {" (443) to its closing "}"
sudo nginx -t && sudo systemctl reload nginx

# 2. Issue the certificate over plain HTTP, via the ACME location above.
sudo certbot certonly --webroot -w /var/www/html -d erpsys.example.edu.ph

# 3. Uncomment the 443 block, then:
sudo nginx -t && sudo systemctl reload nginx
```

`--webroot -w /var/www/html` must match the `root /var/www/html;` in the
`location ^~ /.well-known/acme-challenge/` block. Using `--webroot` rather
than `--nginx` also means certbot never rewrites the config, so the four
`ssl_*` lines in `deploy/nginx/erpsys.conf` stay authoritative and a later
`cp` of the repo file does not silently revert your certificate paths.

Renewal is a systemd timer and needs no further setup:

```bash
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

Step 3's `cp` is safe because the paths certbot reported in step 2 are the
ones already in the config. If you change the hostname, do steps 1–3 again.

### Replacing `server_name`

`erpsys.example.edu.ph` appears in the two `server_name` lines and the two
`ssl_certificate*` paths. All of them, plus `PUBLIC_SITE_URL` and
`BETTER_AUTH_URL` in `/etc/erpsys.env`, must be the same host.
`assertPublicOrigin` refuses to boot on a local origin, and
`routes/rpc.ts:14-22` rejects any `POST /rpc` whose `Origin` does not match
`BETTER_AUTH_URL` — a mismatch there is a 403 on every write, with nothing in
the browser console worth reading.

A `403` on writes with `200` on reads is the signature of a `BETTER_AUTH_URL`
mismatch. Check it before anything else:

```bash
sudo grep -E '^(PUBLIC_SITE_URL|BETTER_AUTH_URL)=' /etc/erpsys.env
```

### If you ever put a CDN in front

Both rate-limit zones key on `$binary_remote_addr`, which becomes the proxy's
address for every client. Add, above the `server` blocks:

```nginx
set_real_ip_from  <proxy cidr>;
real_ip_header    X-Forwarded-For;
real_ip_recursive on;
```

---

## 7. Zero-downtime releases

A restart is not downtime **if** the drain happens in the right order. The
whole sequence is in `lib/shutdown/shutdown.ts`; this is what the operator sees.

```
t=0s     systemd sends SIGTERM. The handler immediately calls markNotReady(),
         so /api/ready starts answering 503 {"reason":"draining"} while the
         process is still serving every request it already has.
t=0..2s  DRAIN_DELAY_MS=2000. Still accepting, still serving. THIS DELAY IS THE
         POINT: a request landing in this window is served normally and never
         enters the outage window at all. Without it the socket closes the
         instant SIGTERM lands and every request in flight is at the mercy of
         a client-side retry.
t=2s     server.close() stops accepting. In-flight requests finish.
t=2s     lib/sse/sse.ts publishToAll() sends a `reconnect` event to every SSE
         subscriber, so instructor consoles reconnect immediately instead of
         waiting out their own `retry: 3000`.
t=2..12s SHUTDOWN_GRACE_MS=10000 for in-flight requests to complete.
t=12s    process.exit(0). journalctl shows `[shutdown] complete, exiting 0`.
t=12..14s RestartSec=2.
t≈14.5s  boot: Mongo ping, ensureIndexes, listen(). Typically well under a
         second of work; a cold Atlas connect can add up to
         connectTimeoutMS=10000.
```

Note what `/api/ready` flipping to 503 does and does not do here: nothing is
polling it. Nginx's own `proxy_next_upstream` does not health-check, and there
is no load balancer above it on a single-host deployment. The readiness flip
is what makes the drain _observable_ — to you, and to a load balancer if one is
ever added — and the 503 body (`{"ok":false,"ready":false,"reason":"draining"}`)
plus `Retry-After: 5` is what that observer acts on. The socket-level overlap
during those 2 seconds is what actually keeps the deploy quiet.

Watch it work:

```bash
# From a second terminal, during a restart. 200, then 503 (draining), then 200.
watch -n0.5 'curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3001/api/ready; echo'
```

Four numbers have to agree, and they live in three different files:

| Number                        | Where                      | Value   |
| ----------------------------- | -------------------------- | ------- |
| `DRAIN_DELAY_MS`              | `/etc/erpsys.env`          | `2000`  |
| `SHUTDOWN_GRACE_MS`           | `/etc/erpsys.env`          | `10000` |
| `RestartSec`                  | `deploy/erpsys.service`    | `2`     |
| `TimeoutStopSec`              | `deploy/erpsys.service`    | `30`    |
| `proxy_next_upstream_timeout` | `deploy/nginx/erpsys.conf` | `30s`   |

Invariants:

- `DRAIN_DELAY_MS < proxy_next_upstream_timeout` — 2 < 30. The spec's
  requirement, and the reason step 1 of the shutdown sequence is not wasted:
  the drain has to complete inside the retry window, or the process starts
  refusing before the proxy has finished reacting.
- `DRAIN_DELAY_MS + SHUTDOWN_GRACE_MS + RestartSec + boot
< proxy_next_upstream_timeout` — 2 + 10 + 2 + ~1.5 ≈ 15.5s < 30s. The 30s
  also absorbs a cold Atlas connect on top.
- `DRAIN_DELAY_MS + SHUTDOWN_GRACE_MS < TimeoutStopSec` — 12 < 30 — or systemd
  SIGKILLs a process that was draining cleanly. SIGKILL cannot be caught: the
  shutdown sequence never reaches `exit(0)`, in-flight requests are cut, and
  the journal shows `status=137/SIGKILL` instead of `exiting 0`.

The one caveat: the grace timer in `lib/shutdown/shutdown.ts` starts only after
`server.close()` resolves, so a client that ignores the `reconnect` event and
holds its SSE socket open pushes the real bound up to `TimeoutStopSec=30`.
That headroom exists for exactly that case.

### What the retry window does and does not buy

Worth being precise, because the natural assumption is wrong and it changes
what you do at 3am.

`proxy_next_upstream` retries **immediately**. It does not pause and wait for
the upstream to come back. With one upstream there is no second peer to fail
over to. So:

**It does rescue the common case.** With `Connection ""`, Nginx keeps idle
upstream sockets in a keepalive pool. A request arriving on a pooled socket
that Node just closed by `closeIdleConnections()` gets `ECONNRESET`, `error`
retries it on a fresh connection to a still-listening process, and the client
sees nothing at all. That is most of what a deploy produces.

**It does not bridge the restart window.** From `server.close()` (t=2s) until
the new process listens (t≈14.5s), roughly twelve seconds, a new request gets
connection-refused, is retried once, is refused again, and is returned as a 502. Nginx cannot fix that with one upstream. Two things bridge it instead:

1. **The client.** TanStack Query retries failed queries, and the SPA's error
   states recover. SSE clients reconnect on the `reconnect` event and then on
   their own `retry: 3000`. Students see a spinner, not an error page, in the
   large majority of cases.
2. **`DRAIN_DELAY_MS`.** During t=0..2s the process is still accepting, so any
   request landing in that window is served normally and never enters the
   outage window at all. At peak polling rates this is where the majority of
   requests during a deploy land.

**If a genuinely 502-free deploy is ever required**, the only server-side
option is two units on two ports with `upstream { server 127.0.0.1:3001; server
127.0.0.1:3002; }`, `max_fails=1 fail_timeout=5s`, and a real retry delay —
which needs a shared SSE bus and shared rate-limit state to be correct, and is
ruled out by the spec's single-process decision. It is not an ops change and
is out of scope here. What is in scope is knowing that the residual window
exists, that it is about twelve seconds, and that the client is covering it.

### `http_503` is dropped on the API paths, deliberately

The spec's directive list includes `http_503`, and it is set at the `server`
level as specified. It is then **overridden to `error timeout` on `/rpc/`,
`/api/chat/stream`, and the generic `/api/` block**,
because those are the paths where the app itself returns 503, and a 503 from
the app is not a restart signal:

- **Pool exhaustion** returns 503 with `Retry-After: 5` and exists precisely
  to shed load (§10.1). Retrying it in Nginx re-runs the same request against
  the same saturated pool, holds the client for `2 ×
MONGO_WAIT_QUEUE_TIMEOUT_MS` = 10s instead of 5s, and returns 503 anyway. A
  correct backpressure signal becomes a slower, less correct version of
  itself.
- **The chatbot maintenance 503** is the `CLOUDFLARE_CHAT_ENABLED=false` kill
  switch. Retrying it in Nginx would only re-ask a disabled feature, and the
  SPA already shows the maintenance copy from the response body.
- **The drain 503** on `/api/ready` is consumed by a health check, not by a
  client, and a client request during the drain gets a _connection error_
  rather than a 503 — which `error` already covers.

If you add a load balancer above Nginx later, revisit this: with a second tier
that can return 502/503, the server-level list is the one that matters and the
overrides are what you would drop.

### Procedure

```bash
cd /srv/erpsys
sudo -u erpsys git pull --ff-only
sudo -u erpsys pnpm install --frozen-lockfile
sudo -u erpsys pnpm build

sudo systemctl restart erpsys
```

Watch it, do not walk away:

```bash
sudo journalctl -u erpsys -f
```

Expected, in order:

```
[shutdown] SIGTERM - draining
[server] database reachable, indexes ensured
[server] listening on :3001
```

`[shutdown] complete, exiting 0` is the line to look for. If the journal shows
`status=137/SIGKILL` or exit `143` instead, the graceful path did not run to
completion — see the `TimeoutStopSec` note in §7 and the timing invariants
above it.

Verify from outside the box while you are still on the terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://erpsys.example.edu.ph/api/ready
# 200
```

Load the app as a student while you are there. Signing in, the queue page, and
one hard refresh on `/app/instructor` are the three things a deploy breaks
when it breaks.

**Never `pnpm build` while the service is running** if the build changes
`apps/server/dist` in place — the running process has already loaded its
modules, so this is safe today, but a future `tsc --watch` in production would
not be. Build first, restart second, as above.

---

## 8. Rollback

There is no database migration to undo, so a rollback is a redeploy of the
previous commit. `ensureIndexes()` is idempotent and never drops an index, so
rolling back does not touch the indexes added by a later commit.

```bash
cd /srv/erpsys
sudo -u erpsys git log --oneline -5      # find the bad commit
sudo -u erpsys git checkout <sha>
sudo -u erpsys pnpm install --frozen-lockfile
sudo -u erpsys pnpm build
sudo systemctl restart erpsys
sudo journalctl -u erpsys -f
```

`git checkout` detaches HEAD. When the fix lands:

```bash
sudo -u erpsys git checkout main
```

### When a rollback is not enough

- **The config is wrong.** Edit `/etc/erpsys.env` and `systemctl restart
erpsys`. The env file is read once at boot.
- **The Nginx config is wrong.** `sudo cp deploy/nginx/erpsys.conf
/etc/nginx/conf.d/erpsys.conf && sudo nginx -t && sudo systemctl reload
nginx`. `reload` does not drop connections; `restart` does.
- **The data is wrong.** See §10.3. A bad queue row is a data problem, not a
  deploy problem, and rolling back will not touch it.

---

## 9. Metrics

`/api/metrics`, Prometheus text format.

### The gate, and the Nginx problem with it

`lib/platform/metrics.ts` serves metrics when **the socket peer is loopback, or
`METRICS_TOKEN` is set and matches**. Behind Nginx every request arrives from
`127.0.0.1`, so the loopback test passes for every client on the internet.

`deploy/nginx/erpsys.conf` therefore returns `404` for `/api/metrics` by
default, and the supported way to read it is from the host itself:

```bash
curl -s http://127.0.0.1:3001/api/metrics
```

That is the loopback path the gate was designed for: no token, no exposure.
To scrape from a separate monitoring host, set `METRICS_TOKEN` in
`/etc/erpsys.env` and enable the block documented in the nginx config. The
token is accepted as `Authorization: Bearer <token>` or `?token=<token>` — a
mismatch answers `404`, not `401`, so the endpoint is not confirmable by
status code. Do not proxy `/api/metrics` with `METRICS_TOKEN` empty: there is
no app-side configuration that makes that safe.

### The series

From `apps/server/src/lib/platform/metrics.ts`. Every name below is real, not
projected.

| Series                                                      | Type      | What a bad number means                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `erpsys_event_loop_delay_ms{quantile="0.5"\|"0.99"\|"max"}` | gauge     | **The most useful number here.** p99 above ~100ms means the process is CPU- or GC-bound and every request queues behind the event loop. Above ~1s and requests are timing out for reasons Mongo cannot explain. A healthy idle process sits near 0.                                                                     |
| `erpsys_process_resident_memory_bytes`                      | gauge     | RSS — what the cgroup actually enforces. Compare against `MemoryMax=4G`.                                                                                                                                                                                                                                                |
| `erpsys_nodejs_heap_size_used_bytes`                        | gauge     | Live V8 heap. Compare against `--max-old-space-size=3072`.                                                                                                                                                                                                                                                              |
| `erpsys_nodejs_heap_size_total_bytes`                       | gauge     | Heap V8 has reserved. A large gap to `_used_` is fragmentation or uncollected garbage.                                                                                                                                                                                                                                  |
| `erpsys_nodejs_external_memory_bytes`                       | gauge     | Memory held **outside** the V8 heap: Buffers, the Mongo driver's socket and TLS buffers. This is the number that explains a cgroup OOM with a healthy-looking heap, and it is why the two limits in §14 must not be equal.                                                                                              |
| `erpsys_mongo_pool_checked_out`                             | gauge     | In-use connections. Pinned at 25 with `available` at 0 is pool exhaustion — §10.1.                                                                                                                                                                                                                                      |
| `erpsys_mongo_pool_available`                               | gauge     | Idle connections in the pool.                                                                                                                                                                                                                                                                                           |
| `erpsys_mongo_pool_max`                                     | gauge     | `MONGO_MAX_POOL_SIZE`, 25 by default.                                                                                                                                                                                                                                                                                   |
| `erpsys_sse_subscribers`                                    | gauge     | Live SSE streams. Dropping to 0 and back on a deploy is expected. Sitting at 0 while instructors report "live updates are broken" is not.                                                                                                                                                                               |
| `erpsys_http_requests_total{route,method}`                  | counter   | Rolling request count per route. Route labels are normalised (`normaliseRoute`): `/rpc/<procedure>` keeps the procedure name, `/api/<a>/<b>` collapses to `/api/<a>/*`, and id-shaped segments become `:id`. At 500+ distinct routes the overflow collapses into one `/other` series rather than growing without bound. |
| `erpsys_http_responses_total{route,method,status}`          | counter   | Same, split by status **class** (`2xx`/`3xx`/`4xx`/`5xx`), not by code. This is the 5xx-visibility series.                                                                                                                                                                                                              |
| `erpsys_http_request_duration_ms_bucket{route,method,le}`   | histogram | Buckets at 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000 ms, plus `+Inf`, with `_sum` and `_count`. This is what the p95 gate in §12 is computed from.                                                                                                                                                          |

Note these are **rolling in-process counters**, not durable: they reset on
every restart. Rate queries and p95 quantiles need a scrape interval shorter
than the restart interval to be meaningful, and a counter that drops to zero
after a deploy is expected rather than a problem.

Useful queries once scraped:

```promql
# pool exhausted?
erpsys_mongo_pool_checked_out / erpsys_mongo_pool_max

# 5xx rate by route — the first query to run when the site is down
rate(erpsys_http_responses_total{status="5xx"}[5m])

# p95 per route, straight from the histogram
histogram_quantile(0.95, sum by (le, route) (rate(erpsys_http_request_duration_ms_bucket[5m])))

# event-loop p99
erpsys_event_loop_delay_ms{quantile="0.99"}

# headroom against the V8 ceiling, and against the cgroup
erpsys_nodejs_heap_size_used_bytes / (3072 * 1024 * 1024)
erpsys_process_resident_memory_bytes / (4 * 1024 * 1024 * 1024)

# memory V8 does not account for — the cgroup-OOM tell
erpsys_nodejs_external_memory_bytes
```

### Logs

`journalctl -u erpsys` for the application. In production
(`NODE_ENV=production`) `requestLogMiddleware` writes **one line of JSON per
request** to stdout:

```json
{
  "level": "info",
  "msg": "request",
  "requestId": "…",
  "method": "POST",
  "path": "/rpc/student/queue/joinQueue",
  "status": 200,
  "durationMs": 42.13
}
```

Query strings are stripped before logging — they carry share-link secrets and
the metrics token — and no header or body is ever written. Every response also
carries `X-Request-Id`, which is the same `requestId` in the log line and in
any error the student sees, so a report of "it failed" is traceable to one
request. Cookie and `Authorization` headers are redacted or omitted entirely.

Note one pre-existing leak this does **not** fix: `lib/auth/auth.ts` still prints
password-reset tokens to stdout on its own. If you ship application logs
off-box, that is in them.

```bash
# 5xx in the last 1000 requests
sudo journalctl -u erpsys -n 1000 --no-pager | grep -c '"status":5'

# every line for one request id, app log and Nginx access log
sudo journalctl -u erpsys --no-pager | grep '<requestId>'
sudo grep '<requestId>' /var/log/nginx/erpsys.access.log
```

Per-request timings are also in `/var/log/nginx/erpsys.access.log`, whose
format string is in `deploy/nginx/erpsys.conf` and includes `$request_time` and
`$upstream_response_time` — which is how you tell "Nginx was slow" from "Mongo
was slow":

```bash
# slowest 20 requests, with the upstream time alongside
sudo grep 'urt=' /var/log/nginx/erpsys.access.log \
  | sed 's/.*\(rt=[0-9.]* urt=[0-9.-]*\).*/\1 &/' | sort -t= -k2 -rn | head -20
```

---

## 10. Incident runbook

Throughout this section, `$URI` is the Atlas connection string. Set it once per
session and every `mongosh` example below works as written — `mongosh` connects
to the database named in the URI, so `db` in each snippet is already the right
one:

```bash
URI=$(sudo grep '^DATABASE_URL=' /etc/erpsys.env | cut -d= -f2-)
```

Read it as an incident, not a checklist: every number in this deployment was
chosen so that a specific failure mode has a specific signature, and the point
of each subsection is to name that signature before you act.

### 10.1 Pool exhaustion

**Signature.** A burst of `503` from the API carrying a `Retry-After` header,
with `/api/ready` still returning 200 and no restart in the journal. The site
is up and correctly refusing work.

The exact body a client receives, in production:

```json
{
  "error": "The service is busy. Please retry in a moment.",
  "code": "POOL_EXHAUSTED"
}
```

`code: "POOL_EXHAUSTED"` is the confirmation — it is what
`middleware/errorHandler.ts` returns when the driver reports `MongoWaitQueueTimeoutError`
or `MongoPoolClearedError` (code 43). A 503 with any other code is something
else. The server-side line carries the full detail and the join key:

```
[error] rid=… status=503 code=POOL_EXHAUSTED MongoWaitQueueTimeoutError: …
```

**This is the system working.** `MONGO_WAIT_QUEUE_TIMEOUT_MS=5000` is a
deliberate load shed. The driver default is `0` — infinite — so the 26th
concurrent database operation does not fail, it waits forever holding an
Express handler open, and a 20-second spike becomes a permanent hang with
every socket in the process consumed. A 503 the client can retry is strictly
better than that.

Confirm it is pool exhaustion and not a database outage:

```bash
# 200 => Mongo is reachable, so the 503s are backpressure, not an outage.
curl -si http://127.0.0.1:3001/api/ready | head -1

# The confirmation line. Without it, you do not have pool exhaustion.
sudo journalctl -u erpsys --since '5 min ago' --no-pager \
  | grep -c 'code=POOL_EXHAUSTED'

# Every 503 in the window, by route, from the request log.
sudo journalctl -u erpsys --since '5 min ago' --no-pager \
  | grep '"status":503' | head -5
```

Read the pool gauges from `/api/metrics` (§9). The `grep` also returns the
`# HELP` and `# TYPE` comment lines, which is why only the last three are
shown:

```bash
curl -s http://127.0.0.1:3001/api/metrics | grep '^erpsys_mongo_pool'
```

```
erpsys_mongo_pool_checked_out 25
erpsys_mongo_pool_available 0
erpsys_mongo_pool_max 25
```

`checked_out == max` with `available == 0` is the confirmation.

What to do, in order:

1. **Wait.** With a 5s wait queue, exhaustion caused by a burst clears itself
   within seconds of the burst ending. Check again in 60 seconds before
   touching anything. Most of these resolve themselves.
2. **If it persists**, something is holding connections. A request that is
   slow enough to hold a pool slot for 5s+ is the cause, not the symptom.
   The per-route duration histogram names it directly:

   ```bash
   curl -s http://127.0.0.1:3001/api/metrics \
     | grep erpsys_http_request_duration_ms_count | sort -t' ' -k2 -rn | head
   ```

   Cross-reference the busiest route with its `_sum` (mean latency) and
   `_bucket` distribution. Nginx's access log is the second opinion:
   `urt=` above ~5000 on a route means it is sitting in the pool wait queue.

3. **Raise the pool** if the latency is Atlas-side and Atlas has headroom:

   ```bash
   sudo sed -i 's/^MONGO_MAX_POOL_SIZE=.*/MONGO_MAX_POOL_SIZE=40/' /etc/erpsys.env
   sudo systemctl restart erpsys
   ```

   Do this as a considered change, not a reflex. Each connection is a real
   Atlas connection; M10's limit is thousands, but the point of 25 is that
   concurrency stays _visible_ rather than hidden in a queue. If 40 does not
   fix it, raising it further will not either — the load is the problem.

4. **If Atlas itself is degraded** (`/api/ready` returning
   `{"reason":"database"}`), this is a different incident. Check the Atlas
   status page and the cluster's metrics.

What **not** to do: raise `MONGO_WAIT_QUEUE_TIMEOUT_MS`. Restoring the
infinite wait is a straight return to the failure mode this replaced.

### 10.2 Out of memory

**Signature.** `systemctl status erpsys` shows the unit going
`active (running)` → `failed` → `active` on a loop with `Restart=always`.
The journal says either:

```
[guard] uncaughtException ... JavaScript heap out of memory
```

or, from the kernel, an OOM kill:

```
systemd[1]: erpsys.service: A process of this unit has been killed by the OOM killer.
```

Which one you got matters:

- **V8 OOM** (`heap out of memory`, exit 1): the process hit
  `--max-old-space-size=3072` and the guard ran the graceful drain. Working as
  designed. The heap ceiling did its job.
- **cgroup OOM kill** (exit 137, no V8 message): the _cgroup_ limit of 4G was
  hit on something V8 does not account for — Buffers, the Mongo driver's
  socket and TLS buffers, or fragmentation. This one skips the entire graceful
  shutdown and severs every connection. It should be rare; if it is the
  common one, the ratio in §14 is wrong.

```bash
systemctl show erpsys -p MemoryCurrent -p MemoryPeak -p MemoryMax
sudo journalctl -u erpsys --since '1 hour ago' | grep -iE 'heap out of memory|OOM|killed'
sudo dmesg -T | grep -i 'killed process' | tail -5
```

Do, in order:

1. **Capture the state before restarting anything.** A restart destroys it.

   There is **no `SIGUSR2` heap-dump handler in this app** — nothing in
   `apps/server/src` installs one, so `kill -USR2` is a no-op and will not
   produce a file. Do not spend the incident on it. What is available:

   ```bash
   # The three gauges that separate "V8 is full" from "the cgroup is full".
   # This is the single most useful thing to check, and it is instant.
   curl -s http://127.0.0.1:3001/api/metrics \
     | grep -E 'resident_memory|heap_size_used|external_memory'
   ```

   | Reading                                                           | Diagnosis                                                                                           |
   | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
   | `heap_size_used` high, `external_memory` low                      | Application objects. A real leak, or a ceiling that is simply too low.                              |
   | `heap_size_used` low, `external_memory` or `resident_memory` high | Not the V8 heap. Driver Buffers and TLS, or fragmentation. §14's ratio is wrong.                    |
   | `resident_memory` climbing and `heap_size_used` flat              | The leak is outside V8 entirely — suspect the Mongo driver's connection pool or an unclosed stream. |

   ```bash
   # A core, if one was produced. Needs the unit to allow it, which it does
   # not currently — see the note below.
   sudo coredumpctl list erpsys --no-pager | tail -5
   ```

   If a future change adds a dump handler, this is the command that gets it:

   ```bash
   sudo -u erpsys kill -USR2 $(systemctl show -p MainPID --value erpsys)
   sudo ls -lh /var/lib/erpsys/
   ```

   `StateDirectory=erpsys` makes `/var/lib/erpsys` the writable place for it.
   Worth knowing that `coredumpctl` needs `LimitCORE=infinity` and
   `Storage=`/`ProcessSizeMax=` in `[Coredump]` in `systemd-coredump.conf`,
   neither of which this unit sets — so today a core is unlikely to exist.

2. **Raise the ceiling**, one number at a time, and raise both:

   ```bash
   # /etc/erpsys.env has no heap setting; the heap lives in the unit.
   sudo sed -i 's|--max-old-space-size=3072|--max-old-space-size=4096|' /etc/systemd/system/erpsys.service
   sudo sed -i 's/^MemoryMax=4G/MemoryMax=5G/' /etc/systemd/system/erpsys.service
   sudo systemctl daemon-reload && sudo systemctl restart erpsys
   ```

   The heap must stay below the cgroup limit — see §14 for why, and for the
   ratio to keep. `MemoryHigh` is the early-warning line; leave it below
   `MemoryMax`.

3. **If the host has no memory left**, the ceiling cannot rise. `MemoryMax=4G`
   on an 8GB host already assumes ~4GB for the OS, Nginx, and page cache.
   Upgrade the VM.
4. **Do not add swap to paper over it.** `MemorySwapMax=0` is deliberate: a
   memory problem that silently pages for 30 seconds is a memory problem that
   now looks like a database problem.

### 10.3 Wedged department

**Symptom.** Students see a department permanently showing as busy, or
"someone is already serving this department", and the department accepts
nobody. Advisers who are actually online and idle see nothing to serve.

**Cause.** This is the invariant from Phase 1 working, not a bug. The partial
unique index

```
enrollment_queue: { departmentId, academicYearId } unique
                  partialFilterExpression: { status: "IN_PROGRESS" }
```

means **at most one `IN_PROGRESS` row per department per year**, enforced by
the database. A stuck row blocks the department until something reclaims it.

**The interval sweep is the intended reclaimer.** `sweepStaleServing` runs
every 60s and returns any `IN_PROGRESS` row whose `servedAt` (or `joinedAt` if
`servedAt` is null) is older than `STALE_SERVING_MS` = 90 minutes back to
`WAITING`. So a genuinely wedged department means one of:

1. The row is **less than 90 minutes old** and the adviser really did abandon
   it. Nothing is broken. The student waits out the clock — but 90 minutes of
   a blocked department on enrollment day is its own problem, and lowering
   `STALE_SERVING_MS` is a code change, not an operational one.
2. **The sweep is not running.** `lib/sweeps/sweeps.ts` runs the sweeps on a
   `setInterval` and once at boot, `unref`'d. If the process was restarted
   repeatedly the boot run happened, but if the interval died, or the
   process has been up for a long time and the sweep throws, departments wedge
   permanently. This is the case worth catching early.

Check the sweep first. `lib/sweeps/sweeps.ts` logs **only on failure** — a healthy
sweep is silent, so an empty grep is the good outcome, and any hit is the
finding:

```bash
sudo journalctl -u erpsys --since '2 hours ago' --no-pager | grep -i sweeps
```

```
[sweeps] sweep failed, continuing to the next tick: <stack>
[sweeps] tick skipped — the previous sweep is still running
```

`tick skipped` means a sweep took longer than 60 seconds, which under
`maxPoolSize=25` is itself a symptom of pool pressure (§10.1). `sweep failed`
with a stack is the one to read carefully: the loop continues by design, so the
process stays up and departments wedge quietly while nothing looks broken.

Two more signals:

```bash
# The sweep writes an audit row every time it reclaims a row, so this is the
# record of AUTOMATIC reclaims — compare it against the manual procedure below.
mongosh "$URI" --quiet --eval '
db.admin_action_log.find({ action: "AUTO_RETURN_STALE_SERVING" })
  .sort({ at: -1 }).limit(5).forEach(printjson)
'

# Has the process been restarting? A restart runs the sweep once at boot, which
# masks a dead interval for an hour or two.
systemctl show erpsys -p NRestarts -p ActiveEnterTimestamp
```

List the wedged rows. `department.name` and `academic_year.label` come back
joined in, because "Information Technology" is what you will be told and
`dept-1b2c` is not:

```bash
mongosh "$URI" --quiet --eval '
db.enrollment_queue.aggregate([
  { $match: { status: "IN_PROGRESS" } },
  { $lookup: { from: "department",     localField: "departmentId",  foreignField: "_id", as: "dept" } },
  { $lookup: { from: "academic_year",  localField: "academicYearId", foreignField: "_id", as: "yr" } },
  { $project: {
      _id: 1, departmentId: 1, servedById: 1, servedAt: 1, joinedAt: 1,
      dept: { $first: "$dept.name" },
      year: { $first: "$yr.label" },
      ageMinutes: { $divide: [ { $subtract: [ new Date(), { $ifNull: [ "$servedAt", "$joinedAt" ] } ] }, 60000 ] }
  } },
  { $sort: { ageMinutes: -1 } }
]).forEach(printjson)
'
```

Expected shape:

```
{ "_id" : "queue-3f2a…", "departmentId" : "dept-…", "servedById" : "user-…",
  "servedAt" : ISODate("2026-09-26T01:14:00Z"), "joinedAt" : ISODate("2026-09-26T01:02:00Z"),
  "dept" : "Information Technology", "year" : "2026-2027", "ageMinutes" : 137 }
```

Interpretation:

- `ageMinutes` under 90 → the sweep will get it. Tell the adviser. Do nothing.
- `ageMinutes` over 90 and the sweep is not logging → **manual reclaim**, below.
- `servedById` null → an `IN_PROGRESS` row with no adviser at all. This is
  the case the index makes most damaging, because it blocks a department that
  nobody is even working on. Reclaim it.

#### Manual reclaim of a stuck `IN_PROGRESS` row

> **This is a manual, audited action.** It writes to `enrollment_queue`,
> `admin_action_log`, and `notification`. It puts a student back in the queue
> **while an adviser may still have their record open**, and the student will
> be served by whoever calls `beginServing` next. Do it only when you have
> confirmed the adviser is not there, and record who did it. Every step below
> is a separate `mongosh` invocation on purpose: if one produces an
> unexpected result, stop.

**Step 1 — establish that the adviser is gone.** Not "the department looks
stuck", but the specific adviser.

```bash
ADVISER="user-…"          # the servedById from the listing above
mongosh "$URI" --quiet --eval '
print("now: " + new Date().toISOString());
db.adviser_availability.find(
  { adviserId: "'"$ADVISER"'" },
  { _id: 1, isOpen: 1, lastActiveAt: 1, autoClosedAt: 1 }
).forEach(printjson)
'
```

`lastActiveAt` is refreshed by the `instructor.availability.heartbeat`
procedure, which the instructor console calls while it is open. Three
thresholds matter, and they are all in code:

| Threshold              | Value  | Meaning                                                                                                                                                                                                                                                                               |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRESENCE_STALE_MS`    | 3 min  | Below this the adviser counts as actively present (`isAdviserActive`). **If `lastActiveAt` is within 3 minutes, stop: the adviser is live.** Tell them to click stop serving. This is not the procedure for that case.                                                                |
| `AVAILABILITY_IDLE_MS` | 60 min | Past this, `sweepStaleAvailability` auto-closes the row (`isOpen: false`, `autoClosedAt` set). So an adviser who vanished leaves a _closed_ availability row and a _still-held_ serving slot — which is exactly the wedge. `autoClosedAt` being set is strong evidence they are gone. |
| `STALE_SERVING_MS`     | 90 min | Past this, `sweepStaleServing` should have returned the student to the queue. Anything still `IN_PROGRESS` beyond it means the sweep is broken, and that is the finding.                                                                                                              |

**Step 2 — capture the row before touching it.** This is the rollback: the
exact document as it stands now.

```bash
mongosh "$URI" --quiet --eval '
printjson(db.enrollment_queue.findOne({ _id: "queue-…" }))
'
```

Keep the output. If step 4 goes wrong, this is how you put it back.

**Step 3 — flip the row back to `WAITING`.** The status guard is in the
filter, not a separate read, so this is a single atomic compare-and-set. It is
also the same shape the sweep uses
(`{ $set: { status: "WAITING", servedById: null, servedAt: null } }`).

```bash
mongosh "$URI" --quiet --eval '
const entryId = "queue-…";
const r = db.enrollment_queue.findOneAndUpdate(
  { _id: entryId, status: "IN_PROGRESS" },
  { $set: { status: "WAITING", servedById: null, servedAt: null } },
  { returnDocument: "after" }
);
printjson(r);
'
```

**Check the output.** `null` means the filter did not match: the row was
already reclaimed (the sweep got there first — that is the _good_ outcome,
re-run the listing from §10.3 to confirm the department is unblocked) or the
`status` is not `IN_PROGRESS` (you have the wrong `_id`). Do not proceed to
step 4 on a `null`.

A returned document means the row is back in the queue and the department's
partial-index slot is free.

**Step 4 — write the audit row.** `admin_action_log` is what makes this
action accountable. `actorId` is the operator, not the adviser.

> `MANUAL_RETURN_STALE_SERVING` is a **new** action string. The code emits
> `AUTO_RETURN_STALE_SERVING` (`lib/instructor-helpers/instructor-helpers.ts:186`) and nothing
> else, so this value is not in `apps/server/src` and you will not find it if
> you go looking. That is intentional: it is what lets you tell an automatic
> reclaim from a human one when reading the log later. Do not "fix" it by
> reusing the `AUTO_` name.

```bash
mongosh "$URI" --quiet --eval '
db.admin_action_log.insertOne({
  _id: "admin-action-" + ObjectId().toString(),
  actorId: "operator:<your name or handle>",
  action: "MANUAL_RETURN_STALE_SERVING",
  targetRef: "EnrollmentQueue:queue-…",
  at: new Date()
});
print("logged");
'
```

Note the `_id` is a **string**, matching the `genId()` convention
(`<prefix>-<uuid>`) used everywhere in `apps/server/src/lib/db/ids.ts`. A raw
`ObjectId` here would be inconsistent with every other log row.

**Step 5 — tell the adviser.** The student gets no notification from a status
flip, so the adviser who was serving them needs to know their record is gone,
or they will sit there wondering.

```bash
mongosh "$URI" --quiet --eval '
db.notification.insertOne({
  _id: "notification-" + ObjectId().toString(),
  userId: "'"$ADVISER"'",
  type: "STALE_SERVING_RETURNED",
  title: "Serving lock released by an operator",
  body: "Your serving record was released by an operator and the student was returned to the queue.",
  createdAt: new Date()
});
print("notified");
'
```

The instructor console picks this up on its next poll (20s). An SSE publish
cannot be triggered from `mongosh`; if the adviser needs it sooner, they can
reload.

**Step 6 — verify the department is unblocked.**

```bash
# No rows for this department:
mongosh "$URI" --quiet --eval '
print(db.enrollment_queue.countDocuments(
  { departmentId: "dept-…", status: "IN_PROGRESS" }
));
'
# 0
```

Then load the student queue page and confirm the department accepts a join,
and check `journalctl -u erpsys --since '5 min ago'` for a fresh 5xx.

**If step 3 was wrong, roll it back with the step 2 capture.** It was an
update, not a delete, so the rollback is an `updateOne` restoring the three
fields you captured — do not `deleteOne` and re-insert:

```bash
mongosh "$URI" --quiet --eval '
db.enrollment_queue.updateOne(
  { _id: "queue-…" },
  { $set: { status: "IN_PROGRESS", servedById: "<from the step 2 capture>", servedAt: "<from the step 2 capture>" } }
);
'
```

This will fail with a duplicate-key error (code 11000) if another row has since
taken the department's serving slot. **That is the correct outcome** — it means
a real adviser is now serving someone, and forcing the rollback would either
fail or evict them. Do not force it. Also delete the `admin_action_log` row you
added in step 4 and the notification from step 5, so the audit trail does not
record a reclaim that was undone.

#### After any manual reclaim

The sweep did not do its job. That is the actual incident — the reclaim above
is treating the symptom, and the student is back in the queue but nothing
stops it happening again on the next adviser who closes a laptop. File it, and
work the sweep's health in §11.

---

## 11. Verification checks

Run these after any change to `deploy/`, to `lib/platform/env.ts`, or to the shutdown
sequence. They take about a minute and catch the failures that look like
application bugs.

### Keepalive consistency

The single most common intermittent-502 cause on this stack, and it
correlates with nothing in the application. Nginx and Node must agree:

```bash
# Nginx, client-facing
nginx -T 2>/dev/null | grep -E '^\s*keepalive_timeout'
# Nginx, upstream pool
nginx -T 2>/dev/null | grep -A6 'upstream erpsys_app' | grep keepalive_timeout
# Node
grep -nE 'keepAliveTimeout|headersTimeout|requestTimeout|maxConnections' \
  /srv/erpsys/apps/server/src/index.ts
```

Expected:

| Side                           | Value                   | File                       |
| ------------------------------ | ----------------------- | -------------------------- |
| Nginx upstream pool            | `keepalive_timeout 70s` | `deploy/nginx/erpsys.conf` |
| Node `server.keepAliveTimeout` | `65000`                 | `apps/server/src/index.ts` |
| Node `server.headersTimeout`   | `70000`                 | `apps/server/src/index.ts` |
| Nginx client-facing            | `keepalive_timeout 65s` | `deploy/nginx/erpsys.conf` |

The pool owner must be the later of the two — Nginx (70s) > Node (65s) — so
Nginx always sees Node's FIN and drops the socket itself rather than picking it
out of the pool and writing to one the other end has already closed. Reverse
that and students get a 502 roughly once per keepalive cycle with nothing in
the logs to explain it.

`headersTimeout=70000` must stay above `keepAliveTimeout=65000`; Node starts
dropping request headers otherwise, which is the same symptom from a different
cause. (It currently shares the value 70000 with Nginx's upstream
`keepalive_timeout`. That is a coincidence, not a relationship — do not couple
them.)

### Other server timeouts and connection budgets

```bash
grep -nE 'keepAliveTimeout|headersTimeout|requestTimeout|maxConnections|server\.timeout' \
  /srv/erpsys/apps/server/src/index.ts
```

| Setting          | Value         | Why                                                                                                                                                                                                  |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestTimeout` | `120000`      | Time to _receive_ a request, not to answer one. It does not apply to the SSE stream, whose request is complete the moment the headers land.                                                          |
| `maxConnections` | `2048`        | Hard cap on concurrent sockets: short-lived request sockets plus one per live SSE subscriber. Nginx must be able to reach it, so `worker_connections` and `LimitNOFILE` both have to sit above 2048. |
| `server.timeout` | `0` (default) | Must stay 0. A non-zero socket-inactivity timeout kills SSE streams and any request slower than the value.                                                                                           |

```bash
systemctl show erpsys -p LimitNOFILE                                    # 16384
grep -nE 'worker_connections|worker_rlimit_nofile|worker_processes' /etc/nginx/nginx.conf
```

`worker_connections` lives in the `events` block of `/etc/nginx/nginx.conf`,
not in this file, so it is not something `deploy/nginx/erpsys.conf` can set.
Its **total** across workers must stay above the app's `maxConnections=2048`,
because that is the number of upstream sockets Nginx can be holding at once.
The stock `worker_connections 1024` with `worker_processes auto` clears that
on a 4-core box (4 × 1024 = 4096) with little margin; raise it to 4096 per
worker if you see connection errors under load.

Note that `maxConnections=2048` is reached by **concurrent sockets**, not
concurrent students. 1000 students polling produce a few hundred concurrent
requests plus however many instructors are subscribed to SSE. If you ever see
connections refused at the app, this is the number to raise — and 2048 is a
deliberately conservative starting point, not a measured ceiling.

### The sweep

`lib/sweeps/sweeps.ts` runs both sweeps on a `SWEEP_INTERVAL_MS=60000` interval,
`unref`'d, guarded against re-entry, plus once at boot, started from the
`listen()` callback. It is the only thing that reclaims a stale
`IN_PROGRESS` row, so it is load-bearing (§10.3). There is no metric that
reports it directly, so watch for its effect instead:

```bash
# IN_PROGRESS rows older than 90 minutes should never exist. If one does, the
# sweep is not running.
mongosh "$URI" --quiet --eval '
db.enrollment_queue.countDocuments({
  status: "IN_PROGRESS",
  $or: [{ servedAt: { $lt: new Date(Date.now() - 90*60*1000) } },
        { servedAt: null, joinedAt: { $lt: new Date(Date.now() - 90*60*1000) } }]
})
'
# 0
```

Worth running on a schedule during enrollment day, not just when someone
reports a stuck department.

### Sanity

```bash
HOST=https://erpsys.example.edu.ph
ASSET=$(ls /srv/erpsys/apps/web/dist/assets | head -1)

curl -s -o /dev/null -w 'health  %{http_code}\n' $HOST/api/health    # 200
curl -s -o /dev/null -w 'ready   %{http_code}\n' $HOST/api/ready     # 200
curl -s -o /dev/null -w 'spa     %{http_code}\n' $HOST/app/student   # 200, index.html
curl -s -o /dev/null -w 'asset   %{http_code}\n' $HOST/assets/$ASSET # 200
curl -s -o /dev/null -w 'rpc404  %{http_code}\n' $HOST/rpc/nope       # 404, NOT index.html
curl -s -o /dev/null -w 'metrics %{http_code}\n' $HOST/api/metrics    # 404, see below
```

`rpc404` is the one that catches a misconfigured SPA fallback: if a `^~`
prefix on `/rpc/` is missing, an unknown RPC procedure returns `200` with a
page of HTML and the client fails with a parse error instead of a 404.

`metrics` must be `404`. That is the check that the metrics endpoint is not
public — Nginx returns it unconditionally, and if you have enabled the proxied
variant then `METRICS_TOKEN` must be set or the endpoint is world-readable.

```bash
# SSE opens, sends its retry hint, and stays open.
curl -sN -m 5 -o /dev/null -w 'sse    %{http_code}\n' https://erpsys.example.edu.ph/api/events
# 401 without a session — that is correct, and it proves the stream is not 502ing.
```

### The real test: a deploy under load

The keepalive and drain behaviour cannot be verified from a cold, idle box —
there are no reused connections and nothing in flight. Both must be exercised
while requests are running. That is what the load test in §12 is for; run it
once against a restart before enrollment day and watch for 5xx in
`erpsys.access.log`.

---

## 12. Load-test gate

**The p95 latency budget is not fixed yet, and inventing one here would be
worse than leaving it blank.** The spec defers it deliberately: the budget is
set at the _end_ of Phase 3, from the before/after numbers recorded during
that phase, and only then written into this section. A number chosen now would
be a guess dressed up as a target, and a gate that is wrong on day one gets
ignored on day two.

```
┌──────────────────────────────────────────────────────────────────────┐
│  p95 latency budget:  NOT YET SET                                    │
│                                                                      │
│  Source:  the before/after numbers recorded during Phase 3.          │
│  Owner:   the Phase 3 implementation, at its end.                    │
│  Action:  write the number here, cite the commit that measured it,   │
│           and set LOAD_P95_BUDGET_MS to match.                       │
│                                                                      │
│  Until then this gate is incomplete: it runs and reports a measured  │
│  p95, but marks that one assertion SKIP. A SKIP is not a pass.        │
└──────────────────────────────────────────────────────────────────────┘
```

`load/run.mjs` enforces this honestly: with `LOAD_P95_BUDGET_MS` unset it
prints every measured p95 under a `MEASURED p95 — NO BUDGET HAS BEEN SET YET`
heading and marks the assertion `SKIP`, exiting 0. It never invents a target.
Set `LOAD_REQUIRE_P95_BUDGET=1` to turn the absence into a `FAIL` — that is
the switch to flip in the nightly gate once the number exists, and leaving it
off is what lets the gate run today without lying about what it verified.

The other four assertions are fixed, wired, and enforceable now:

- Zero unhandled 5xx. A 503 is Phase 0's _handled_ backpressure and is
  reported separately; `LOAD_STRICT_5XX=1` counts it as a failure. Socket
  errors and timeouts fail this one.
- Zero duplicate `(studentProfileId, academicYearId)` in `enrollment_queue`,
  by a direct Mongo `$group` — not inferred from HTTP responses.
- At most one `IN_PROGRESS` row per `(departmentId, academicYearId)`, same
  way.
- Heap below the `--max-old-space-size` ceiling, from `/api/metrics`.

Assertions 3 and 4 are the real value: they are what proves the Phase 1 unique
indexes held under concurrency, and they are asked of the collection because
the HTTP surface can only report what the server chose to return.

### Running it

`pnpm test:load` → `node load/run.mjs`. It needs a **running server** and a
database it may seed and tear down; it builds its own 500 students, sessions,
step verifications, an adviser, and an open queue, so no pre-seeded data is
required. Full detail is in `load/README.md`; the operational shape:

```bash
# Prerequisite: the server is already up and the env is loaded, because the
# runner mints Better Auth session cookies and they are HMAC-signed with
# BETTER_AUTH_SECRET. It must be the same value the server booted with.
cd /srv/erpsys
sudo -u erpsys bash -c 'set -a; . /etc/erpsys.env; set +a; exec pnpm test:load'
```

`pnpm test:load -- --help` prints every variable with its default.
`LOAD_BASE_URL` defaults to `http://127.0.0.1:3001`; for an honest run, point
it at the deployed origin and set `LOAD_ORIGIN` to match, or the RPC origin
check in `routes/rpc.ts` rejects the writes:

```bash
sudo -u erpsys bash -c 'set -a; . /etc/erpsys.env; set +a; exec env \
  LOAD_BASE_URL=https://erpsys.example.edu.ph \
  LOAD_ORIGIN=https://erpsys.example.edu.ph \
  LOAD_MAX_OLD_SPACE_MB=3072 \
  pnpm test:load'
```

`LOAD_MAX_OLD_SPACE_MB=3072` must match `--max-old-space-size` in the unit
(§14). Setting it lower turns the heap assertion into a test of a number nobody
committed to. `LOAD_TEARDOWN=0` keeps the seeded rows for inspection;
`LOAD_DURATION_S` (default 60) and `LOAD_STUDENTS` (default 500) set the shape.

Exit codes: `0` pass (possibly with `SKIP`), `1` an assertion failed, `2` a
prerequisite was not met.

**Do not run this against production during enrollment.** It writes 500
students and cleans them up afterwards, and 500 concurrent writers against a
live queue is a worse test than the one you meant to run. Run it against a
staging database, or against production with enrollment closed.

```bash
# What it does NOT cover, so you do not read a green run as more than it is.
# 1. The adviser-side race. The scenario drives the student surface only, so
#    nothing ever moves a row to IN_PROGRESS and assertion 4 usually has
#    nothing to contradict — the run says so when that happens. N parallel
#    serve calls have no automated test in the MVC tree (the old suite's
#    concurrency tests were not ported); the single-caller FIFO guard is
#    apps/server/tests/routes/queues.test.ts.
# 2. A restart. The drain, keepalive and retry-window behaviour cannot be
#    verified from a static run. Start the load, `systemctl restart erpsys`
#    underneath it, and watch for 5xx — that is the only way to exercise §7.
```

Assertions to run before the load, so a failure afterwards is attributable to
the load and not to pre-existing data:

```bash
mongosh "$URI" --quiet --eval '
printjson({
  inProgress: db.enrollment_queue.countDocuments({ status: "IN_PROGRESS" }),
  byDepartment: db.enrollment_queue.aggregate([
    { $match: { status: "IN_PROGRESS" } },
    { $group: { _id: { d: "$departmentId", y: "$academicYearId" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]).toArray()
});
'
#   Expected before the run: the byDepartment array is EMPTY. A non-empty array
#   means a pre-existing violation, and the Phase 1 migration (§13) must be
#   completed first.
```

And while it runs, watch the process rather than the test client:

```bash
watch -n2 'curl -s http://127.0.0.1:3001/api/metrics \
  | grep -E "resident_memory|heap_size_used|external_memory|event_loop|mongo_pool"'
sudo journalctl -u erpsys -f
sudo tail -f /var/log/nginx/erpsys.access.log | grep -E ' 5[0-9][0-9] '
```

Signals to read off the run:

| Observation                                                         | Meaning                                                                                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 503s with `Retry-After`, `/api/ready` 200                           | Pool exhaustion shedding correctly. This is what `LOAD_STRICT_5XX=0` (the default) is for. Record the rate; if it is sustained rather than a burst, the pool size needs tuning (§10.1). |
| 5xx that are not 503                                                | A real bug. Any unhandled 5xx fails the gate.                                                                                                                                           |
| `erpsys_mongo_pool_checked_out` pinned at 25 for the whole run      | The pool, not the process, is the limit.                                                                                                                                                |
| `erpsys_event_loop_delay_ms{quantile="0.99"}` in the hundreds of ms | The process is the bottleneck. This is what Phase 3's `$group` counts are meant to prevent; if it is still happening, the read-path work did not land.                                  |
| `erpsys_nodejs_heap_size_used_bytes` climbing and not returning     | A leak, not a cache.                                                                                                                                                                    |
| `erpsys_nodejs_external_memory_bytes` climbing                      | Memory outside the V8 heap — driver Buffers and TLS. This is the number §14's ratio protects against, and it rising toward 1 GB means the cgroup limit is the one that will be hit.     |
| A duplicate pair or a double-served department reported             | The Phase 1 indexes are not actually in place. Check `db.enrollment_queue.getIndexes()` for `uq_enrollment_queue_student_year` and `uq_enrollment_queue_department_serving` (§13).      |

CI: `.github/workflows/ci.yml` runs `pnpm check` and `pnpm test` on every push.
`.github/workflows/load-gate.yml` is the scheduled/manual load run — it is not
a PR blocker, because it needs a seeded database.

### Recording the number when it exists

When Phase 3 fixes the budget, three places have to change together or the
gate and the runbook will disagree:

1. This section: the measured p95, the load it was measured under, and the
   commit that measured it.
2. `LOAD_P95_BUDGET_MS` in the nightly workflow's env.
3. `LOAD_REQUIRE_P95_BUDGET=1`, so a missing budget stops being a `SKIP` and
   becomes a `FAIL`.

---

## 13. Phase 1 migration — audit → repair → index

**This is the only step in the whole rollout that needs a maintenance
window.** The unique indexes reject writes that previously succeeded
silently, so building them against a database that already contains
violations fails. The sequencing is mandatory and the order is not
interchangeable.

Build the indexes **once, before enrollment opens, against
production-sized data.** On a large collection `createIndex` takes time and
holds locks, and students joining a queue during that window is exactly the
scenario the whole exercise exists to prevent.

### Why the audit has to come first

Five classes of pre-existing violation will hard-fail the index build with an
error that does not name the offending data:

- duplicate `(studentProfileId, academicYearId)` in `enrollment_queue`;
- a department with more than one `IN_PROGRESS` row for a year;
- duplicate `studentNumber` in `student_profile`;
- an `IN_PROGRESS` row missing `departmentId` or `academicYearId` — Mongo
  requires every document matching a partial index's filter to carry the
  indexed key fields, and such a row fails the _build_ rather than producing a
  duplicate-key error;
- duplicate `user.email`, `session.token`, `account` provider keys — the
  Better Auth indexes are unique too.

### The procedure

**Step 0 — take the window.** Announce it. Enrollment must be closed; the
repair script writes.

**Step 1 — audit, dry run.** `src/lib/db/queue-repair.ts` is **dry-run by
default**: it computes every mutation it would make, prints them, writes
nothing, and exits 1 if violations remain. That is the audit, and it is the
same `auditQueueInvariants()` that `ensureIndexes()` runs at boot.

```bash
cd /srv/erpsys
sudo -u erpsys bash -c 'set -a; . /etc/erpsys.env; set +a; exec pnpm --filter @erpsys/server exec tsx src/lib/db/queue-repair.ts'
```

Sourcing the env file in a subshell is the reliable way to run an operator
command with the same configuration the service uses, and it avoids quoting
values through `env $(grep ... | xargs)`.

**Read the whole output before running anything that writes.** Exit code 0
means the audit is clean and you can skip to step 4. A dirty report looks
like:

```
[queue-repair] dry run: 4 mutation(s) planned, 0 applied. 3 blocking violation(s) remain.
auditQueueInvariants: 3 blocking violation(s).
  departments with more than one IN_PROGRESS row: 1
    - department=dept-1b2c year=year-2026 entries=[queue-3f2a:IN_PROGRESS, queue-9d4e:servedBy=user-77]
  duplicate studentNumber values: 1
    - studentNumber=2026-0001 profiles=[sp-11, sp-94]
  IN_PROGRESS rows missing a partial-index key field: 1
    - entry=queue-aa01 student=sp-22 missing=[departmentId]
[queue-repair] violations remain. Duplicate student numbers and auth keys are NOT auto-repaired — resolve them by hand, then run ensureIndexes() again.
```

Two things to read carefully:

- **What it will not fix.** Duplicate `studentNumber` values and duplicate
  auth keys (`user.email`, `session.token`, `account` provider keys) are
  reported under `unrepairable` and are **not** auto-repaired. A duplicate
  `studentNumber` means two profiles claim one student number and a human has
  to decide which is which. Do not automate that decision by re-running the
  script.
- **What it will.** Duplicate `(studentProfileId, academicYearId)` queue
  entries and departments with two `IN_PROGRESS` rows are resolved
  automatically, and each one is logged individually with the document ids it
  touched. That log is the record of what happened to student data.

**Step 2 — repair.** The same command with `--apply`:

```bash
cd /srv/erpsys
sudo -u erpsys bash -c 'set -a; . /etc/erpsys.env; set +a; exec pnpm --filter @erpsys/server exec tsx src/lib/db/queue-repair.ts --apply'
```

Expected:

```
[queue-repair] applied: 4 mutation(s) planned, 4 applied. 0 blocking violation(s) remain.
```

`0 applied` when you expected 4 means the state changed under you — most
likely the service ran and its boot-time sweep reclaimed something. Re-run the
dry run and read it again rather than forcing the apply.

Two operational notes:

- **It needs dev dependencies.** `tsx` is a `devDependency` of
  `@erpsys/server`, so `pnpm install --prod` on the server removes it and the
  command fails with a module-not-found. Install with dev dependencies
  present, or run the repair from a build host pointed at the same database.
- **Take an Atlas snapshot first** (see the rollback note at the end of this
  section). The script writes to student data and its decisions are
  mechanical, not supervised.

**Step 3 — re-audit.** Run step 1 again. It must report `0 blocking
violation(s)`. **Do not go straight to step 4** — `ensureIndexes()` will
refuse anyway, and the refusal is a safety net, not the plan.

**Step 4 — build the indexes.** Start the service; `ensureIndexes()` runs at
boot, after the Mongo ping and before `listen()`.

```bash
sudo systemctl restart erpsys
sudo journalctl -u erpsys -f
```

Expected:

```
[indexes] preflight audit clean - creating indexes
[server] database reachable, indexes ensured
[server] listening on :3001
```

Verify:

```bash
mongosh "$URI" --quiet --eval 'db.enrollment_queue.getIndexes().forEach(i => print(i.name, i.unique ? "UNIQUE" : ""))'
```

The two that matter:

```
uq_enrollment_queue_student_year    UNIQUE
uq_enrollment_queue_department_serving UNIQUE   (partial: status = IN_PROGRESS)
```

A warning in the log along the lines of `already exists with a different key`
means an operator index with a colliding name was left alone on purpose. The
function never drops an index. Resolve it by hand: compare
`db.<collection>.getIndexes()` against the key patterns in
`apps/server/src/lib/db/indexes.ts` and drop the wrong one with
`db.<collection>.dropIndex("<name>")` once you have confirmed nothing depends
on it.

**Step 5 — prove the invariants hold under concurrency.** The indexes are the
whole point of Phase 1, and a unique index that exists has not been shown to
work. The MVC tree has no N-parallel test: the old suite's concurrency tests
were not ported, so the in-suite proof is currently the single-caller guards
below, plus the load gate's concurrent run.

- `apps/server/src/lib/db/indexes.test.ts` — `ensureIndexes` idempotency and
  `auditQueueInvariants` duplicate/double-serving detection
- `apps/server/tests/routes/queues.test.ts` — the single-caller FIFO guard
  ("refuses to skip the head of the line")
- `load/run.mjs` via `.github/workflows/load-gate.yml` — the only genuinely
  concurrent exercise (500 students)

```bash
cd /srv/erpsys && sudo -u erpsys pnpm test
```

These use a fake database with a barrier, so they run in CI without a seeded
Atlas cluster. That is a real limitation worth stating: they prove the service
handles `11000` correctly and that the invariant holds, not that a production
cluster enforces it. The `getIndexes()` check above and the live query below
are what close that gap.

Then confirm on live data that a department cannot be double-served:

```bash
mongosh "$URI" --quiet --eval '
db.enrollment_queue.aggregate([
  { $match: { status: "IN_PROGRESS" } },
  { $group: { _id: { d: "$departmentId", y: "$academicYearId" }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } }
]).forEach(printjson)
'
# Empty. Permanently.
```

**Step 6 — close the window.** Re-open enrollment, and post the sweep health
note: from now on the 60s interval sweep is load-bearing, and if it stops, not
only does stale data accumulate, departments wedge (§10.3).

### Rolling back the migration

Take an Atlas snapshot before step 2. If the repair script damages data, it is
a manual restore from that snapshot — the script makes no attempt at its own
rollback. The restore drops everything written after the snapshot, so on
enrollment day that means every queue entry, every notification, and every
step verification since. Take the snapshot in a window when nothing is
happening.

```bash
mongosh "$URI" --quiet --eval 'db.getSiblingDB("admin").runCommand({ listDatabases: 1 }).databases.forEach(d => print(d.name, d.sizeOnDisk))'
```

Dropping the unique indexes afterwards is possible but leaves the corruption
the indexes were added to prevent, so treat an index drop as the start of a
re-run, not as a rollback.

---

## 14. Heap and cgroup sizing

```
ExecStart=/usr/bin/node --max-old-space-size=3072 dist/index.js
MemoryHigh=3G
MemoryMax=4G
MemorySwapMax=0
```

**The V8 heap ceiling must stay below the cgroup limit.** V8's old space is
only part of the resident set, and `erpsys_nodejs_external_memory_bytes` is
the gauge that names the rest: Buffers, the TLS and socket buffers for every
Atlas connection, V8 code space and metadata, and the Node binary itself. At
the target load that is 25 pooled connections' worth of driver buffers plus a
lot of transient allocation.

If the two numbers were equal, the cgroup would OOM-kill the process in the
instant V8 reached the ceiling. That is an uncatchable `SIGKILL`: the whole
graceful shutdown is skipped, every in-flight request is severed, and the
journal shows `status=137/SIGKILL` instead of `[shutdown] complete, exiting 0`.
3072/4096 = 75% leaves roughly 1 GB of cgroup headroom for everything V8 does
not account for.

With the heap below the limit, the failure order is the good one: V8 hits its
own ceiling first, throws a catchable allocation failure, and `lib/guard/guard.ts`
plus `lib/shutdown/shutdown.ts` get to run the ordered drain. The cgroup OOM is the
backstop for what V8 cannot see — native allocations, the driver's buffers,
fragmentation.

`MemorySwapMax=0` is deliberate and not a default to change: a memory problem
that silently pages to disk for 30 seconds becomes a latency problem that
looks like a database problem. `MemoryHigh=3G` is the early-warning line
below the hard limit, giving reclaim a chance to run before the OOM killer
does.

### These are estimates

**3072 and 4G are estimates, and they are not to be tuned from a laptop or
from a guess.** They are placeholders that give the right _shape_ — heap
comfortably under the cgroup, cgroup under the host — and the right
_relationship_. The absolute numbers have no evidence behind them yet.

Retune them from the Phase 4 metrics under real load, per the spec's risk
table. Every series below comes from `/api/metrics` (§9), and the whole
exercise needs an `NRestarts`-clean run under load to be worth anything —
metrics reset on every restart:

| Reading                                                                                                                                   | Diagnosis                                                                                        | Action                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `erpsys_nodejs_heap_size_used_bytes` peaks below ~60% of 3072 MB                                                                          | The ceiling is generous.                                                                         | Nothing. Lowering it buys nothing.                                                                                          |
| `erpsys_nodejs_heap_size_used_bytes` regularly above ~85% of 3072 MB, with GC thrash in the event-loop delay                              | V8 is the constraint.                                                                            | Raise the heap **and** `MemoryMax` together, keeping the ratio.                                                             |
| `erpsys_nodejs_heap_size_used_bytes` low but `erpsys_nodejs_external_memory_bytes` or `erpsys_process_resident_memory_bytes` near 4096 MB | The cgroup is the binding constraint, and it is memory V8 does not see — driver Buffers and TLS. | Raise `MemoryMax`, or reduce `MONGO_MAX_POOL_SIZE` (25 connections is the multiplier on that memory).                       |
| `erpsys_process_resident_memory_bytes` climbing monotonically across a whole enrollment day                                               | A leak.                                                                                          | No amount of headroom fixes it. Work the gauges in §10.2 to find out whether the retainer is inside or outside the V8 heap. |
| Exit 137 with no `JavaScript heap out of memory` in the journal                                                                           | The cgroup limit is being hit on memory V8 does not account for.                                 | Raise `MemoryMax` first, then reconsider the ratio.                                                                         |
| `erpsys_event_loop_delay_ms{quantile="0.99"}` high with heap well under the ceiling                                                       | Not a memory problem.                                                                            | CPU or GC pressure from load, not from size. §12.                                                                           |

Record the before/after numbers and the load that produced them in this
section, the same way §12 records the p95 budget. Both are placeholders
waiting on Phase 4 measurements, and both should be replaced with evidence
rather than left as opinions.
