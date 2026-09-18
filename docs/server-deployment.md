# ERPSYS — Server Deployment Guide

Production deployment guide for **COT-SBO Enrollment Requirements Processing System (ERPSYS)** on a self-managed server (VPS).

- **App**: SvelteKit fullstack (SSR + server routes), `apps/web`
- **Monorepo**: Turborepo, pnpm workspaces (`pnpm` 12.3.4)
- **API**: oRPC (in-process server client, no separate API process)
- **Database**: MongoDB Atlas (cloud-hosted), Prisma ORM, schema sync via `prisma db push` (no migration files)
- **Auth**: Better Auth — email/password + Google OAuth, cookie sessions
- **Uploads**: UploadThing (external, cloud-hosted)
- **Chatbot**: Gemini API streaming integration (admin-managed knowledge base)
- **Runtime**: Node.js (via `@sveltejs/adapter-node`)

The server runs **one Node process** that serves pages, the API, auth, and chatbot streaming. MongoDB, UploadThing, Google, and Gemini never run on the server.

---

## 1. Prerequisites

### 1.1 Server

| Requirement | Minimum                                                           |
| ----------- | ----------------------------------------------------------------- |
| OS          | Ubuntu 22.04 LTS or 24.04 LTS (x86_64)                            |
| CPU / RAM   | 1 vCPU / 1 GB RAM (2 GB recommended)                              |
| Disk        | 10 GB free                                                        |
| Network     | Static public IP; outbound HTTPS; inbound ports `22`, `80`, `443` |

### 1.2 Installed tools (on the server)

| Tool                         | Version                                                        | Why                                                                    |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Node.js                      | **22 LTS** (`>=22.12`)                                         | Required by Vite 8 / adapter-node                                      |
| pnpm                         | **12.3.4** (pinned by `packageManager` in root `package.json`) | Install + build + run scripts                                          |
| Git                          | latest                                                         | Pull the repository                                                    |
| pm2 **or** systemd           | either                                                         | Process supervision (this guide uses systemd; pm2 alternative in §6.3) |
| Caddy **or** nginx + certbot | either                                                         | Reverse proxy + TLS (this guide covers both)                           |

> Node version matters: `apps/web/.npmrc` sets `engine-strict=true` and Vite 8 does not run on Node < 20.19 / < 22.12.

### 1.3 Accounts / external services

- **MongoDB Atlas** cluster (already in use: `cluster0.u8p0lky.mongodb.net`), database `erpsys`
- **Google Cloud** OAuth client (already configured, see §8.1)
- **UploadThing** app (already configured, token in env)
- **Google AI Studio** — Gemini API key for chatbot (see §8.4)
- **Domain name** with DNS `A` record pointing at the server IP

### 1.4 Adapter (already configured)

The app uses `@sveltejs/adapter-node` — this is already committed in `apps/web/svelte.config.js`. No code change is needed for VPS deployment.

---

## 2. Environment variables

The app validates env at import time (`packages/env/src/server.ts`). A missing or invalid variable **fails the build/startup**, which is intentional — it prevents a broken deploy.

### 2.1 Required

| Variable             | Example                                                                                   | Notes                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | `mongodb+srv://user:pass@cluster0.u8p0lky.mongodb.net/erpsys?retryWrites=true&w=majority` | Must point at the `erpsys` database                                                  |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`                                                                 | Min 32 chars. **Never change after launch** — it invalidates all sessions            |
| `BETTER_AUTH_URL`    | `https://erpsys.example.com`                                                              | **Production URL, no trailing slash.** `trustedOrigins` and `baseURL` derive from it |
| `NODE_ENV`           | `production`                                                                              | Defaults to `development` otherwise                                                  |
| `GEMINI_API_KEY`     | (Google AI Studio key)                                                                    | **Required** — chatbot fails at boot without it; used for streaming chat responses   |

### 2.2 Optional (with defaults)

| Variable                                    | Default                             | Notes                                                                |
| ------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `ADMIN_EMAILS`                              | `""`                                | Comma-separated; matched after trim/lowercase for the `ADMIN` role   |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `""`                                | Empty string disables Google login (provider is always registered)   |
| `GEMINI_PRIMARY_MODEL`                      | `gemini-3.5-flash-lite`             | Primary chatbot model — lead with the fastest, highest-quota model   |
| `GEMINI_FALLBACK_MODELS`                    | `gemini-3.5-flash,gemini-3.6-flash` | Fallback chain on 429/5xx/404 — all models share one key's quota     |
| `GEMINI_RPM`                                | `15`                                | Requests/minute ceiling this server sends to the shared Gemini key   |
| `UPLOADTHING_TOKEN`                         | (not in env validation)             | Used by UploadThing SDK at runtime — missing = uploads fail silently |
| `SKIP_ENV_VALIDATION`                       | —                                   | Build-time escape hatch for CI only; never set in production         |

> ⚠️ **Note**: `UPLOADTHING_TOKEN` is consumed by the UploadThing SDK directly (`new UTApi()` reads it from `process.env`), but it is **not** validated in the `@t3-oss/env-core` schema. This means the app boots fine without it, but file uploads silently fail. If uploads break in prod, check this variable first.

### 2.3 Runtime variables (adapter-node)

| Variable          | Default   | Notes                                                                                                    |
| ----------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `PORT`            | `3000`    | Internal port the Node process listens on                                                                |
| `HOST`            | `0.0.0.0` | Bind address                                                                                             |
| `ORIGIN`          | —         | **Must be set** to the public origin (`https://erpsys.example.com`); adapter-node enforces Origin checks |
| `BODY_SIZE_LIMIT` | `512k`    | Uploads exceeding this need raising, e.g. `1mb`                                                          |

> **Password reset**: Better Auth currently logs the reset link to stdout (`sendResetPassword` in `packages/auth/src/index.ts`) because no SMTP transport is configured. Links work, but reach the operator, not the user. Wire an SMTP/Resend call before launch (see `docs/spec/login-redesign-spec.md` §9.3).

---

## 3. Database preparation (Atlas)

The app uses **MongoDB Atlas** (cloud-hosted). The server must be granted network access before it can connect. This is the most common cause of "app works locally but fails on server" — Atlas blocks all IPs by default.

### 3.1 Find your server's public IP

SSH into the server and run:

```bash
curl -s ifconfig.me
# Example output: 203.0.113.42
```

Write this IP down — you'll need it in step 3.2.

> **Dynamic IP?** Some cheap VPS providers (Oracle Cloud free tier, certain shared hosts) rotate IPs on instance restart. If your IP changes, either whitelist the entire range or re-whitelist after every restart. Check with your provider.

### 3.2 Add server IP to Atlas Network Access

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Select your project (the one containing `cluster0`)
3. Left sidebar → click **Network Access** (under SECURITY)
4. You'll see the current IP whitelist — likely only your local dev machine
5. Click **Add IP Address** (green button, top right)
6. In the dialog:
   - **Access List Entry**: paste your server's public IP (e.g. `203.0.113.42`)
   - **Comment**: type something like `ERPSYS production server`
   - **Confirm**: click to save
7. Wait ~30 seconds for the rule to propagate

The entry should appear in the list with a green status dot.

> **Keeping your dev IP**: Your local machine's IP is already whitelisted (that's why it works locally). Don't remove it — you still need it for development.

### 3.3 Verify the connection from the server

Create a quick test script on the server:

```bash
cat > /tmp/test-atlas.js << 'SCRIPT'
const { PrismaClient } = require("./packages/prisma/generated/client");
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
p.$connect()
  .then(() => { console.log("✅ Connected to Atlas"); process.exit(0); })
  .catch(e => { console.error("❌ Connection failed:", e.message); process.exit(1); });
SCRIPT

sudo -u erpsys bash -c 'cd /opt/erpsys/steps && node /tmp/test-atlas.js'
```

If this fails with `MongoServerSelectionError: connect ECONNREFUSED` or `IP that is not whitelisted`, go back to §3.2 and verify the IP is correct.

### 3.4 Atlas database user credentials

1. Atlas sidebar → **Database Access** (under SECURITY)
2. The existing user `floresaybaez574_db_user` should have **read/write** on the `erpsys` database
3. If you need a new user:
   - Click **Add New Database User**
   - Authentication method: **Password**
   - Username/password of your choice
   - **Database User Privileges**: select `readWrite` on database `erpsys`
   - Click **Add User**
4. Copy the connection string:
   - Atlas sidebar → **Database** → click **Connect** on your cluster
   - Choose **Connect your application**
   - Driver: **Node.js**, Version: **5.x** or later
   - Copy the connection string
   - Replace `<password>` with your actual database user password
   - Append `?retryWrites=true&w=majority` if not already present

The final `DATABASE_URL` should look like:

```
mongodb+srv://floresaybaez574_db_user:YOUR_PASSWORD@cluster0.u8p0lky.mongodb.net/erpsys?retryWrites=true&w=majority
```

> ⚠️ **Never commit this string to git.** It contains your database password.

### 3.5 Common Atlas connection errors

| Error                                          | Meaning                               | Fix                                                                    |
| ---------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `IP that is not whitelisted`                   | Server IP not in Network Access       | Add IP in Atlas → Network Access (§3.2)                                |
| `bad auth : authentication failed`             | Wrong username or password            | Check credentials in Atlas → Database Access                           |
| `Namespace erpsys not found`                   | Database doesn't exist yet            | Run `pnpm run db:push` to create collections (§3.6)                    |
| `MongoServerSelectionError: connect ETIMEDOUT` | Atlas cluster paused or network issue | Check Atlas cluster status (free tier pauses after 30 days inactivity) |
| `MongoServerError: E11000 duplicate key`       | Unique index conflict                 | Expected for idempotent operations; not an error                       |

### 3.6 Apply the schema

This repo has **no migration files** (`packages/db/prisma/` contains only `schema/` and generated output). Schema is applied with `prisma db push` — run it once during setup and after every schema change:

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run db:push'
```

> **Important**: `db push` is a one-way sync. It can add fields/collections but cannot remove them. For destructive schema changes (dropping fields, renaming collections), you must modify the DB directly via Atlas or Prisma Studio.

### 3.7 Atlas free tier gotcha

The M0 free tier cluster **pauses after 30 days of inactivity**. When paused:

- First request takes 30-60 seconds (cold start)
- Atlas resumes it automatically
- No data is lost

To prevent pausing: enable **Auto-Resume** in Atlas → Cluster → Settings, or keep the app making at least one DB query per day (a cron health check works).

---

## 4. One-time server setup

```bash
# 1. Update system + install Node 22 and pnpm
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
npm install -g pnpm@12.3.4   # then re-login or source ~/.bashrc
pnpm --version                              # expect 12.3.4

# 2. Create an unprivileged user for the app
sudo useradd -m -s /bin/bash erpsys

# 3. Clone the repository
sudo mkdir -p /opt/erpsys
sudo chown erpsys:erpsys /opt/erpsys
sudo -u erpsys git clone <repo-url> /opt/erpsys/steps
```

---

## 5. Install, configure, build

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm install --frozen-lockfile'
```

`pnpm install` runs `prisma generate` (workspace `postinstall`) — this produces the **Linux** Prisma engine, replacing the Windows DLLs present in the repo. If it is ever skipped:

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run db:generate'
```

Create the production env file (see §2 for values; `packages/env` loads the repo-root `.env` explicitly at import time, and systemd injects it via `EnvironmentFile` below — one file at `/opt/erpsys/steps/.env`):

```bash
sudo -u erpsys bash -c 'cat > /opt/erpsys/steps/.env << "EOF"
NODE_ENV=production
DATABASE_URL=mongodb+srv://<user>:<pass>@cluster0.u8p0lky.mongodb.net/erpsys?retryWrites=true&w=majority
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://erpsys.example.com
ORIGIN=https://erpsys.example.com
PORT=3000
HOST=0.0.0.0
ADMIN_EMAILS=admin@buksu.edu.ph
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
UPLOADTHING_TOKEN=...
GEMINI_API_KEY=...
GEMINI_PRIMARY_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.5-flash,gemini-3.6-flash
GEMINI_RPM=15
EOF'
chmod 600 /opt/erpsys/steps/.env   # do this as root
```

Apply the database schema (first deploy only, and after schema changes):

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run db:push'
```

Build the production bundle:

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run build'
```

> Turbo outputs land in `apps/web/build/`. Entry point: `apps/web/build/index.js`.

Verify the server starts by hand once:

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps/apps/web && PORT=3000 node build/index.js'
curl http://127.0.0.1:3000/healthz   # expect 200
# Ctrl-C when satisfied
```

---

## 6. Run as a service (systemd)

Create `/etc/systemd/system/erpsys.service`:

```ini
[Unit]
Description=ERPSYS SvelteKit server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=erpsys
Group=erpsys
WorkingDirectory=/opt/erpsys/steps/apps/web
EnvironmentFile=/opt/erpsys/steps/.env
ExecStart=/usr/bin/node build/index.js
Restart=always
RestartSec=3
# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now erpsys
sudo systemctl status erpsys
journalctl -u erpsys -f   # watch logs
```

> `EnvironmentFile` and `WorkingDirectory` together satisfy env loading; keep both.

### 6.1 Memory limits (recommended)

If the server is shared or RAM-constrained, add memory limits to the service:

```ini
[Service]
MemoryMax=512M
MemoryHigh=384M
```

The Node process typically uses 100-200 MB under normal load. Chatbot streaming and file uploads can spike this temporarily.

### 6.2 Log rotation

systemd journals are capped by default (10% of disk or 4G, whichever is smaller). To add explicit rotation:

```bash
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/erpsys.conf << 'EOF'
[Journal]
SystemMaxUse=200M
MaxRetentionSec=30d
EOF
sudo systemctl restart systemd-journald
```

### 6.3 Alternative: pm2

```bash
sudo npm install -g pm2
sudo -u erpsys pm2 start node --name erpsys --cwd /opt/erpsys/steps/apps/web -- build/index.js
sudo -u erpsys pm2 save
sudo -u erpsys env PATH=$PATH:$(which node) pm2 startup systemd -u erpsys --hp /home/erpsys
```

pm2 log rotation:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate.max_size 50M
pm2 set pm2-logrotate.retain 7
```

---

## 7. Reverse proxy + TLS

### 7.1 Caddy (recommended — automatic HTTPS, WebSocket handled transparently)

`/etc/caddy/Caddyfile`:

```
erpsys.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl enable --now caddy
```

Caddy provisions and renews Let's Encrypt certificates automatically. Done.

### 7.2 nginx + certbot

`/etc/nginx/sites-available/erpsys`:

```nginx
server {
    listen 80;
    server_name erpsys.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name erpsys.example.com;

    ssl_certificate     /etc/letsencrypt/live/erpsys.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erpsys.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Required for WebSocket upgrades (SSR/HMR in dev; keep for prod safety)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }

    client_max_body_size 10m;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/erpsys /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erpsys.example.com
```

### 7.3 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

---

## 8. External service configuration (prod-specific)

### 8.1 Google OAuth

Add the production callback to the existing OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

- **Authorized JavaScript origins**: `https://erpsys.example.com`
- **Authorized redirect URIs**: `https://erpsys.example.com/api/auth/callback/google`

Without the redirect URI, Google login fails with `redirect_uri_mismatch` in production.

### 8.2 UploadThing

UploadThing validates the request `Origin` header — no extra configuration beyond `UPLOADTHING_TOKEN`, provided requests reach UploadThing from the browser. If uploads fail in production with origin errors, set the production domain in the UploadThing dashboard.

> **Edge case**: UploadThing uploads fail silently if `UPLOADTHING_TOKEN` is missing. The app still boots because the token is not in the env validation schema. If a user reports "upload does nothing", check `UPLOADTHING_TOKEN` in `.env` first.

### 8.3 Security checklist

- `.env` (repo root) is gitignored; never commit it. The values shown in this repo's `.env` are dev credentials — **rotate `BETTER_AUTH_SECRET` and the DB password for production**.
- `chmod 600` the env file; run the app as `erpsys`, never root.
- Keep `NODE_ENV=production` and `SKIP_ENV_VALIDATION` unset.

### 8.4 Gemini API (chatbot)

The chatbot streams responses via Google's Gemini API. You need a key from [Google AI Studio](https://aistudio.google.com/apikey).

**Required env vars:**

- `GEMINI_API_KEY` — **boot fails without it** (validated with `z.string().min(1)`)
- `GEMINI_PRIMARY_MODEL` — defaults to `gemini-3.5-flash-lite`
- `GEMINI_FALLBACK_MODELS` — comma-separated, defaults to `gemini-3.5-flash,gemini-3.6-flash`
- `GEMINI_RPM` — defaults to `15`; ceiling for requests/minute to the shared key

The chatbot endpoint (`/api/chat/stream`) serves the chain healthiest-first: a model that recently returned 429/5xx/404 is demoted to the back of the chain for 5 minutes (`apps/web/src/lib/chat/model-router.ts`). Outbound calls are paced under `GEMINI_RPM` because **all models share one key's quota** — a per-key 429 hits every model, not just the busy one. Transient 429/5xx are retried once after `Retry-After`; a 404 (deprecated model) falls through silently. Only when every model fails does the student see "try again in a minute" — mid-chain switches never surface an error bubble, so a fallback answer never looks like a failure.

**Edge cases:**

- **Key is invalid (401/403)**: The endpoint fails fast instead of burning the rest of the chain. Check `journalctl -u erpsys` for `401`/`403` from Google.
- **Quota exceeded (429s everywhere)**: Raise `GEMINI_RPM` to the key's actual limit (or upgrade the key tier); pacing then keeps the app under the ceiling so the primary answers reliably.
- **Verify the key + models**: `pnpm exec tsx scripts/check-gemini.mjs` probes every configured model and prints HTTP status + latency (the key is never printed).
- **Model names change**: Google renames/deprecates models. A deprecated model returns 404 — the server demotes it and moves on automatically, but check the [Gemini model list](https://ai.google.dev/gemini-api/docs/models) and update `GEMINI_PRIMARY_MODEL` / `GEMINI_FALLBACK_MODELS` to drop it.
- **Streaming stalls**: The SSE stream hangs if Google stops sending data mid-response. The client has a timeout, but the server-side `fetch` does not. Consider adding an `AbortController` with a 30s timeout in production.

---

## 9. First-deploy checklist

After the initial setup (§4-§6), run through this before going live.

### 9.1 Seed initial data

The repo includes seed scripts in `packages/api/src/seed/`. These populate:

- Academic years and semesters
- Enrollment steps and requirements
- Departments and queues
- Sample users (advisers, officers)
- Chatbot knowledge base (empty by default)

Run seed via a one-off script or Prisma Studio:

```bash
# Option A: use the seed functions directly
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run db:push'

# Option B: manually via Prisma Studio (check data visually)
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run db:studio'
# Access at http://localhost:5555 (bind to localhost only, or use SSH tunnel)
```

> **Important**: The seed data creates sample users with hardcoded emails. For production, create real accounts through the registration flow or via Prisma Studio. Do NOT rely on seed data for production users.

### 9.2 Verify each role

After deployment, test each role's primary flow:

| Role                   | What to verify                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| **STUDENT**            | Register via student number, submit evidence, check queue status |
| **SBO_OFFICER**        | Verify students, capture mugshots, manage stamp graphic          |
| **ENROLLMENT_ADVISER** | Toggle availability, process enrollment queue                    |
| **ADMIN**              | Manage academic years, departments, users, requirements          |

### 9.3 Set up admin accounts

1. Add admin emails to `ADMIN_EMAILS` in `.env` (comma-separated, lowercase)
2. Restart the service: `sudo systemctl restart erpsys`
3. Have the admin sign up — the `deriveRole()` function in `packages/auth/src/index.ts` maps their email to `ADMIN` role on account creation

### 9.4 Configure chatbot knowledge base

The chatbot only works after an admin uploads a knowledge document:

1. Log in as admin
2. Navigate to the chatbot editor
3. Paste/upload the enrollment FAQ or knowledge base content
4. Save — the `chatbotKnowledge` collection is read on every chat request

---

## 10. Updates / redeploys

```bash
cd /opt/erpsys/steps
sudo -u erpsys git pull --ff-only
sudo -u erpsys pnpm install --frozen-lockfile
# If packages/db/prisma/schema/* changed:
sudo -u erpsys pnpm run db:push
sudo -u erpsys pnpm run build
sudo systemctl restart erpsys
```

Verify after restart (§11).

### 10.1 Safe update procedure

For zero-downtime-ish deploys (single server):

```bash
# 1. Build first (while old version is still running)
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run build'

# 2. Quick restart (1-3s downtime)
sudo systemctl restart erpsys

# 3. Verify
curl -s http://127.0.0.1:3000/healthz
```

The build step takes 30-60 seconds, during which the old version continues serving. The restart is near-instant. Total downtime: ~1-3 seconds.

### 10.2 Schema changes

If the PR includes Prisma schema changes:

```bash
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && pnpm run db:push'
```

**Run `db:push` BEFORE restarting the service.** If the new code expects a field that doesn't exist yet, the old version keeps running while you push the schema. Then restart. This order prevents downtime from schema mismatches.

> ⚠️ **Destructive schema changes** (dropping fields, renaming collections) require manual intervention via Atlas. `db push` only adds — it never removes.

---

## 11. Post-deploy verification

| Check          | Command                                     | Expected                             |
| -------------- | ------------------------------------------- | ------------------------------------ |
| Process up     | `systemctl is-active erpsys`                | `active`                             |
| Health probe   | `curl -s http://127.0.0.1:3000/healthz`     | `200`                                |
| Public site    | `curl -sI https://erpsys.example.com`       | `200` + `HTTP/2`                     |
| Auth           | Sign in with email/password and with Google | Session persists across reload       |
| Uploads        | Upload a document in the student flow       | File appears (UploadThing)           |
| Chatbot        | Send a message as a student                 | Streaming response or graceful error |
| Env validation | `journalctl -u erpsys -n 50`                | No zod/env errors at boot            |

---

## 12. Troubleshooting

| Symptom                                                       | Cause / Fix                                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Start fails with zod env error listing variables              | Missing/invalid var in `.env`; `dotenv` reads from `WorkingDirectory` — confirm `EnvironmentFile` path is correct          |
| `PrismaClientInitializationError: Prisma engines... platform` | Engine built for wrong platform — rerun `pnpm run db:generate` on the server (Linux)                                       |
| `EADDRINUSE`                                                  | Port 3000 already bound; `ss -ltnp \| grep 3000`, stop the stale process                                                   |
| Logs show `Origin` / `CSRF` errors                            | `ORIGIN` unset or mismatched — set `ORIGIN=https://erpsys.example.com`                                                     |
| `413 Request Entity Too Large` on uploads                     | Raise `BODY_SIZE_LIMIT` (adapter-node) and `client_max_body_size` (nginx)                                                  |
| WebSocket upgrades fail (502)                                 | Proxy missing `Upgrade`/`Connection` headers (§7.2)                                                                        |
| Everyone logged out after deploy                              | `BETTER_AUTH_SECRET` changed — restore the previous value                                                                  |
| Google login `redirect_uri_mismatch`                          | Add `https://domain/api/auth/callback/google` in Google Console (§8.1)                                                     |
| Chatbot returns "try again in a minute"                       | All Gemini models exhausted (429/5xx/404). Raise `GEMINI_RPM` to the key's quota, reduce volume, or upgrade tier           |
| Chatbot returns empty responses                               | `GEMINI_API_KEY` is invalid or model name is wrong — run `pnpm exec tsx scripts/check-gemini.mjs` to probe the whole chain |
| Uploads do nothing (no error)                                 | `UPLOADTHING_TOKEN` missing from `.env` — the app boots fine but uploads fail silently                                     |
| `GEMINI_API_KEY` error at boot                                | Key is missing or empty — add it to `.env` and restart                                                                     |
| Password reset link not received by user                      | Expected — no SMTP transport. Link is logged to `journalctl -u erpsys`. See §2.1 note.                                     |
| Fresh user gets wrong role                                    | Check email domain: `@buksu.edu.ph` → adviser, `@student.buksu.edu.ph` → student, `ADMIN_EMAILS` → admin                   |

---

## 13. Rollback

Keep the previous release available and switch back quickly:

```bash
cd /opt/erpsys/steps
sudo -u erpsys git checkout <previous-sha>
sudo -u erpsys pnpm install --frozen-lockfile
sudo -u erpsys pnpm run build
sudo systemctl restart erpsys
```

DB schema is not reverted by this — `db push` is non-destructive in the forward direction only. For schema rollbacks, restore from an Atlas snapshot first, then redeploy the old build.

---

## 14. Remote management guide

If you grant SSH access (host + key/password), a coding agent can perform these operations remotely:

### 14.1 What can be managed remotely

| Task                 | Command                                                | Risk                                     |
| -------------------- | ------------------------------------------------------ | ---------------------------------------- |
| Check service status | `systemctl is-active erpsys`                           | None                                     |
| View logs            | `journalctl -u erpsys --since "1 hour ago"`            | None                                     |
| Restart service      | `systemctl restart erpsys`                             | 1-3s downtime                            |
| Pull updates         | `git pull --ff-only`                                   | None (until build)                       |
| Build                | `pnpm run build`                                       | None (old version keeps running)         |
| Push schema          | `pnpm run db:push`                                     | **Destructive if schema removed fields** |
| Edit `.env`          | `nano /opt/erpsys/steps/.env`                          | **Requires restart**                     |
| Check disk usage     | `du -sh /opt/erpsys/steps/`                            | None                                     |
| Check port binding   | `ss -ltnp \| grep 3000`                                | None                                     |
| View Prisma client   | `pnpm run db:studio` (SSH tunnel needed)               | None                                     |
| Rollback to previous | `git checkout <sha> && pnpm install && pnpm run build` | Downtime during restart                  |

### 14.2 What requires human action

| Task                              | Why                                             |
| --------------------------------- | ----------------------------------------------- |
| Update MongoDB Atlas IP whitelist | Atlas dashboard login required                  |
| Rotate Google OAuth client secret | Google Cloud Console login required             |
| Rotate UploadThing token          | UploadThing dashboard login required            |
| Modify DNS records                | Domain registrar access required                |
| Scale server (resize VPS)         | Cloud provider dashboard required               |
| Set up TLS certs (first time)     | Some providers require interactive verification |

### 14.3 Emergency procedures

**Service won't start after deploy:**

```bash
# Check the error
journalctl -u erpsys -n 50 --no-pager

# Rollback to previous version
cd /opt/erpsys/steps
sudo -u erpsys git log --oneline -5          # find previous SHA
sudo -u erpsys git checkout <previous-sha>
sudo -u erpsys pnpm install --frozen-lockfile
sudo -u erpsys pnpm run build
sudo systemctl restart erpsys
```

**Database unreachable:**

```bash
# Test connectivity from server
sudo -u erpsys bash -c 'cd /opt/erpsys/steps && node -e "
  const { createPrismaClient } = require(\"./packages/db/dist/index.js\");
  const p = createPrismaClient();
  p.\$connect().then(() => { console.log(\"OK\"); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
"'
# If this fails, check Atlas Network Access whitelist for this server IP
```

**Disk full:**

```bash
# Find large files
sudo du -sh /opt/erpsys/steps/* | sort -rh | head -10
sudo journalctl --disk-usage                # journal might be huge
sudo journalctl --vacuum-size=100M          # trim logs
```

---

## 15. Comprehensive edge cases

### 15.1 Environment variable edge cases

| Edge case                                           | Symptom                                                                                                  | Fix                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `.env` file has Windows line endings (`\r\n`)       | Zod validation fails with cryptic errors                                                                 | Run `dos2unix /opt/erpsys/steps/.env`                  |
| `.env` has trailing whitespace in values            | URL validation fails (`z.url()`)                                                                         | Trim all values                                        |
| `BETTER_AUTH_URL` has trailing slash                | CSRF / trusted origins mismatch                                                                          | Remove trailing slash                                  |
| `DATABASE_URL` has unescaped `@` or `/` in password | Connection string parse error                                                                            | URL-encode special chars: `%40` for `@`, `%2F` for `/` |
| `ADMIN_EMAILS` has spaces after commas              | First email works, rest don't match                                                                      | Trim: `admin@buksu.edu.ph, officer@buksu.edu.ph`       |
| `GEMINI_API_KEY` is empty string                    | App boots (default `""` passes `min(1)` only if non-empty) — actually **fails** with `z.string().min(1)` | Ensure key is set; empty string fails validation       |
| `UPLOADTHING_TOKEN` is missing                      | App boots, uploads silently fail                                                                         | Add token to `.env`                                    |
| `ORIGIN` doesn't match `BETTER_AUTH_URL`            | CSRF errors on auth endpoints                                                                            | Both must be identical                                 |

### 15.2 Database edge cases

| Edge case                                          | Symptom                                                     | Fix                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Atlas free tier cluster paused (30-day inactivity) | First request after idle takes 30-60s (cold start)          | Atlas resumes automatically; or upgrade to M10+                           |
| MongoDB connection pool exhausted                  | `Timeout error: Curd open` or similar                       | Restart service; consider increasing `connection_limit` in `DATABASE_URL` |
| `db push` on a new collection with unique index    | Silently succeeds (MongoDB unique indexes are non-blocking) | Verify indexes in Atlas after push                                        |
| Schema has `@map` or `@@map` directives            | `db push` renames collections (destructive)                 | Avoid `@map`/`@@map` with `db push` — use raw migration instead           |
| Prisma engine version mismatch                     | `PrismaClientInitializationError`                           | Run `pnpm run db:generate` on the server (must be Linux)                  |

### 15.3 Auth edge cases

| Edge case                                                 | Symptom                                                                   | Fix                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `BETTER_AUTH_SECRET` changed after launch                 | All users logged out, sessions invalid                                    | Restore the original secret; never rotate it          |
| User registers with `@buksu.edu.ph` email                 | Gets `ENROLLMENT_ADVISER` role (not student)                              | This is by design — `deriveRole()` maps email domains |
| User registers with Google but email is `@gmail.com`      | Gets `STUDENT` with `isOutsideOrg: true`                                  | Correct behavior for external users                   |
| Account linking disabled (`disableImplicitLinking: true`) | Google user with same email as email/password user gets separate accounts | This is intentional — user must confirm linking       |
| Session cookie domain mismatch                            | User appears logged out on page refresh                                   | Ensure `BETTER_AUTH_URL` matches the actual domain    |
| `NODE_ENV` is not `production`                            | CSP headers not set; security headers missing                             | Set `NODE_ENV=production` in `.env`                   |

### 15.4 File upload edge cases

| Edge case                                   | Symptom                                       | Fix                                             |
| ------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Upload exceeds `BODY_SIZE_LIMIT`            | `413 Request Entity Too Large` from Node      | Raise `BODY_SIZE_LIMIT` in `.env`               |
| Upload exceeds nginx `client_max_body_size` | `413` from nginx (never reaches Node)         | Raise `client_max_body_size` in nginx config    |
| UploadThing origin mismatch                 | Upload succeeds but callback fails            | Set production domain in UploadThing dashboard  |
| `evidenceImage` exceeds 4MB cap             | Client-side rejection before upload           | This is a hardcoded limit in `uploadRouteSlugs` |
| File key stored but upload actually failed  | Evidence shows "uploaded" but image is broken | Check UploadThing dashboard; re-upload          |

### 15.5 Chatbot edge cases

| Edge case                       | Symptom                                                        | Fix                                                                                      |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| No knowledge document in DB     | Chatbot answers from empty context; always says "I don't know" | Admin must upload knowledge base first                                                   |
| Gemini API key quota exceeded   | All models return 429; user sees "try again"                   | Raise `GEMINI_RPM` to the key's limit so pacing prevents 429s; upgrade tier for headroom |
| Model name deprecated by Google | Model returns 404; chain moves on, model demoted ~5 min        | Update `GEMINI_PRIMARY_MODEL` / `GEMINI_FALLBACK_MODELS` to drop it                      |
| SSE stream interrupted          | Client shows partial response                                  | Usually network; client retry logic handles this                                         |
| Very long knowledge document    | Exceeds model context window; partial answers                  | Trim knowledge base; or increase `maxOutputTokens`                                       |

### 15.6 CSP and security edge cases

| Edge case                             | Symptom                               | Fix                                                                        |
| ------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| UploadThing CDN blocked by CSP        | Images don't load                     | `img-src` already allows `https:` — verify CDN domain                      |
| Google Fonts blocked                  | Typography falls back to system fonts | `font-src 'self' data:` is restrictive; add font CDN to CSP if needed      |
| Third-party scripts blocked           | External embeds don't work            | CSP is strict by design; add specific domains to the relevant directive    |
| `connect-src 'self' https:` too broad | Security concern                      | Narrow to specific API domains (UploadThing, Gemini) for stricter security |

### 15.7 Deployment edge cases

| Edge case                                      | Symptom                                  | Fix                                                                                                         |
| ---------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm install` fails on Linux (wrong engine)   | Prisma client built for Windows          | Run `pnpm run db:generate` to rebuild for Linux                                                             |
| `git pull --ff-only` fails                     | Local commits ahead of remote            | `git stash && git pull --ff-only && git stash pop` or force reset                                           |
| Build succeeds but `node build/index.js` fails | Missing env var at runtime vs build time | `pnpm run build` runs with `SKIP_ENV_VALIDATION` in CI; runtime needs all vars                              |
| systemd `EnvironmentFile` path wrong           | App starts with `development` defaults   | Verify path: `systemctl cat erpsys` shows loaded config                                                     |
| Port 3000 occupied by another service          | `EADDRINUSE` on startup                  | Kill the other process or change `PORT` in `.env`                                                           |
| pnpm version mismatch on server                | Lockfile incompatibility                 | Install exact pinned version: `npm install -g pnpm@12.3.4 # was: curl -fsSL https://bun.sh/install \| bash` |

---

## 16. Monitoring & alerting

### 16.1 Health check endpoint

The app exposes a health check at `/healthz` (oRPC `healthCheck` procedure):

```bash
# Local probe
curl -s http://127.0.0.1:3000/healthz   # expect {"result":"OK"}

# Public probe (through reverse proxy)
curl -s https://erpsys.example.com/rpc/healthCheck
```

### 16.2 Simple monitoring script

Create `/opt/erpsys/monitor.sh` (run via cron every 5 minutes):

```bash
#!/bin/bash
# /opt/erpsys/monitor.sh — simple health check with alert

LOGFILE="/var/log/erpsys-monitor.log"
MAX_FAILURES=3

check_health() {
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/healthz --max-time 10)
    if [ "$HTTP_CODE" != "200" ]; then
        echo "$(date): HEALTH CHECK FAILED (HTTP $HTTP_CODE)" >> "$LOGFILE"
        return 1
    fi
    return 0
}

if ! check_health; then
    FAILURES=$(grep -c "HEALTH CHECK FAILED" "$LOGFILE" 2>/dev/null || echo 0)
    if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then
        echo "$(date): Restarting erpsys after $FAILURES consecutive failures" >> "$LOGFILE"
        sudo systemctl restart erpsys
        # Reset failure counter after restart
        tail -n +$((FAILURES + 1)) "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
    fi
fi
```

```bash
chmod +x /opt/erpsys/monitor.sh
# Add to crontab (as root or erpsys user)
sudo crontab -e
# Add: */5 * * * * /opt/erpsys/monitor.sh
```

### 16.3 What to watch

| Metric                | Command                                                  | Warning threshold |
| --------------------- | -------------------------------------------------------- | ----------------- |
| Memory usage          | `ps aux \| grep "node build" \| grep -v grep`            | > 400 MB resident |
| Disk usage            | `df -h /opt/erpsys`                                      | > 80%             |
| Log size              | `journalctl --disk-usage`                                | > 500 MB          |
| Node process count    | `pgrep -f "node build/index.js" \| wc -l`                | != 1              |
| Open file descriptors | `ls /proc/$(pgrep -f "node build/index.js")/fd \| wc -l` | > 1000            |

---

## 17. Backup & disaster recovery

### 17.1 What to back up

| What              | Where                                                     | How                                                            |
| ----------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| MongoDB data      | Atlas                                                     | Atlas continuous backups (if on M10+); or periodic `mongodump` |
| `.env` file       | `/opt/erpsys/steps/.env`                                  | Copy to secure location; it's gitignored                       |
| Server config     | `/etc/systemd/system/erpsys.service`, nginx/Caddy configs | Copy to secure location                                        |
| UploadThing files | UploadThing cloud                                         | No local backup needed; files are in their cloud               |

### 17.2 MongoDB backup (if not using Atlas backups)

```bash
# One-off dump
mongodump --uri="mongodb+srv://..." --out=/opt/erpsys/backups/$(date +%Y%m%d)

# Automated daily backup (add to crontab)
0 2 * * * /usr/bin/mongodump --uri="mongodb+srv://..." --out=/opt/erpsys/backups/$(date +\%Y\%m\%d) --quiet
```

### 17.3 Full server backup

```bash
# On your local machine (SSH)
rsync -avz --exclude node_modules --exclude .git \
  erpsys@server:/opt/erpsys/steps/ /local/backup/erpsys/
```

### 17.4 Disaster recovery steps

1. Provision new server (Ubuntu 22.04/24.04)
2. Follow §4 (one-time setup)
3. Restore `.env` from backup
4. Clone repo, install, build (§5)
5. Restore MongoDB from Atlas snapshot or `mongorestore`
6. Set up systemd + reverse proxy (§6-§7)
7. Update DNS A record to new server IP
8. Verify (§11)

---

## 18. Performance tuning

### 18.1 Node.js flags

For production, add Node.js performance flags to the systemd service:

```ini
[Service]
ExecStart=/usr/bin/node --max-old-space-size=384 --optimize-for-size build/index.js
```

- `--max-old-space-size=384`: Cap heap at 384 MB (matches `MemoryMax`)
- `--optimize-for-size`: Favor lower memory over peak throughput

### 18.2 Connection pool tuning

MongoDB connection pooling is handled by Prisma. For high-concurrency scenarios, add to `DATABASE_URL`:

```
mongodb+srv://...?retryWrites=true&w=majority&connectTimeoutMS=5000&socketTimeoutMS=45000
```

### 18.3 Caching headers

For static assets (images, fonts), the SvelteKit adapter-node serves them with appropriate cache headers by default. For aggressive caching, add to the reverse proxy:

**nginx:**

```nginx
location /_app/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

**Caddy:**

```
handle_path /_app/* {
    header Cache-Control "public, max-age=31536000, immutable"
    reverse_proxy 127.0.0.1:3000
}
```

### 18.4 Gzip/Brotli compression

Enable compression at the reverse proxy level (Node.js doesn't compress by default):

**nginx:**

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
gzip_min_length 256;
```

**Caddy** (enabled by default with `reverse_proxy`).

---

## Appendix A: alternative — Docker

If the server runs Docker, containerize instead of installing Node/pnpm directly:

```dockerfile
FROM node:22 AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "apps/web/build/index.js"]
```

Run with `--env-file .env`. The npm/pnpm steps above remain the source of truth for what the image must contain (Linux Prisma engine included — `prisma generate` runs during `pnpm install` in the build stage).

---

## Appendix B: env validation schema reference

For the definitive list of validated env vars, see `packages/env/src/server.ts`. The schema is:

```ts
server: {
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  ADMIN_EMAILS: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_PRIMARY_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3.5-flash,gemini-3.6-flash"),
  GEMINI_RPM: z.coerce.number().int().min(1).default(15),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
}
```

**Not validated but required at runtime:**

- `UPLOADTHING_TOKEN` — read by UploadThing SDK via `process.env`, not in the schema
- `PORT`, `HOST`, `ORIGIN`, `BODY_SIZE_LIMIT` — read by adapter-node, not in the schema

**Build-time only:**

- `SKIP_ENV_VALIDATION` — used in CI to skip the env check during `pnpm run build`
