# Integration Credentials — Spec

The Integrations tab currently answers one question: *is this integration on?*
This change makes it answer the second one: *what credentials is it using, and
who can change them?*

The driver is ownership transfer. Today every credential lives in
`/etc/erpsys.env` on one VM, owned by `root`, mode `0640`, and changing it takes
SSH plus a `systemctl restart`. A new owner inheriting this deployment cannot
reconfigure Google sign-in, R2, Workers AI, Turnstile or Brevo without shell
access to a machine they may not have. This spec moves the *values* into an
encrypted Mongo override layer that the admin console edits, keeps `.env` as the
bootstrap floor, and adds a restart-required handshake so nobody believes a
change is live when it is not.

Read [integration-toggles-spec.md](integration-toggles-spec.md) first — the five
rows, the row anatomy, `AppleSwitch`, the consequence strings and the audit
shape all come from there and are not redesigned here.

---

## 1. Decisions (locked from the interview)

| Decision                | Choice                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Where values live       | Encrypted overrides in MongoDB; `.env` stays the bootstrap floor                               |
| Activation              | Save now, queue it, show **Restart required**. No in-app restart                               |
| Secret readability      | Never after save. Write-only; the UI shows a mask                                               |
| Who can edit            | Any account that passes `requireSurface("admin")`. No re-auth, no allowlist                    |
| Mask format             | First 5 characters + a fixed 12-dot run; all dots when the value is under 6 characters          |
| Editable surface        | Integration credentials only                                                                   |
| Validation              | Live provider probe; **any** probe failure blocks the save, with Retry                          |
| Encryption              | AES-256-GCM under a key derived (HKDF) from `BETTER_AUTH_SECRET`                                |
| Missing/wrong key       | Degrade: mark the group unreadable, fall back to `.env`, tell the admin to re-enter             |
| Restart proof           | Per-key fingerprint computed at boot, compared to the stored value's fingerprint                |
| Handover artifact       | Panel-level export of the effective integration keys as `.env` text (real values)               |
| Reset                   | Per-integration reset to the `.env` value, confirmation required                                |
| Editor placement        | Inline disclosure under each row                                                                |
| Edit gesture            | `Replace` clears the field to an empty input; the mask becomes the placeholder                   |
| Non-secret values       | Plaintext, always visible                                                                       |
| Restart UI              | Per-row badge **and** one panel banner carrying the restart command                             |
| Override injection      | Bootstrap step in `index.ts`: load + decrypt + apply, then dynamically import the app            |
| Save granularity        | Atomic per integration; incomplete credential pairs are rejected                                |
| Toggle coupling         | Independent — a save never flips the switch                                                     |
| Value history           | None. Last write wins                                                                           |
| Provenance              | Per field: `.env` or `Stored`, plus `Missing`                                                    |
| Boot read failure       | Boot with `.env` values, log loudly, surface it in the panel                                    |
| Export contents         | Real plaintext values, admin-only, audited, warned                                              |
| Probe network policy    | Strict per-integration allowlist of provider hosts and endpoint shapes                          |
| Audit detail            | Key names plus the masked prefix; never a value                                                 |
| Environment availability| Every environment, same as the toggles                                                          |
| Mongo / core config     | **Not** an integration and not editable; a read-only "Core configuration" section names keys     |
| Turnstile site key      | Served from the public integrations payload at runtime, not baked into the bundle               |
| Concurrent edits        | Optimistic concurrency on a `version`; a stale save returns `409`                               |
| Broken credentials      | The toggle stays free to flip; the row states the problem                                       |
| Spec shape              | This new file; the toggles spec stays as written                                                 |

**Explicitly not integrations:** MongoDB, `BETTER_AUTH_SECRET`, `DATABASE_URL`,
`PORT`, `NODE_ENV`, `PUBLIC_SITE_URL`, `BETTER_AUTH_URL`, `WEB_ORIGIN`,
`ADMIN_EMAILS`, and every tuning key (`CLOUDFLARE_PRIMARY_MODEL`,
`CLOUDFLARE_FALLBACK_MODELS`, `RPM`, `DAILY_NEURON_CAP`, quotas, maintenance
messages, `R2_QUOTA_BYTES`). Those stay in the deployment env file and the
runbook. The panel shows their *names and configured state* only.

---

## 2. Editable keys

The set is closed. Adding a key means adding it here, to the registry in §7, and
to the probe table in §6.

| Integration     | Env key                    | Class           | Required | Pairing                    |
| --------------- | -------------------------- | --------------- | -------- | -------------------------- |
| `googleAuth`    | `GOOGLE_CLIENT_ID`         | secret          | yes      | with `…_SECRET`            |
| `googleAuth`    | `GOOGLE_CLIENT_SECRET`     | secret          | yes      | with `…_ID`                |
| `turnstile`     | `TURNSTILE_SECRET_KEY`     | secret          | yes      | with site key              |
| `turnstile`     | `VITE_TURNSTILE_SITE_KEY`  | plain (public)  | yes      | with secret key            |
| `turnstile`     | `TURNSTILE_HOSTNAMES`      | plain           | no       | —                          |
| `r2`            | `R2_BUCKET`                | plain           | yes      | —                          |
| `r2`            | `R2_ENDPOINT`              | plain           | yes      | —                          |
| `r2`            | `R2_ACCESS_KEY_ID`         | secret          | yes      | with `…_SECRET_ACCESS_KEY` |
| `r2`            | `R2_SECRET_ACCESS_KEY`     | secret          | yes      | with `…_ACCESS_KEY_ID`     |
| `cloudflareChat`| `CLOUDFLARE_ACCOUNT_ID`    | plain           | yes      | —                          |
| `cloudflareChat`| `CLOUDFLARE_API_TOKEN`     | secret          | yes      | —                          |
| `email`         | `BREVO_API_KEY`            | secret          | yes      | —                          |
| `email`         | `MAIL_FROM`                | plain           | yes      | —                          |

Notes:

- `GOOGLE_CLIENT_ID` is masked even though Google treats a client id as public
  metadata. It is an identifier for a credential, it is not needed to *read*
  anything in this console, and consistency beats a per-key debate.
- `VITE_TURNSTILE_SITE_KEY` is genuinely public — it ships to every browser — so
  it is plaintext. It also stops being a build-time value (§5.4).
- `R2_BUCKET` and `R2_ENDPOINT` are plaintext but still required: the probe
  cannot run without them and uploads cannot work without them.
- `TURNSTILE_HOSTNAMES` is optional; an empty value means Cloudflare's own
  default hostname check, which is today's behaviour with the env default
  `localhost,127.0.0.1`.

### 2.1 Clearing a value

`PUT` accepts `null` for a key, meaning *drop the stored override and fall back
to `.env`*. An empty string is not a value — a plaintext field cannot be saved
empty while the key is required, and a secret field cannot be saved as `""`.
Missing keys in the request body are left untouched (partial updates within the
group are still atomic: one document write).

`null` on a required key is allowed; it reverts to the `.env` value, and the
row shows `Missing` if `.env` has nothing either.

---

## 3. Data model

New collection, registered in `COLLECTIONS` (`apps/server/src/lib/db/db.ts`):

```ts
integrationCredential: "integration_credential";
```

One document per integration — the same granularity as the save, so a group
write is a single atomic upsert and two admins editing two integrations never
collide.

```ts
type CredentialField = {
  ciphertext: string; // base64, AES-256-GCM
  iv: string;         // base64, 12 random bytes
  tag: string;        // base64, 16-byte GCM tag
  fingerprint: string; // HMAC-SHA256 truncated to 16 hex — see §4.2
};

type IntegrationCredentialDoc = {
  _id: string;                 // genId("integration-credential")
  key: IntegrationKey;         // one doc per integration
  values: Record<string, CredentialField>; // env key → field
  version: number;             // starts at 1, $inc on every accepted save
  updatedById?: string;
  updatedAt: Date;
  createdAt: Date;
};
```

Index: unique on `key` in `apps/server/src/lib/db/indexes.ts`.

**No rows is the normal state.** A clean install has zero documents and behaves
exactly as it does today. Reads never create rows.

**Nothing is ever deleted except by reset.** A reset removes the whole `values`
entry set for that integration (and bumps `version`), rather than deleting the
document, so the audit-free read path stays simple and `version` keeps working.

---

## 4. Encryption

New module `apps/server/src/lib/platform/credential-cipher.ts`.

### 4.1 Key derivation

```
key = HKDF-SHA256(ikm = BETTER_AUTH_SECRET, salt = "erpsys.integration-credential.v1", info = "aes-256-gcm", length = 32)
```

- No new env var, so a handover does not gain another secret to move.
- `BETTER_AUTH_SECRET` is already required to be ≥ 32 characters in production
  by `assertProductionEnv()`, so the IKM is always long enough.
- Derivation runs once per process (memoised), not per request.
- The salt literal is part of the scheme. Changing it is a breaking change —
  bump the version and document the migration rather than editing the string.

### 4.2 Ciphertext and fingerprint

- AES-256-GCM, random 12-byte IV per value, 16-byte tag, AAD = `` `${key}:${envKey}` ``.
  AAD binding stops a ciphertext from being moved between fields or integrations
  in the database.
- `fingerprint = HMAC-SHA256(derivedKey, value)` hex-truncated to 16 characters.
  Deterministic, one-way, and enough to answer "is this the value the process is
  running?" without storing or comparing plaintext.
- The fingerprint is **not** shown in the UI in this change. It exists for the
  boot comparison (§5.3) and the tests.

### 4.3 Rotation and unreadable values

Rotating `BETTER_AUTH_SECRET` makes every stored credential undecryptable. The
chosen behaviour is **degrade, never crash**:

- Decryption fails → that entire integration's stored group is marked
  `unreadable: true`.
- `integrationConfigured(key)` falls back to the `.env` value, so the runtime
  behaves as it did before the override existed.
- The admin row says, in words: **"Stored credentials cannot be read — the
  encryption key changed. Re-enter them, or reset to .env."**
- The panel offers `Reset to .env` and `Re-enter credentials`; both clear the
  unreadable flag.
- Boot logs one line naming the key and the reason (never the value).
- Rotation is documented in §14: reset or re-enter **before** rotating.

---

## 5. Boot sequence

`env` is currently a plain object built at import time by `dotenv`, and
`config/auth.ts` builds `betterAuth` with `env.GOOGLE_CLIENT_ID` at module load.
A DB override therefore cannot reach either without changing *when* the app is
imported. This is the one structural change in the feature.

### 5.1 `env.ts` becomes lazily readable

`apps/server/src/lib/platform/env.ts`:

1. Capture a base snapshot at import, before anything is applied:
   `const BASE = { ...process.env }`.
2. Add a module-level override map and `applyEnvOverrides(values)` that (a)
   writes the map, (b) mirrors each key into `process.env` for third-party code
   that reads it directly, and (c) invalidates the memoised decrypted cache.
3. Convert every **credential** key (the list in §2, plus nothing else) from a
   literal property to a getter:

   ```ts
   get GOOGLE_CLIENT_ID() { return req("GOOGLE_CLIENT_ID", ""); }
   ```

   `req()` becomes `overrides[key] ?? BASE[key] ?? fallback`. Numeric helpers
   (`num`, `port`) stay evaluated as they are today — no editable key is
   numeric, and changing them would invite a mid-flight parse failure.
4. Export `baseEnvValue(key)` so the panel can label a field `.env` and show what
   the deployment actually supplies, and `effectiveValue(key)` so the boot
   fingerprint can be computed.

`env` keeps its current exported shape and type. Every existing consumer
(`turnstile.ts`, `mailer.ts`, storage, chat, auth) is unchanged at the call site.

### 5.2 `index.ts` bootstrap

`apps/server/src/index.ts` changes from a static import of `buildApp` to:

```ts
installProcessGuards();

import { getDb } from "./lib/db/db.js";
import { env, assertPublicOrigin, assertProductionEnv } from "./lib/platform/env.js";
import { ensureIndexes } from "./lib/db/indexes.js";
import { applyEnvOverrides } from "./lib/platform/env.js";
import { loadCredentialOverrides, snapshotAppliedFingerprints } from "./lib/platform/env-overrides.js";

await (await getDb()).command({ ping: 1 });
await ensureIndexes();

const overrides = await loadCredentialOverrides(); // never throws
applyEnvOverrides(overrides.values);
snapshotAppliedFingerprints(overrides.fingerprints);

const { buildApp } = await import("./app.js"); // auth reads env at this point
const app = buildApp();

assertPublicOrigin();
assertProductionEnv();
```

Rules:

- `buildApp` **must** be a dynamic import executed after `applyEnvOverrides`.
  A static import would evaluate `config/auth.ts` first and silently keep the
  `.env` Google client. Add a comment-free test that asserts this ordering
  (§13) rather than relying on review.
- `assertProductionEnv()` and `assertPublicOrigin()` move after overrides so the
  R2 checks validate the *effective* values. `DATABASE_URL` is never
  overridable, so the connection above already used the only value it can use.
- `ensureIndexes()` runs before the credential read, so the unique index exists
  on a fresh database.
- The existing "database reachable, indexes ensured" try/catch is extended, not
  duplicated: a ping failure still refuses to accept traffic.

### 5.3 Boot read failure

If the credential read fails for any reason (Mongo unavailable, decryption
error, malformed document):

- Log `[env] credential overrides could not be loaded — running on .env values`
  with the error.
- Continue booting. `.env` is a complete, working configuration by definition.
- Record `bootState.overridesLoaded = false` and expose it on the admin GET, so
  the panel shows: **"Stored credentials were not applied at boot. Restart after
  the database is reachable."**
- Do **not** cache the failure as "no overrides", and never write anything.

This is the availability-over-exactness choice: a boot loop is a full outage, a
stale-but-working config is not.

### 5.4 Restart detection (fingerprints, not epochs)

At boot, after overrides are applied, compute for every editable key:

```
bootFingerprint[key] = fingerprint(effectiveValue(key))
```

`GET` compares, for each key that has a stored override **or** whose effective
value differs from what was applied:

```
pendingRestart = fingerprint(wouldBeEffectiveNow(key)) !== bootFingerprint[key]
```

Consequences worth stating explicitly:

- A save changes the stored fingerprint → `pendingRestart` is true until a boot
  reads that value. No manual acknowledgement, no "any restart clears it".
- A *reset* also sets `pendingRestart`, because the running process still holds
  the override it loaded at boot; only a restart drops it.
- A restart that failed to load overrides does not clear the badge — the
  fingerprints still differ, which is the honest answer.
- A value saved and then saved back to the same bytes has the same fingerprint,
  so it does not raise a false badge.
- `VITE_TURNSTILE_SITE_KEY` is the one exception: it is read from the database by
  the public endpoint, so a new site key works before the restart. The group
  badge still shows, because the group also contains the secret key. The UI says
  so on that field: "Applies without a restart."

Fingerprints live in a module-level `Map` in `env-overrides.ts` and are cleared
only by a restart. They are not persisted; a process that never read a value
cannot claim it applied.

---

## 6. Probes

New module `apps/server/src/lib/platform/credential-probes.ts`. Every probe is
server-side, bounded, and allowlisted. No probe follows a redirect, and no probe
takes a URL from the request body except R2's endpoint, which is matched against
a pattern first.

### 6.1 Rules

- Timeout: **8 s** per request via `AbortSignal.timeout(8000)`. One attempt, no
  internal retries — the admin's Retry button is the retry.
- Fixed hosts only:

  | Integration      | Host                                   | Method / path                                             |
  | ---------------- | -------------------------------------- | --------------------------------------------------------- |
  | `googleAuth`     | `oauth2.googleapis.com`                | `POST /token`                                             |
  | `turnstile`      | `challenges.cloudflare.com`            | `POST /turnstile/v0/siteverify`                           |
  | `cloudflareChat` | `api.cloudflare.com`                   | `GET /client/v4/accounts/{id}/ai/models`                  |
  | `email`          | `api.brevo.com`                        | `GET /v3/account`                                         |
  | `r2`             | `<hex>.r2.cloudflarestorage.com`       | `HEAD /{bucket}` (SigV4)                                  |

- R2 endpoint must match `^https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com$`
  exactly: no port, path, query, userinfo, or alternate host. Anything else is
  rejected **before** a socket opens, which is what keeps a credential field
  from becoming an SSRF primitive.
- Responses are read with a hard cap (8 KB) and parsed defensively. A provider
  HTML error page produces "provider returned an unexpected response", never a
  stack trace.
- Never log a value, a header, or a full provider body. Log integration key,
  HTTP status, and outcome only.

### 6.2 Classification

| Integration      | Accepted                                   | Rejected with                                                       |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `googleAuth`     | `400` whose `error` is `invalid_grant` or `invalid_request` — the pair is recognised, the dummy code is not | `401 invalid_client`, `400 redirect_uri_mismatch`, anything else |
| `turnstile`      | `200` with `error-codes` containing `invalid-input-response` (or `timeout-or-duplicate`) — the secret is good, the dummy token is not | `invalid-input-secret`, `missing-input-secret`, anything else |
| `r2`             | `200` on the bucket                        | `403` "key rejected", `404` "bucket not found", other              |
| `cloudflareChat` | `200` with `success: true`                 | `401`/`403` "token rejected", `404` "account not found"            |
| `email`          | `200` from `/v3/account`                   | `401` "API key rejected", other                                    |

`MAIL_FROM` has no probe of its own: validate it as an email address, then keep
the existing caveat that Brevo only accepts a **verified sender**, which cannot
be confirmed without sending mail. Inline help says so.

### 6.3 Failure is a block

The chosen rule is absolute: **any** probe failure — `401`, timeout, DNS failure,
`500` from the provider — rejects the save with `422 UNPROCESSABLE_CONTENT` and
`data.failures: [{ key, reason }]`. The UI shows the reason and a Retry that
re-submits the same body.

No "save anyway", no audited force-save, no hidden override. If a provider is
genuinely down during a handover, the operator falls back to editing `.env` —
which is exactly the mechanism this feature is a convenience for, and which
never depended on this page.

---

## 7. Server modules

### 7.1 Credential registry

New file `apps/server/src/lib/platform/credential-registry.ts` (pure values,
importable by tests without Mongo):

```ts
export type CredentialClass = "secret" | "plain";

export type CredentialFieldSpec = {
  envKey: string;
  label: string;          // "Client secret"
  hint: string;           // one line, what it is for
  helpUrl?: string;       // provider console deep link
  className: CredentialClass;
  required: boolean;
  pair?: string;          // envKey that must be set at the same time
};

export const CREDENTIAL_FIELDS: Record<IntegrationKey, CredentialFieldSpec[]>;
export const CREDENTIAL_ENV_KEYS: readonly string[]; // flattened, for §5.1
```

Inline help (interview: dashboard links) lives here so the same sentence feeds
the editor and the export header. Per integration, the help covers: what to
create, the scopes/permissions, the exact callback URL
(`${PUBLIC_SITE_URL}/api/auth/callback/google` for Google), and where the value
lives in the provider console. These are short — three or four lines at most —
and they do not duplicate the runbook.

### 7.2 Override loader

New file `apps/server/src/lib/platform/env-overrides.ts`:

```ts
export async function loadCredentialOverrides(): Promise<{
  values: Record<string, string>;                 // decrypted, applied at boot
  fingerprints: Record<string, string>;           // per env key
  unreadable: Record<IntegrationKey, boolean>;
  loaded: boolean;                                // false on any read failure
}>;

export function bootFingerprints(): Record<string, string>;
export function snapshotAppliedFingerprints(f: Record<string, string>): void;
export function pendingRestartFor(key: IntegrationKey): Promise<boolean>;
```

`pendingRestartFor` is the only async part of the admin read; it compares each
key's would-be-effective fingerprint with the boot snapshot. It never decrypts
for the comparison — it recomputes the HMAC of the effective string.

### 7.3 Service

Extend `apps/server/src/services/integrations/IntegrationSettingService.ts`
rather than adding a second service, because the row payload and the toggle are
the same resource:

```ts
static async rows(): Promise<IntegrationRow[]>;               // gains credentials + pendingRestart + version
static async saveCredentials(args: {
  actorId: string;
  key: IntegrationKey;
  version: number;
  values: Record<string, string | null>;
}): Promise<IntegrationRow>;                                  // probes, encrypts, writes, audits
static async resetCredentials(actorId: string, key: IntegrationKey): Promise<IntegrationRow>;
static async exportEnv(actorId: string): Promise<{ filename: string; content: string }>;
```

`saveCredentials` order of operations — the order is the design:

1. `assertKey`, validate the body shape and the key set (§2).
2. Reject unknown env keys, empty strings, values over 4096 characters.
3. Enforce pairs: both-or-neither for each pair in the registry.
4. Merge with the current stored group to get the **candidate effective group**
   (`null` → `.env` value from `baseEnvValue`).
5. Require every `required` key in the candidate group to be non-empty.
6. Run probes for the affected integration, using the candidate group.
7. Read the current doc; if `doc.version !== args.version` → `409 CONFLICT`.
8. Encrypt the changed fields, upsert with `$set`/`$inc`, `version + 1`.
9. Invalidate the public-flag cache and the public site-key cache.
10. Append the audit row.

Steps 1–6 cannot write. Step 8 is one document write. A probe that fails at step
6 therefore leaves no trace, which is what "blocked" has to mean.

`resetCredentials` drops `values` for the integration, bumps `version`, audits,
invalidates caches. It does not touch the toggle.

### 7.4 Audit rows

Same collection and shape as `setIntegrationEnabled`
(`{ _id, actorId, action, targetRef, at }`), plus one optional field:

```ts
{
  _id: genId("admin-action"),
  actorId,
  action: "Updated Google sign-in credentials" | "Reset Google sign-in credentials" | "Exported integration credentials",
  targetRef: key,          // the env keys are listed in detail, not in action
  detail: "GOOGLE_CLIENT_ID (12345••••••••••••), GOOGLE_CLIENT_SECRET",
  at: new Date(),
}
```

- `detail` is optional on existing rows, so the shape stays backward compatible.
- Mask comes from the **new** value for a save (the old one is gone) and lists
  key names only for a reset (there is no value to point at).
- The export records key names, never values, plus the actor — the export itself
  is the sensitive event, and it must be possible to answer "who took the keys
  out" from the audit log alone.

### 7.5 Public site key

`loadPublicIntegrationFlags()` gains a sibling read of the turnstile site key:

```ts
export async function publicIntegrationPayload(): Promise<{
  flags: Record<IntegrationKey, boolean>;
  turnstileSiteKey: string;
  overridesLoaded: boolean;
}>;
```

Cached in-process like the flags, invalidated by every credential write, so a new
site key reaches the login page on the next fetch without a restart. `overridesLoaded`
is `false` only after a failed boot read (§5.3).

**Payload shape change.** The public `GET /api/v1/integrations` currently returns
`{ data: { turnstile: boolean, … } }`. It becomes:

```json
{ "data": { "flags": { "turnstile": true, "r2": true, "googleAuth": false,
  "cloudflareChat": true, "email": true }, "turnstileSiteKey": "0x4AAA…",
  "overridesLoaded": true } }
```

`useIntegrations()` in the web app is the only consumer and is updated in the
same change. The admin shape stays an array and is told apart by
`Array.isArray`, as today.

---

## 8. API surface

### 8.1 Routes

`apps/server/src/routes/integrations/index.ts` gains three endpoints and keeps
its existing two. Each carries the mandatory docblock (method + full URL,
access, use, returns) per `AGENTS.md`.

```
GET    /api/v1/integrations
       Access: public (session + admin changes the shape)
       Returns: { data: rows } for an admin, { data: { flags, turnstileSiteKey, overridesLoaded } } otherwise
       Rows gain: credentials[], version, pendingRestart, overridesLoaded

PUT    /api/v1/integrations/:key/credentials
       Access: session + admin surface
       Use: replace the credential group — body { version, values: Record<envKey, string | null> }
       Returns: 200 { data: row } | 409 stale version | 422 probe/validation failure | 429 rate limited

DELETE /api/v1/integrations/:key/credentials
       Access: session + admin surface
       Use: reset the group to .env values (no body)
       Returns: 200 { data: row }

GET    /api/v1/integrations/credentials/export
       Access: session + admin surface
       Returns: { data: { filename, content } } — plaintext .env block, `Cache-Control: no-store`
```

Route order matters: `/integrations/credentials/export` must be registered
**before** `/integrations/:key/credentials` or `:key` swallows `credentials`.
That is easy to get wrong and worth a route test.

`PUT`/`DELETE` bodies use `parseBody` with a zod schema:
`z.object({ version: z.number().int().positive(), values: z.record(z.string(), z.string().max(4096).nullable()) })`
with `strict()` so an unknown env key is a `400`, not a silent no-op.

Rate limit: the existing limiter, 10 writes per actor per minute, keyed on the
session. Probes are expensive and a limiter is the only thing between an admin
session and a provider-side rate ban.

### 8.2 Admin row payload

```ts
type CredentialFieldView = {
  envKey: string;
  label: string;
  hint: string;
  helpUrl: string | null;
  class: "secret" | "plain";
  required: boolean;
  /** Plaintext for a plain field (or the .env value); never a secret's value. */
  value: string | null;
  /** Secret only: `abc12••••••••••••`; null when unset. */
  masked: string | null;
  /** Where the effective value came from. */
  source: "env" | "stored" | "missing";
  unreadable: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

type IntegrationRow = {
  key: IntegrationKey;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  consequence: string;
  updatedByName: string | null;
  updatedAt: string | null;
  credentials: CredentialFieldView[];
  version: number;          // 0 when no stored group exists
  pendingRestart: boolean;
  overridesLoaded: boolean;
};
```

`masked` is computed on the server from the decrypted value and the plaintext is
dropped before the response is shaped — the full secret never exists in a
response object, an error handler, or a log line.

### 8.3 Masking rule (one implementation, both sides)

Server: `maskSecret(value)` in `credential-registry.ts`.

```
value === null / ""        → null
value.length < 6           → "••••••••••••"
otherwise                  → value.slice(0, 5) + "••••••••••••"
```

Five characters and exactly twelve dots, always. The fixed dot count is the
point: length is not disclosed (interview choice).

The web keeps no copy of this rule — it renders whatever `masked` says. A test
asserts the server rule at the boundaries (5, 6, 7 characters).

---

## 9. Web wiring

### 9.1 Hooks

`apps/web/src/lib/integrations/use-integrations.ts`:

```ts
useIntegrations();          // now reads { flags, turnstileSiteKey, overridesLoaded }
useAdminIntegrations();     // rows carry credentials, version, pendingRestart
useSetIntegration();        // unchanged
useSaveCredentials();       // PUT, invalidates ["integrations"] on success
useResetCredentials();      // DELETE, invalidates ["integrations"] on success
useExportCredentials();     // GET, returns { filename, content }
```

- Query keys stay `["integrations", "public" | "admin"]` so the existing
  cross-surface invalidation already covers credentials.
- `ALL_ON` stays as the pending default for flags. The site key's pending
  default is `""`, and `LoginCard` treats `""` as "Turnstile not available"
  exactly as it treats an empty build-time key today.
- On a `409`, the mutation surfaces the conflict rather than retrying: the user
  has to reload the row and re-enter. Quietly retrying could overwrite the other
  admin's credential with a stale one.

### 9.2 Routes table

`apps/web/src/lib/api-routes.ts`, under `admin`:

```ts
saveIntegrationCredentials: { method: "PUT", path: "/api/v1/integrations/:key/credentials" },
resetIntegrationCredentials: { method: "DELETE", path: "/api/v1/integrations/:key/credentials" },
exportIntegrationCredentials: { method: "GET", path: "/api/v1/integrations/credentials/export" },
```

### 9.3 Turnstile site key

`LoginCard` (and any other `useIntegrations()` consumer) reads the site key from
the payload instead of the build-time `VITE_TURNSTILE_SITE_KEY`. The env value
survives as the bootstrap default in `publicIntegrationPayload()`, so a
deployment that never touches the editor behaves exactly as today.

This removes a latent handover bug: the site key was compiled into the bundle,
so a new owner would have had to rebuild the SPA to change it.

---

## 10. Admin UI

Loads `apple-design` and follows the same restraint as the toggles panel. No new
visual primitives, no new dependencies, no card grid. `AppleSwitch`,
`EmptyState`, `$lib/motion`, the `.material`/`.bg-chrome` tokens and
`relativeTime` are reused as-is.

### 10.1 Panel structure

```
Integrations                                            [ Export .env ]
Turning one off hides it in the app and closes the door on the server.
Credentials live here, encrypted. A change takes effect after a restart.

┌ 2 credential changes are waiting ─────────────────────────────────────┐
│ Restart the service to apply them.                                    │
│ sudo systemctl restart erpsys                                   [Copy] │
└───────────────────────────────────────────────────────────────────────┘

┌ Google sign-in                                          [ ●——— on ]   ┐
│ Sign in and link accounts with Google.                                │
│ ● Credentials loaded · Sign-in becomes email and password only        │
│ Last changed by Ana Reyes · 3 days ago        Credentials  ⌄          │
│                                                                       │
│  Client ID        stored  12345••••••••••••            [ Replace ]    │
│  Client secret    .env    ••••••••••••                 [ Replace ]    │
│  ── inline help: where to create it, scopes, callback URL ──          │
│  [ Save ]  [ Cancel ]                                                 │
└───────────────────────────────────────────────────────────────────────┘
```

Row order is unchanged — the server's blast-radius order
(`googleAuth`, `turnstile`, `r2`, `cloudflareChat`, `email`).

### 10.2 Disclosure

- A `Credentials` button with a chevron sits at the right end of the meta line.
  It is a real `<button>` with `aria-expanded` and `aria-controls`, min 44 px
  tall, and it is the only expand affordance — clicking the row body must not
  toggle anything (the row contains a switch and a disclosure; a third click
  target makes both surprising).
- One group open at a time is **not** enforced. Two open groups are harmless and
  forcing accordion behaviour is one more state to explain.
- Expansion animates **height, opacity and chevron rotation together**,using the existing `useSpring` with the panel's critically damped default
  (`damping 1.0`, `response 0.3`, apple-design §4 and §7). The spring reads the
  live value, so a click mid-animation reverses from where it is instead of
  jumping (apple-design §3). A collapsed group unmounts its inputs; no state
  persists for a closed group.
- `prefers-reduced-motion: reduce` → instant open/close, no height travel, no
  chevron rotation; content still mounts and is announced (`aria-expanded` is
  the state, not the animation).
- No scrim, no modal, no slide-in drawer. The disclosure is spatial continuity:
  the credentials appear directly under the integration they belong to
  (apple-design §7).

### 10.3 Field anatomy

| Part        | Rule                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| Label       | The registry label — "Client secret", not "Secret 2"                                          |
| Plain field | Real `<input>`, value visible, editable inline, `spellCheck={false}`                          |
| Secret field| Read-only display of `masked`; `Replace` swaps it for `<input type="password">` with `autoComplete="new-password"`, `spellCheck={false}`, `autoCapitalize="off"` |
| Provenance  | `.env` / `stored` / `missing`, plus the masked or plain value                                 |
| Hint        | One line under the field group; `helpUrl` renders as a normal link that opens in a new tab    |
| Unreadable  | The whole group shows a warning line; values are not claimed to be readable                   |
| Dirty state | `Save` disabled until at least one field differs from the loaded row                          |
| Cancel      | Restores every field to the loaded value and collapses nothing                                |

Editing a secret is deliberately not "click the mask": a mask that becomes an
input implies the field is pre-filled with the secret, and it never is. `Replace`
states that the value will be replaced.

Do not prefill any secret into a DOM field. Do not put a secret in a `title`,
`placeholder`, `data-*` attribute, or React DevTools-visible prop. `Replace` is a
boolean in state; the value only enters a field after the admin types it.

### 10.4 Save feedback

Chosen: **inline, on the group** — no toast.

- On success: the group's status line becomes `Saved · restart required` (or
  `Saved` when nothing needs a restart), the fields re-render with the new masks,
  and the panel banner count updates.
- On `422`: a `role="alert"` block above the buttons with the provider's reason
  per key and one `Retry` that re-sends the identical body.
- On `409`: `role="alert"` — "Another admin changed these credentials. Reload
  this row and re-enter your change." One `Reload` action.
- On `429`: "Too many attempts. Wait a minute, then retry." No auto-retry.
- The confirmation fades in over 100 ms and then persists; it is not a transient
  toast because the fact it reports (pending restart) does not go away.
- The existing toggle toasts are untouched — this section only replaces feedback
  for credential writes.

### 10.5 Restart banner

- Appears only when at least one row has `pendingRestart` or the boot read
  failed.
- Danger/warning token, one left-edge marker plus text, no glow, no animation
  beyond a 100 ms opacity fade. `role="status"` so it is announced when the count
  changes.
- Copy: the exact command, `sudo systemctl restart erpsys`, with a copy button.
  Naming the unit is the difference between a useful banner and a riddle.
- Per-row badge: `Restart required`, small, text — not a bare coloured dot.
- The banner never offers a restart button. Restarting production is an operator
  action, deliberately kept out of a web form (interview).

### 10.6 Export

- One panel-level action in the header, labelled `Export .env`.
- Expands an inline region (not a modal) with: what will be included, an explicit
  warning that it contains **live credentials**, and a `Show and copy` button.
- The content arrives only after that second click. It is rendered in a
  `<pre>`-style block with `select-all`, a `Copy` button, and a `Download`
  fallback that builds a `Blob` client-side (no new dependency).
- Never rendered before consent — a page that displays secrets on load is one
  screenshot away from a leak.
- The block includes only the keys in §2, grouped by integration with comment
  headers, and a first-line comment naming the export time and that it belongs in
  `/etc/erpsys.env`.
- Value escaping: if a value contains whitespace, `#`, `"`, `$`, or a newline,
  it is double-quoted with `\\`, `\"`, `\$` escaped and newlines as `\n`.
- `Cache-Control: no-store` on the response; no query cache entry for the export
  (a `queryFn` with `staleTime: 0` and `gcTime: 0`, or a plain fetch outside
  TanStack Query — prefer the latter so the value is not retained in memory by a
  cache).
- The admin action is audited on the server when the response is produced, not
  when the button is clicked.

### 10.7 Core configuration (read-only)

A collapsed section at the bottom. Content: a `dt`/`dd` list of the core env key
names from the deployment file, each with `Configured` / `Missing` in words, and
one sentence: "These come from the deployment env file and are not editable here."

No values, no masks, no edit affordance. This is the answer to "what must exist
before the integrations can work" during a handover, and nothing more.

### 10.8 Loading, empty and error states

- Loading: the existing five-row skeleton, plus two thinner lines where the
  credential rows will be. No layout shift when the disclosure count appears.
- Error: `EmptyState` naming the cause and the next action — "Could not load the
  integrations" + Retry, and explicitly "nothing has been changed".
- Empty rows: unchanged from the toggles panel.

### 10.9 Accessibility

- Secret value is ornamental: the mask carries `aria-hidden="true"`; an adjacent
  `sr-only` line reads `Credential set, 51 characters` or `Credential not set`.
  Length is announced because the person reading it is the account that is
  allowed to replace it — the fixed dot run exists to keep length off a
  screenshot, not out of the admin's own ears.
- `Replace`, `Save`, `Cancel`, `Retry`, `Reload`, `Copy`, `Show and copy` are all
  real buttons with visible text.
- `aria-expanded` / `aria-controls` on the disclosure; focus stays on the
  disclosure button when it is used, so the reading order does not jump.
- The probe failure block is `role="alert"`; the restart banner is `role="status"`.
- Focus ring survives every state change: no `outline: none` anywhere in the new
  markup.
- Every row's switch keeps its existing `ariaLabel` including the on/off state.

### 10.10 Anti-slop checklist

- [ ] Not a grid of cards; the disclosure is inside the existing list
- [ ] No modal, no drawer, no popover for editing or exporting
- [ ] No glow, no gradients, no pill badges, no decorative icons
- [ ] Every dot still marks a real state (configured / not configured)
- [ ] No looping animation anywhere; the only motion is the disclosure spring and
      two 100 ms fades
- [ ] Masked values are typographic (`font-mono`, `tabular-nums`), never a blurred
      real value — blur is not redaction
- [ ] Numbers that appear are real (`2 credential changes`, `51 characters`)
- [ ] The panel explains one decision per row, not a feature tour

---

## 11. Export format

```env
# ERPSYS integrations — exported 2026-10-27T09:14:02.113Z by admin@buksu.edu.ph
# Live credentials. Install at /etc/erpsys.env (root:erpsys, 0640) and restart erpsys.service.
# Keys marked with * are also still present in the current .env; the value below wins at boot.

# Google sign-in
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET="GOCSPX-..."

# Turnstile
TURNSTILE_SECRET_KEY=0x4AAA...
VITE_TURNSTILE_SITE_KEY=0x4AAA...
TURNSTILE_HOSTNAMES=erpsys.buksu.edu.ph

# Cloudflare R2
R2_BUCKET=erpsys-prod
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# Cloudflare Workers AI
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# Email
BREVO_API_KEY=...
MAIL_FROM=noreply@buksu.edu.ph
```

Rules:

- Effective values only — an unset optional key is omitted, not emitted empty.
- An integration with no effective credentials emits its comment header and a
  `# <KEY> is not configured` line, so the new owner sees the gap instead of
  assuming completeness.
- No core keys (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `PUBLIC_SITE_URL`, …).
  Those are the deployment's responsibility and are named in the runbook.
- Deterministic key order (registry order) so two exports of the same state are
  byte-identical apart from the header.

---

## 12. Edge cases (production)

| Case                                                    | Behaviour                                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fresh install, no credential docs                       | Zero rows; every field shows its `.env` value or `Missing`; nothing is written on read                                       |
| Mongo unavailable at boot                               | Boot with `.env` only, log loudly, `overridesLoaded: false`, panel banner says the stored values were not applied            |
| Mongo unavailable at save                               | `503`, single-document write means nothing is half-applied; the field keeps the value the admin typed                       |
| `BETTER_AUTH_SECRET` rotated                            | Every stored group decrypts to `unreadable`; runtime falls back to `.env`; panel tells the admin to re-enter or reset         |
| `BETTER_AUTH_SECRET` restored from an old backup        | Same degrade path — unreadable, not a crash                                                                                  |
| Value saved, service never restarted                    | `pendingRestart` stays true; the badge survives later restarts until the boot fingerprint matches                            |
| Value saved then reset before restart                   | Still pending; the running process is holding the override, so only a restart returns it to `.env`                           |
| Restart happened but boot read failed                   | Badge remains, because fingerprints still differ — no false "applied"                                                       |
| Admin saves the same bytes twice                        | All fingerprints equal the stored ones → `changed: false`, no version bump, no audit row, no pending badge                   |
| Two admins, same integration                            | Second save sees a stale `version` → `409`, row asks for a reload; nothing is overwritten                                   |
| Two admins, different integrations                      | Separate documents, no interaction                                                                                           |
| Probe times out / provider 5xx                          | Save blocked, reason shown, `Retry` re-sends; `.env` editing remains the escape hatch                                        |
| Probe rejected (401)                                    | Save blocked with the provider's message; the previous stored value is untouched                                             |
| `R2_ENDPOINT` pointing at an internal host              | Rejected by the allowlist before any request; message names the expected shape                                              |
| `R2_ENDPOINT` correct but bucket missing                | Probe returns 404 → blocked with "bucket not found"                                                                          |
| Pair half-filled (access key without secret)            | `422` before any probe                                                                                                       |
| Required key cleared and `.env` also empty              | Allowed to save as `null`; row shows `Missing`; toggle is independent and may still be on                                    |
| Integration off, credentials edited                     | Allowed; the toggle does not move                                                                                             |
| Credentials broken, toggle on                           | Allowed; the row states the runtime consequence. No auto-off                                                                 |
| Site key changed, secret unchanged                      | New key is served on the next public fetch (no restart); group badge still shows because the group also holds the secret      |
| Google client changed                                   | Needs the restart; `better-auth` builds its provider from `env` at import, which the bootstrap guarantees happens after apply |
| Google saved while a user is mid-OAuth-redirect         | Callback still resolves against the old client id until restart; after restart a stale code fails and the user retries        |
| Turnstile secret changed, site key not                  | Widget renders with the old key until the secret is applied; the probe validates the secret only — inline help warns to save both |
| Credential body over 4 KB per value                     | `400` with the limit named                                                                                                   |
| Unknown env key in the body                             | `400` (strict schema), never a silent ignore                                                                                 |
| Export requested                                        | Plaintext in the response body, `no-store`, audited with actor and time; nothing cached client- or server-side               |
| Export while a group is unreadable                      | That group emits the "could not be read" comment line and no values                                                          |
| 11 saves in a minute by one admin                       | `429`, no probe is sent, no provider quota burned                                                                            |
| Classified value contains quotes/newlines               | Export escapes it; the API never assumes a value is shell-safe                                                               |
| Log inspection after a credential change                | Key names, statuses and outcomes only; no value, mask included                                                               |
| Second server instance                                  | Unchanged ceiling: the in-process caches do not propagate. Still single-instance (toggles spec §12)                           |

---

## 13. Tests

Server (`apps/server/src/lib/platform/*.test.ts`, colocated per `AGENTS.md`):

- `credential-registry.test.ts` — every integration has a non-empty field list;
  every pair is symmetric; `maskSecret` boundaries (0, 5, 6, 7, long, unicode);
  `CREDENTIAL_ENV_KEYS` matches the registry exactly.
- `credential-cipher.test.ts` — round trip; wrong key fails closed; AAD mismatch
  fails (a ciphertext moved to another env key cannot be decrypted); IV differs
  per encryption; fingerprint is stable and differs across values.
- `credential-probes.test.ts` — each classifier against a faked fetch: success,
  `401`, timeout, HTML body, redirect; R2 endpoint allowlist rejects internal
  hosts, ports, paths, `http://`.
- `env-overrides.test.ts` — boot load applies values; read error returns
  `loaded: false` and does not throw; unreadable group falls back; fingerprints
  recorded; `pendingRestartFor` is true after a write, false after a matching
  boot snapshot.

Server route/service tests (`apps/server/tests/routes/` and
`apps/server/tests/services/`):

- `GET` admin shape includes credentials, `version`, `pendingRestart`; public
  shape includes `flags`, `turnstileSiteKey`, `overridesLoaded`, and **no**
  credential values.
- `PUT` rejects: unknown key, empty required value, half pair, stale version,
  probe failure — and asserts **no** write and **no** audit row in each case.
- `PUT` success: one document, `version + 1`, audit row with key names and masked
  prefix, cache invalidated (next public read sees the new site key).
- `DELETE` reset: values removed, `version + 1`, audit row, still no toggle write.
- Export: returns only §2 keys, contains no core key names, sets `no-store`,
  writes an audit row.
- Route order: `GET /integrations/credentials/export` resolves to the export
  handler, not `:key`.
- `POST /integrations/:key` (toggles) is unchanged.

Boot order test (`apps/server/src/index.test.ts` or a focused integration test):

- Overrides applied before `buildApp()` is imported: seed an override for
  `GOOGLE_CLIENT_ID`, boot, assert `auth` was constructed with the override
  (inspect via a small accessor or the built config), not the `.env` value.

Web (`*.test.tsx`, colocated):

- The disclosure opens, mounts fields, and closes; `aria-expanded` tracks it.
- A secret renders the server mask and no plaintext exists in the DOM.
- `Replace` produces an empty password input; Cancel restores the mask.
- `Save` is disabled until dirty; a successful save shows `Saved · restart
  required` and the new masks, with **no** toast.
- A `422` shows the provider reason and Retry re-sends the same body.
- A `409` shows the reload message and clears the optimistic state.
- `Export .env` requires the second click; the content is absent from the DOM
  before it.
- The restart banner appears only with `pendingRestart` or `overridesLoaded:
  false`, and names `sudo systemctl restart erpsys`.
- Reduced motion: the disclosure renders open/closed instantly (assert no
  transition classes / spring hook bypassed).
- `LoginCard` reads the site key from the API payload, renders no Turnstile when
  it is empty, and still gates on the `turnstile` flag.

Gates: `pnpm check`, `pnpm test`, and `pnpm --filter web build` if the panel adds
CSS.

---

## 14. Operations

### 14.1 Handover runbook addition

`docs/ops/deployment.md` gains a short section:

1. Before rotating `BETTER_AUTH_SECRET`, open Integrations, `Reset to .env` on
   every group that has stored credentials (or re-enter them afterwards).
2. To move the deployment: `Export .env`, install it as `/etc/erpsys.env`,
   `systemctl restart erpsys`, then verify each row reads `Credentials loaded`
   and no `Restart required` badge remains.
3. New owner's first login must be an `ADMIN_EMAILS` account — that key stays in
   env by design.

### 14.2 `.env.example`

Add a comment block stating the layering: values here are the floor; a value
saved in the admin console is stored encrypted in Mongo and overrides this file
**after a restart**. Keep the existing `*_ENABLED` kill switches documented as
the boot-time floor, unchanged.

### 14.3 Logging and metrics

- One line per credential write: integration key, key names, actor id, outcome.
  No values, no masks.
- One line per boot load: count of applied keys, or the failure.
- Existing admin audit surfaces (`admin_action_log`) become the record of who
  changed what; no new collection.

---

## 15. Files

**New**

```
docs/specs/integration-credentials-spec.md
apps/server/src/lib/platform/credential-registry.ts
apps/server/src/lib/platform/credential-registry.test.ts
apps/server/src/lib/platform/credential-cipher.ts
apps/server/src/lib/platform/credential-cipher.test.ts
apps/server/src/lib/platform/credential-probes.ts
apps/server/src/lib/platform/credential-probes.test.ts
apps/server/src/lib/platform/env-overrides.ts
apps/server/src/lib/platform/env-overrides.test.ts
apps/web/src/components/admin/IntegrationCredentialsEditor.tsx
apps/web/src/components/admin/IntegrationCredentialsEditor.test.tsx
apps/web/src/components/admin/CoreConfigSection.tsx
apps/web/src/lib/integrations/credentials.ts        (labels/help mirror of the registry — hand-synced, type-only)
```

**Modified**

```
apps/server/src/index.ts                                   bootstrap + dynamic buildApp import
apps/server/src/lib/platform/env.ts                        base snapshot, override map, credential getters
apps/server/src/lib/db/db.ts                               COLLECTIONS.integrationCredential
apps/server/src/lib/db/indexes.ts                          unique index on key
apps/server/src/lib/platform/integration-settings.ts       public payload, configured-on-effective, site key cache
apps/server/src/services/integrations/IntegrationSettingService.ts   row shape, save/reset/export
apps/server/src/controllers/integrations/IntegrationsController.ts   three handlers
apps/server/src/routes/integrations/index.ts               three routes + docblocks
apps/web/src/lib/api-routes.ts                             three leaves
apps/web/src/lib/integrations/use-integrations.ts          payload shape + three hooks
apps/web/src/components/admin/IntegrationsPanel.tsx        banner, disclosure, export, core config
apps/web/src/components/auth/LoginCard.tsx                 site key from the API
.env.example                                               layering note
docs/ops/deployment.md                                     handover + rotation steps
docs/README.md                                             index entry for this spec
```

No migration script: the collection starts empty and every read tolerates that.

---

## 16. Known ceilings

- **Single instance.** The public flag and site-key caches are per-process, as
  today. A second process would serve stale values until it restarted. The fix
  remains the change-stream seam named in the toggles spec.
- **`BETTER_AUTH_SECRET` is the encryption root.** Rotating it without resetting
  or re-entering credentials leaves every stored group unreadable by design.
  There is no key-version envelope in this change; adding one is the next step if
  rotation becomes routine.
- **Restart is manual.** A credential change is not live until an operator
  restarts the service. This is deliberate: a web form should not be able to drop
  every in-flight upload and SSE stream in production.
- **Probes prove reachability, not permission completeness.** A token that can
  read Workers AI models is not guaranteed to run inference; a Google client that
  answers `invalid_grant` may still lack the authorised redirect URI for the
  deployed host. The provider console remains the authority for scopes.
- **Export is a plaintext escape hatch.** Audited and admin-only, but once copied
  it is out of the system's control. That is inherent to a handover artifact.
