# Production `.env` — what changes when you go live

Your local `.env` is written for `localhost`. This guide lists every value that
has to change (or be dropped) when ERPSYS runs on the production server. The
full variable reference, with defaults, is in
[deployment.md §3](deployment.md#3-environment-variables). Use this file as the
go-live checklist.

Replace `<domain>` below with the real site address, for example
`https://erpsys.example.edu.ph`. It must be `https://`, with no trailing slash.

## 1. Where production reads its variables

| Thing | Local | Production |
| --- | --- | --- |
| Runtime config | `.env` in the repo root | `/etc/erpsys.env` (`root:erpsys`, mode `0640`), loaded by systemd `EnvironmentFile` |
| `VITE_*` values | `.env` | The **build host's** environment when you run `pnpm build`. Changing one needs a rebuild, not a restart. |
| Integration overrides | n/a | Admin → Integrations stores them encrypted in MongoDB. They override the file **after a restart**. |

Rules:

- Never create `/srv/erpsys/.env`. It would silently fill in anything missing from `/etc/erpsys.env`.
- File format is `KEY=value`: no `export`, no line continuations. Quote values with spaces or `#`.
- Never commit `.env`, `.env.*`, or `erpsys-*.json`. All three are git-ignored.
- After every edit: `sudo systemctl restart erpsys`, then `journalctl -u erpsys -n 50`.

## 2. Change these (they are wrong in production if copied from local)

| Variable | Local value | Production value |
| --- | --- | --- |
| `NODE_ENV` | unset (`development`) | `production`. Required, or the server serves stack traces. |
| `PORT` | `3001` | `3001`, matching the `upstream` in `deploy/nginx/erpsys.conf` |
| `DATABASE_URL` | local or dev Mongo | The MongoDB Atlas connection string (M10 or higher), database name in the path. Add the server's public egress IP to Atlas → Network Access. |
| `BETTER_AUTH_SECRET` | dev secret | A **new** secret, at least 32 characters: `openssl rand -hex 32`. Do not reuse the local one. |
| `BETTER_AUTH_URL` | `http://localhost:5173` | `<domain>`. A mismatch gives a 403 on every write. |
| `PUBLIC_SITE_URL` | `http://localhost:...` | `<domain>`. A `localhost` value refuses to boot. |
| `WEB_ORIGIN` | local web origin | Empty for the single-origin deploy, or the exact origin(s), comma-separated. |
| `QUEUE_SHARE_SECRET` | unset | Optional new secret (`openssl rand -hex 32`) so share links rotate separately from sessions. |
| `ADMIN_EMAILS` | test admin(s) | The real admin email(s), comma-separated. The first login must be one of them. |
| `SU_PIN` | sample or test value | Exactly 6 digits, not `123456`. Wrong value refuses to boot. |
| `SU_EMAIL` | test email | The real superuser email. |
| `METRICS_TOKEN` | unset | A random token, or block `/api/metrics` in Nginx. |

## 3. Third-party services: new production values

| Service | Variables | What to do |
| --- | --- | --- |
| Cloudflare Turnstile | `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAMES`, `VITE_TURNSTILE_SITE_KEY` | Add `<domain>`'s hostname to the widget. Set `TURNSTILE_HOSTNAMES` to that hostname (it defaults to `localhost`). `VITE_TURNSTILE_SITE_KEY` goes on the **build host**, not in `/etc/erpsys.env`. An empty secret turns bot protection off. |
| Cloudflare R2 | `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Use the production bucket (`erpsys-prod`), not the dev one. Mint a token scoped to that bucket only. Apply `deploy/r2/cors.json` with the production origin, or uploads fail in the browser. Empty values refuse to boot. Check with `pnpm --filter @erpsys/server r2:verify`. |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Same account is fine. Mint a token scoped to Workers AI. Empty only disables the chatbot. |
| Brevo mail | `BREVO_API_KEY`, `MAIL_FROM` | Real key and a verified sender. Empty silently drops password-reset mail in production. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | See section 4. |

## 4. Google (sign-in and Forms)

### Sign-in OAuth client

In [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials),
for the client behind `GOOGLE_CLIENT_ID`:

1. Add `<domain>/api/auth/callback/google` to **Authorized redirect URIs**.
2. Add `<domain>` to **Authorized JavaScript origins**.
3. A separate production client is cleaner than reusing the local one. If you
   create one, put its id and secret in `/etc/erpsys.env`.
4. Keep `http://localhost:5173/api/auth/callback/google` only if you still develop against the same client.

### Forms API (required for the Profiling step)

The server reads `GOOGLE_FORMS_REFRESH_TOKEN` to create the profiling Google
Form and read student responses. Without it, **Create Google Form** and the
student's **I've submitted** answer `412`.

1. **Publish the consent screen** (Audience → Publish app). In Testing mode the
   refresh token dies after 7 days. See [google-forms-api-setup.md](google-forms-api-setup.md).
2. **Issue a new refresh token after publishing.** Tokens issued while in Testing keep the 7-day expiry.
3. Set `GOOGLE_FORMS_REFRESH_TOKEN=<token>`. It is one line, so it is safe in `EnvironmentFile`. The token belongs to the Google account, so it works from the server without changes.
4. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be the same client that issued the token. Switching clients means issuing a new token.
5. Remove the OAuth Playground redirect URI from the client once you have the production token.
6. The token can instead be saved under **Admin → Integrations → Google Forms**, which also holds the on/off switch for the Profiling form. See [google-forms-api-setup.md](google-forms-api-setup.md).

### Google Calendar (optional)

Instructors can mirror their office-hour schedule to their own Google Calendar.
Without it the schedule still works and students still see it.

1. Set `CALENDAR_TOKEN_KEY` to a random secret of 32+ characters. It encrypts each instructor's refresh token; changing it disconnects everyone.
2. Add `https://<your-host>/api/v1/calendar/callback` to the sign-in client's authorised redirect URIs.
3. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are shared with sign-in; there is no per-site refresh token.
4. See [google-calendar-api-setup.md](google-calendar-api-setup.md).

## 5. Remove these (not used in production)

| Variable | Why |
| --- | --- |
| `SEED_PASSWORD` | Read by nothing in the repo. |
| `UPLOADTHING_TOKEN` | No code references it. |
| `CUSTOM_GOOGLE_CLIENT_ID`, `CUSTOM_GOOGLE_CLIENT_SECRET` | No code references them. |
| `GOOGLE_FORMS_SA_EMAIL`, `GOOGLE_FORMS_SA_PRIVATE_KEY` | Service accounts cannot create forms (`forms.create` returns HTTP 500). Also delete the `erpsys-*.json` key file and revoke the key in IAM & Admin → Service Accounts → Keys. |

## 6. Keep as defaults unless you have a reason

These already have production-ready defaults in `env.ts`, so leave them out of
`/etc/erpsys.env`: `CLOUDFLARE_PRIMARY_MODEL`, `CLOUDFLARE_FALLBACK_MODELS`,
`CLOUDFLARE_RPM`, `CLOUDFLARE_DAILY_NEURON_CAP`,
`CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY`, `CLOUDFLARE_CHAT_ENABLED`,
`CLOUDFLARE_MAINTENANCE_MESSAGE`, `CLOUDFLARE_REQUEST_DEADLINE_MS`,
`R2_QUOTA_BYTES`, `R2_UPLOADS_ENABLED`, `R2_MAINTENANCE_MESSAGE`, the
`MONGO_*` pool settings, `SHUTDOWN_GRACE_MS`, `DRAIN_DELAY_MS`.

## 7. Go-live checklist

1. Generate new secrets: `openssl rand -hex 32` for `BETTER_AUTH_SECRET` and `QUEUE_SHARE_SECRET`.
2. Create `/etc/erpsys.env` from sections 2 and 3, using the `install` command in [deployment.md §3](deployment.md#writing-the-file).
3. Set `VITE_TURNSTILE_SITE_KEY` on the build host, then `pnpm build`.
4. Register the Google redirect URI and Turnstile hostname (sections 3 and 4).
5. Apply the R2 CORS file for the production origin.
6. `sudo systemctl restart erpsys`, then `journalctl -u erpsys -n 50`. It must show no `[env] refusing to boot` lines.
7. Check readiness: `curl -s https://<domain>/api/ready` returns 200.
8. Sign in as an `ADMIN_EMAILS` account and open Admin → Integrations. Every row must read "Credentials loaded".
9. Smoke-test: Google sign-in, an image upload, a password-reset mail, the chatbot, and one Profiling submission.

## 8. Secrets that must not carry over

Treat these as compromised and replace them for production: any value that was
pasted into a chat or committed anywhere, the `erpsys-506214-*.json` service
account key, and the local `BETTER_AUTH_SECRET`. Production should hold only
newly issued credentials.
