# Cloudflare Workers AI Replacement Spec

Status: draft v1 — 2026-10-14. Written from a five-round interview; nothing
implemented yet. Supersedes nothing, but **hard-deletes** the Gemini
integration (see §3).

Scope in one line: the student chatbot (`POST /api/chat/stream`) stops calling
Google Gemini and calls **Cloudflare Workers AI over the REST API from the
existing Express process** instead. `wrangler` is used to set up and inspect
the Cloudflare account, not to run the assistant.

## 1. Context (verified in repo)

- The chatbot is one Express handler: `apps/server/src/routes/chat.ts`,
  mounted at `/api/chat/stream` (`apps/server/src/app.ts:60`).
  - `chat.ts:15-25` imports all pacing/model helpers from `lib/chat/model-router.js`.
  - `chat.ts:46-50` `buildModelChain()` — `GEMINI_PRIMARY_MODEL` plus
    comma-split `GEMINI_FALLBACK_MODELS`.
  - `chat.ts:52` `configurePacer(env.GEMINI_RPM)` runs at module load.
  - `chat.ts:54-56` `geminiUrl(model)` →
    `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`.
  - `chat.ts:169-176` the upstream call: `acquireGeminiSlot()` then
    `fetch(..., { headers: { "x-goog-api-key": env.GEMINI_API_KEY } })`.
  - `chat.ts:237` `pauseGeminiUntil(...)` on 429/503/5xx.
  - Request body is Gemini-shaped: `contents[].parts[].text`,
    `systemInstruction.parts[].text`, `generationConfig { temperature: 0.2,
maxOutputTokens: 800 }`; client role `"model"` is passed through unchanged.
  - SSE passthrough to the browser uses **its own** envelope
    (`{type:"start"|"token"|"done"|"error"}`), written after `res.writeHead(200, … text/event-stream)`.
- Pacing / failover state machine: `apps/server/src/lib/chat/model-router.ts`.
  Exports `DEFAULT_GEMINI_RPM = 15`, `DEMOTE_AFTER = 2`,
  `DEMOTE_LOOKBACK_MS = 60_000`, `DEMOTE_COOLDOWN_MS = 5 * 60_000`,
  `MAX_PACE_WAIT_MS = 20_000`, `reportModelOutcome`, `isModelDemoted`,
  `orderModels`, `configurePacer`, `resetPacer`, `pauseGeminiUntil`,
  `pacingWaitMs`, `acquireGeminiSlot`, `parseRetryAfterSeconds`. All state is
  process memory; nothing is persisted.
- Prompt construction (unchanged by this work): `lib/chat/knowledge.ts` —
  `buildSystemPrompt` (knowledge doc + `--- STUDENT ---` block +
  `OUT_OF_SCOPE_REPLY`), `getKnowledgeContent` (5-minute in-process cache),
  `getStudentChatContext` (verified steps / current step / queue). Contract
  tests: `lib/chat/knowledge.test.ts`.
- Env: `apps/server/src/lib/platform/env.ts:87-93` holds `GEMINI_API_KEY`,
  `GEMINI_PRIMARY_MODEL` (`gemini-3.5-flash-lite`), `GEMINI_FALLBACK_MODELS`
  (`gemini-3.5-flash,gemini-3.6-flash`), `GEMINI_RPM` (15).
- Client contract: `apps/web/src/lib/chat/stream-helpers.ts`
  (`buildApiMessages` emits `role: "user" | "model"`; `formatValidationMessage`
  hard-codes the words `"user" or "model"`), consumed by
  `apps/web/src/lib/chat/use-chat.ts` (`use-chat.ts:93` role mapping,
  `use-chat.ts:183` the `fetch("/api/chat/stream")`). Tests:
  `apps/web/src/lib/chat/stream-helpers.test.ts`.
- Docs/ops that name Gemini: `docs/ops/deployment.md:292-295` (the optional
  env table), `deploy/nginx/erpsys.conf:381-383` (the stall comment above
  `location = /api/chat/stream`, which keeps `proxy_read_timeout 120s`),
  `docs/ops/deployment.md` §"`http_503` is dropped on the API paths".
- Server-side rate limit today: `CHAT_RATE_LIMIT_WINDOW_MS = 60_000`,
  `CHAT_RATE_LIMIT_MAX = 10`, key `user:{id}|ip:{ip}`, 429 +
  `Retry-After`. Pinned by `apps/server/src/routes/chat.test.ts`.
- Existing observability surface: `console.warn` / `console.error` with a
  bracketed prefix (there is **no** logger module in `apps/server/src`), plus
  the token-guarded metrics handler at
  `apps/server/src/lib/platform/metrics.ts:367` (`metricsHandler`).
- No `.env*` file is tracked in this repo; secrets are documented in
  `docs/ops/deployment.md` only.

### 1.1 Cloudflare facts this design rests on (researched 2026-10-14)

| Fact                       | Value                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI-compatible endpoint | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`                                                                                                                                                                                                                            |
| Auth                       | `Authorization: Bearer <api_token>` (Workers AI token)                                                                                                                                                                                                                                                         |
| Native alternative         | `POST /client/v4/accounts/{id}/ai/run/@cf/<model>` (not used)                                                                                                                                                                                                                                                  |
| Streaming                  | `stream: true` → SSE `data:` chunks; compat shape is OpenAI's                                                                                                                                                                                                                                                  |
| Free allocation            | **10,000 Neurons/day for the whole account**, reset 00:00 UTC; $0.011 / 1,000 Neurons after (requires Workers Paid)                                                                                                                                                                                            |
| Paid-only models           | kimi-k2.6/2.7, glm-5.2/5.3/5.3-flash, deepseek-v4-flash/pro — **gpt-oss-20b is not in that list**, so it is free-tier eligible                                                                                                                                                                                 |
| Verified error codes       | `3036` HTTP 429 "Account limited" (daily neurons used up); `3040` HTTP 429 "Out of capacity" (also returned when `rejectIfBusy` rejects); `3007`/`3008` 408 timeout/aborted; `3006` 413 request too large; `3042`/`5007` 404/400 bad model id; `5035` 403 model needs Workers Paid; `3023` 403 account blocked |
| Busy behaviour             | Workers AI queues when capacity is busy; top-level `rejectIfBusy: true` makes it fail fast with `3040`                                                                                                                                                                                                         |
| Pricing inputs             | `@cf/openai/gpt-oss-20b` $0.20/M in, $0.30/M out; `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 26,668 neurons/M in, 204,805/M out; `@cf/meta/llama-3.1-8b-instruct` 25,608/M in, 75,147/M out                                                                                                                    |
| Endpoint deprecation note  | Cloudflare's `/compat/chat/completions` gateway path is documented as deprecated for single-model calls in favour of exactly the `/ai/v1/chat/completions` URL chosen here                                                                                                                                     |

## 2. Goal

Swap the inference provider end to end, with **no visible change to the
student experience** except the wording changes listed in §3, while making the
account-wide daily Neuron ceiling a graceful product state instead of an error.

Non-goals:

- Deploying a Cloudflare Worker. There is no Worker in this design; `wrangler`
  never runs in production and must not become a build or CI dependency
  (`wrangler deploy`, `wrangler dev`, and `wrangler tail` do **not** apply —
  there is nothing to deploy or tail).
- Replacing the knowledge doc, prompt, student context, or the client-side SSE
  envelope's existing `start`/`token`/`done`/`error` event names.
- Changing the per-user request rate limit (10 requests/minute stays).
- Prompts, welcome UI, or the "how it works" copy.
- Any AI Gateway integration (explicitly deferred; §12).

## 3. Interview decisions (binding)

| #   | Decision                | Choice                                                                                                                                                                                                                                   |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Topology                | **Express calls the Workers AI REST API directly.** No Worker, no proxy hop, no Cloudflare code in the repo.                                                                                                                             |
| 2   | API shape               | **OpenAI-compatible** `POST /client/v4/accounts/{id}/ai/v1/chat/completions`; roles become `system`/`user`/`assistant`, deltas read from `choices[0].delta.content`, `data: [DONE]` terminates.                                          |
| 3   | Model chain             | `@cf/openai/gpt-oss-20b` primary → `@cf/meta/llama-3.3-70b-instruct-fp8-fast` → `@cf/meta/llama-3.1-8b-instruct`, all env-driven. The 3-model chain, 2-attempt ladder, 2-strike demotion and cooldown are **kept**, only the ids change. |
| 4   | Cutover                 | **Hard delete Gemini.** No `AI_PROVIDER` flag, no retained Gemini path; helpers with Gemini in the name are renamed to provider-neutral names.                                                                                           |
| 5   | Wrangler                | Pinned **devDependency of `apps/server`**, used for account verification and documented setup only.                                                                                                                                      |
| 6   | Credentials             | One token for dev and prod: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` in `.env`, same pattern as `GEMINI_API_KEY`.                                                                                                                |
| 7   | Missing token           | **No new production boot check.** Empty token = chatbot silently dead, exactly like an empty `GEMINI_API_KEY` today. `assertProductionEnv` is untouched.                                                                                 |
| 8   | Daily cap guard         | **Mongo-persisted daily accounting** with a per-student sub-budget, feeding a student-visible "resting until midnight UTC" state.                                                                                                        |
| 9   | Usage source            | **Estimated from text** (characters → tokens → neurons via a rate table + safety margin). We do **not** depend on upstream usage objects or `stream_options`.                                                                            |
| 10  | Per-student budget unit | **Tokens per student per UTC day**, converted to neurons internally.                                                                                                                                                                     |
| 11  | Out-of-cap handling     | Detect error code `3036` in the response body → **one retry** → if it repeats, mark the day exhausted, stop the chain, answer with the resting message.                                                                                  |
| 12  | Client roles            | **Rename `"model"` → `"assistant"`** on the wire, so the SPA, its tests, and the server validation strings all move together.                                                                                                            |
| 13  | Sampling                | `temperature: 0.2`, `max_tokens: 800` (explicit — the upstream default is 256 and would visibly truncate), plus a **hard 30s server-side deadline** that aborts the upstream fetch.                                                      |
| 14  | Busy upstream           | Send `rejectIfBusy: true` so a saturated model fails fast (`3040`) instead of parking the request in Cloudflare's queue, then walk to the next model.                                                                                    |
| 15  | Dev without a token     | In `NODE_ENV=development` with no token, stream a **canned reply** locally so the UI is workable offline; never active in production.                                                                                                    |
| 16  | Observability           | **Logs only** (`console.warn`/`console.error` with a `[chat]` prefix) plus the Mongo daily docs. No new metrics counters.                                                                                                                |
| 17  | Kill switch             | One env flag plus a student-visible maintenance string; off = clean 503, no redeploy of config needed.                                                                                                                                   |
| 18  | Testing                 | Unit tests with **stubbed `global.fetch` and recorded Cloudflare chunk/payload fixtures**; no network in CI.                                                                                                                             |
| 19  | Docs                    | All in the same change: `deployment.md` env table + prod notes, the nginx comment, a new ops token/wrangler runbook section, `docs/README.md` index entry, and an `open-requests.md` row marked Done.                                    |
| 20  | Delivery                | Spec first (this file); implementation is a separate change.                                                                                                                                                                             |

## 4. Target flow

```
SPA ──POST /api/chat/stream {messages:[{role:"user"|"assistant", text}]}
      → Express: session + role check, 10/min rate limit (unchanged)
      → env.CLOUDFLARE_CHAT_ENABLED? else 503 maintenance body
      → budget precheck (account day + this student's day) → resting reply if over
      → knowledge doc + student context → system prompt (unchanged)
      → for model of orderModels(chain):
           acquireSlot()  (renamed pacer)
           POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/v1/chat/completions
             Authorization: Bearer {token}
             { model, messages:[{role:"system"|"user"|"assistant", content}],
               stream:true, temperature:0.2, max_tokens:800, rejectIfBusy:true }
           → SSE deltas → res SSE {type:"token"} … {type:"done"}
      → budget commit (estimated tokens → neurons) in Mongo
```

### 4.1 Upstream request mapping

- `messages`: one `{role:"system", content: buildSystemPrompt(knowledge, ctx)}`
  first, then the conversation. Client `"model"` → `"assistant"`.
- `stream: true`, `temperature: 0.2`, `max_tokens: 800`, `rejectIfBusy: true`.
- Do **not** send `stream_options`, `prompt`, or the native `/ai/run` body
  shape.

### 4.2 Upstream stream parsing (new helper, replaces the Gemini loop)

- Accumulate the byte stream, split on `\n`, keep the trailing partial line in
  the buffer (same shape as the current loop).
- Only lines starting with `data: ` are considered; `data: [DONE]` ends.
- Emit `choices[0].delta.content` only.
- **Ignore `delta.reasoning` / `delta.reasoning_content` / `delta.analysis`
  and any `message.reasoning*` field.** gpt-oss models are reasoning models:
  chain-of-thought must never reach a student's chat panel. This is a hard
  requirement with a dedicated test.
- Ignore `usage`, `id`, `object`, `created`, `model`, and `finish_reason`
  except for logging.
- A final chunk may carry `usage`; if it is present, log it, but do not let the
  guard depend on it (§5).

### 4.3 Error mapping (replaces `chat.ts:237`+)

| Upstream                                             | Code               | Outcome                                                                                            |
| ---------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| 429 body `3036` Account limited                      | daily neurons gone | **one retry**, then mark the day exhausted, stop the whole chain, student sees the resting message |
| 429 body `3040` Out of capacity (or unparseable 429) | capacity           | `reportModelOutcome(model,"unavailable")`, short `pauseUntil`, next model                          |
| 429 with `retry-after`                               | either             | honour it up to the existing 10s ceiling when pacing the next attempt                              |
| 5xx                                                  | —                  | unavailable, demote strike, pause, next model                                                      |
| 404 `3042` / 400 `5007` bad model id                 | config error       | unavailable, **skip remaining attempts for that model**, next model                                |
| 400 other (`5004`, `3003`, `3039`)                   | bad request        | skip remaining attempts for that model, next model                                                 |
| 403 `5035` needs Paid plan, `3023` account blocked   | account-level      | stop the chain; log loudly; student sees the generic "can't reach the assistant" message           |
| 413 `3006` request too large                         | prompt too big     | stop the chain; student sees a "that conversation got too long — start a new one" message          |
| 408 `3007`/`3008`                                    | timeout/aborted    | unavailable, next model (client abort still returns silently)                                      |
| any other non-2xx                                    | —                  | existing generic error envelope                                                                    |

Error bodies must be parsed **defensively**: read the body text exactly once
(the current code already does `await response.text().catch(() => "")`), then
try JSON and look for a numeric code in `error.code`, `error.details`,
`errors[0].code`, or a bare `3036`/`3040` substring. Fixtures for both the
OpenAI-shaped (`{"error":{...}}`) and Cloudflare-native
(`{"errors":[{"code":3036}]}`) bodies are required, because which one the compat
endpoint returns on error is **not verified**.

## 5. Daily Neuron guard + per-student budget

### 5.1 Why

10,000 Neurons/day is account-wide. Rough arithmetic with a ~2,000-token
knowledge doc and a 4-token/char estimate:

- input per turn ≈ system (200) + knowledge (2,000) + history (up to 20 turns,
  ~1,000) ≈ 3,200 tokens
- `gpt-oss-20b` ≈ 18,182 neurons/M input → ≈ 58 neurons, plus ~300 output
  tokens ≈ 8 neurons → **≈ 66 neurons/turn**, or **≈ 150 turns/day for the
  entire cohort** before fallbacks to the pricier 70B model, which burns
  neurons ~1.5× faster per input token and ~7.5× per output token.

The guard is therefore not a nicety; it is the difference between a graceful
"resting" state and 300 students hitting a raw 429.

### 5.2 Storage

New collection (`COLLECTIONS.chatUsage` in `apps/server/src/lib/db/db.ts`) with
two document shapes, both keyed by UTC day string:

- `{ _id: "2026-10-14:total", day, tokens, neurons, turns, exhausted: boolean, exhaustedAt?: Date }`
- `{ _id: "2026-10-14:user:<userId>", day, userId, tokens, neurons, turns }`

Written with atomic `$inc`/`$setOnInsert` upserts; no read-modify-write. Add a
TTL index on `day` (keep ~30 days) in `apps/server/src/lib/db/indexes.ts`,
following that file's existing style, plus the `COLLECTIONS.chatUsage` entry.
The day key is computed as `new Date().toISOString().slice(0,10)` so the reset
is genuinely 00:00 UTC, matching Cloudflare's own reset.

### 5.3 Precheck / commit

- **Precheck (before the upstream call):** read `:total` and `:user:<id>`. If
  `exhausted` or `neurons >= CLOUDFLARE_DAILY_NEURON_CAP * 0.9` (10% reserve →
  protects the last ~1,000 neurons from a bad estimate) → return the resting
  reply. If the student is over `CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY` → return
  the per-student rest-of-day reply.
- **Commit (after the stream ends or fails):** add the estimated tokens for
  prompt + streamed completion; `$inc` both docs. Commit on failure too, so a
  half-streamed answer still counts.
- **Estimate function (pure, testable):** `estimateTokens(text)` =
  `Math.ceil(chars / 4)`, and `estimateNeurons({model, inputTokens,
outputTokens})` from a per-model rate table in the same module, multiplied by
  a `NEURON_SAFETY_FACTOR` (1.25) and rounded up.
- New module: `apps/server/src/lib/chat/budget.ts` + `budget.test.ts`. Pure
  functions exported for tests; Mongo access injected/taken as a parameter the
  way `knowledge.ts` takes a `Db`, so tests never need a live Mongo.
- Rate table lives beside the estimate with published rates for the three
  models, and a comment that rates must be re-checked against Cloudflare's
  pricing page when a model id changes.

### 5.4 Student-visible copy

Three distinct strings (all overridable/env-driven, kept out of the SPA so the
server owns them, delivered as the existing `{type:"error"}` event with a
distinct status where possible):

1. **Account day exhausted:** "The assistant has hit its daily limit — it will
   be back after midnight UTC. For an urgent question, ask an SBO officer at
   the office."
2. **This student's share used up:** "You've reached today's chatbot limit —
   try again after midnight UTC."
3. **Maintenance/kill switch (503):** the `CLOUDFLARE_MAINTENANCE_MESSAGE` env
   value, defaulted to a plain "The assistant is offline for maintenance."

Student-facing copy names no provider and no model.

## 6. Env surface

Remove all four `GEMINI_*` vars from `apps/server/src/lib/platform/env.ts:87-93`
and from `docs/ops/deployment.md:292-295`. Add:

| Variable                                | Default                                                                   | Notes                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`                 | `""`                                                                      | Account that owns the Workers AI allocation.                                                                                 |
| `CLOUDFLARE_API_TOKEN`                  | `""`                                                                      | Workers AI–scoped token. Empty = chatbot dead, boot still succeeds.                                                          |
| `CLOUDFLARE_PRIMARY_MODEL`              | `@cf/openai/gpt-oss-20b`                                                  | Leads the chain.                                                                                                             |
| `CLOUDFLARE_FALLBACK_MODELS`            | `@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/meta/llama-3.1-8b-instruct` | Comma-separated, order preserved.                                                                                            |
| `CLOUDFLARE_RPM`                        | `30`                                                                      | Ceiling this server aims at; Workers AI has no published per-minute quota, so this is self-protection, not a provider limit. |
| `CLOUDFLARE_DAILY_NEURON_CAP`           | `10000`                                                                   | The free allocation; the 10% reserve is applied on top.                                                                      |
| `CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY` | `20000`                                                                   | Per-student fairness share (~6 turns at §5.1's sizes).                                                                       |
| `CLOUDFLARE_CHAT_ENABLED`               | `true`                                                                    | `false` → clean 503 + maintenance message.                                                                                   |
| `CLOUDFLARE_MAINTENANCE_MESSAGE`        | `""` (code fallback string)                                               | Student-visible maintenance copy.                                                                                            |
| `CLOUDFLARE_REQUEST_DEADLINE_MS`        | `30000`                                                                   | Hard deadline; must stay below nginx's `proxy_read_timeout 120s` (`deploy/nginx/erpsys.conf:381-384`).                       |

Numeric vars go through the existing `num()` helper in `env.ts` (it already
guards against `NaN`/negative typos), not bare `Number(req(...))` — the current
`GEMINI_RPM` line is exactly the pattern `num()` was written to replace.

## 7. Files to change

Changed:

- `apps/server/src/routes/chat.ts` — URL/builder/body/headers/parser/error
  mapping; role rename; `CLOUDFLARE_CHAT_ENABLED` gate; deadline; budget
  precheck/commit; `[chat]` logging.
- `apps/server/src/lib/chat/model-router.ts` — rename `pauseGeminiUntil` →
  `pauseProviderUntil` (or similar neutral name), `DEFAULT_GEMINI_RPM` →
  `DEFAULT_CHAT_RPM`; keep every other constant and the demotion semantics.
- `apps/server/src/lib/platform/env.ts` — swap the four `GEMINI_*` entries for
  the block in §6.
- `apps/server/src/lib/chat/knowledge.ts` — only if the system prompt needs the
  role vocabulary updated; `OUT_OF_SCOPE_REPLY` and the `--- STUDENT ---`
  framing stay byte-identical (they are contract-tested).
- `apps/server/src/lib/db/db.ts` — `COLLECTIONS.chatUsage`.
- `apps/server/src/lib/db/indexes.ts` — TTL index for `chatUsage`.
- `apps/web/src/lib/chat/stream-helpers.ts` — `role: "user" | "assistant"`.
- `apps/web/src/lib/chat/stream-helpers.test.ts` — fixture roles.
- `apps/web/src/lib/chat/use-chat.ts` — role mapping (`use-chat.ts:93`) and any
  copy that says "model".
- `apps/server/package.json` — `wrangler` devDependency; a script such as
  `"cf:whoami": "wrangler whoami"`.
- `deploy/nginx/erpsys.conf:381-383` — the stall comment (a Cloudflare stream
  can stall mid-stream while the fallback chain is tried), timeouts unchanged.
- `docs/ops/deployment.md:292-295` + the §"`http_503` is dropped" notes.
- `docs/README.md` — index entry for this spec.
- `docs/specs/open-requests.md` — new row, marked Done once verified.

New:

- `apps/server/src/lib/chat/budget.ts` + `budget.test.ts`.
- `apps/server/src/lib/chat/cloudflare.ts` + `cloudflare.test.ts` (URL builder,
  request body, SSE delta parser, error-body code parser) — or the same code
  inside `chat.ts` with the pure parts extracted; the pure-parser split is the
  point, since it is what the fixtures test.
- `apps/server/src/routes/chat.stream.test.ts` (fixture-driven handler test with
  stubbed `fetch`).
- `apps/server/src/lib/chat/fixtures/*.json` (Cloudflare chunk streams,
  error bodies, a `3036` body, a `3040` body).
- `docs/ops/cloudflare-ai-verification.md` — the manual smoke checklist (§9).

Deleted: nothing beyond the four env vars, `geminiUrl`, and the
`x-goog-api-key` header path. `apps/server/src/routes/chat.test.ts` stays — its
rate-limit contract is unaffected.

## 8. Wrangler's role (setup only)

- Pinned in `apps/server/devDependencies`; run through pnpm so everyone uses the
  same version: `pnpm --filter @erpsys/server exec wrangler <cmd>` and/or the
  package script.
- Documented, verified commands: `wrangler whoami` (confirm the account id
  matches `CLOUDFLARE_ACCOUNT_ID`), `wrangler login` (OAuth, for a human
  verifying an account on a workstation). `wrangler whoami`/`login` need no
  `wrangler.jsonc` — and since no Worker exists, **do not add one**, and do not
  document `wrangler dev`/`deploy`/`tail`, which would only confuse an operator
  hunting for a Worker that is not there.
- Token creation is a dashboard step (My Profile → API Tokens → Workers AI
  template) and belongs in the runbook; wrangler cannot mint it. If a future
  `wrangler ai`-family command is confirmed to list models or usage, it can be
  added then — the spec deliberately does not assume it exists.
- Wrangler must stay out of `pnpm build`, `pnpm check`, `pnpm test`, and the CI
  workflows (`.github/workflows/ci.yml`, `load-gate.yml`).

## 9. Verification

Automated (required before merge): `pnpm check`, `pnpm test`, and for any web
touched by the role rename, `pnpm --filter web build`.

Fixture/unit coverage to add:

- request-body mapping: system prompt first, `"model"` → `"assistant"`,
  `stream: true`, explicit `max_tokens: 800`, `rejectIfBusy: true`.
- SSE parser: multi-line chunk boundaries, `[DONE]`, malformed JSON skipped,
  **reasoning fields dropped**.
- error-code parser: `3036` stops the chain after one retry; `3040` and an
  unparseable 429 move to the next model; `5035`/`3023` stop the chain;
  `3006` returns the too-long message; `3042` skips a model without burning
  the chain.
- budget: estimate maths, 10% reserve, per-student share, UTC day boundary,
  commit-on-failure.
- kill switch and dev canned responder (development-only, never in production).
- the existing rate-limit tests in `routes/chat.test.ts` unchanged and passing.

Manual smoke (checklist file, run once per environment, not automated):

1. `wrangler whoami` matches `CLOUDFLARE_ACCOUNT_ID`.
2. One real streamed answer through the browser with the network tab showing
   `token` events and no reasoning text.
3. `CLOUDFLARE_DAILY_NEURON_CAP=1` → the account-exhausted message, then the
   day doc shows `exhausted: true`.
4. `CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY=1` → the per-student message.
5. `CLOUDFLARE_PRIMARY_MODEL=@cf/does-not-exist` → logging shows the bad-model
   code, the chain moves on, the student still gets an answer.
6. `CLOUDFLARE_CHAT_ENABLED=false` → 503 + maintenance copy.
7. `CLOUDFLARE_API_TOKEN=""` in a production-like run → boot succeeds, warnings
   logged, chat returns the friendly failure (matches §3 decision 7).
8. Real Neuron spend after the smoke run compared with the guard's estimate, so
   `NEURON_SAFETY_FACTOR` and the reserve can be re-tuned from evidence.
9. Confirm the day docs auto-expire via the TTL index.

## 10. Rollback

Hard-deleting Gemini means there is no env-flip rollback to the old provider:
rolling back is `git revert` of the implementation commit. The in-place off
switch during an incident is `CLOUDFLARE_CHAT_ENABLED=false` (clean 503,
maintenance copy). Both belong in the runbook.

## 11. Risks and open questions

Risks:

- **Free-tier headroom is small.** §5.1's ≈150 turns/day is the whole cohort.
  The guard makes that graceful, but if the cohort is ~300 students the honest
  outcome is that the assistant is unavailable for much of the day; the scaling
  path is Workers Paid or AI Gateway prepaid credits, and that decision is the
  school's, not the code's.
- **Estimate drift.** Characters→tokens is approximate for Filipino/English
  mixed text; the 1.25 factor and the 10% reserve cover it, and Cloudflare's own
  `3036` is the authoritative backstop.
- **gpt-oss-20b is a reasoning model.** Grounding in the knowledge doc is
  prompt-enforced today, not model-enforced, and the old lead model
  (`gemini-3.5-flash-lite`) was chosen for latency rather than instruction
  following. Expect prompt tuning; `knowledge.test.ts`'s contract (the exact
  `OUT_OF_SCOPE_REPLY` sentence) must keep passing.
- **Reasoning leakage** if a future delta field name is missed — hence the
  explicit ignore-list plus a test, rather than "read `delta.content` and no
  one noticed the rest".
- **Role rename is a two-app change.** The SPA ships separately from the API in
  a standalone-API deploy (`SERVE_WEB=false` / `WEB_ORIGIN`), so a stale SPA
  bundle would send `role: "model"` to a server that expects `"assistant"`.
  Mitigation: accept both roles on input for one release (normalize
  `"model"` → `"assistant"`), while only ever emitting `"assistant"` to the
  client. Decide before build.
- **Privacy/data flow.** The knowledge doc and the student context block (name,
  verified steps, current step, queue status) leave the school's servers for
  Cloudflare, as they did for Google. Worth one line in the deployment doc's
  data-handling notes, mirroring the Drive spec's retention warnings.
- **`error.code` shape is unverified** for the compat endpoint (§4.3), so the
  parser is deliberately tolerant and fixture-tested for both shapes.

Open questions for a follow-up interview:

1. Exact `CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY` default (20,000 = ~6 turns), and
   whether officers/instructors get a larger share than students.
2. Do we keep accepting `role: "model"` on input for one release (the stale-SPA
   mitigation above), or require the simultaneous web deploy?
3. Is the "resting until midnight UTC" wording acceptable to SBO staff, or should
   it point at walk-in/office hours only?
4. Do we want a per-UTC-day cap on _turns_ in addition to tokens (simpler to
   explain to a student, harder to game)?
5. Should `docs/ops/cloudflare-ai-verification.md` be a new file or a section of
   the existing `docs/ops/deployment.md` chat section?
6. Do we ever want AI Gateway in front (dashboard-configurable caching, per-model
   rate limits, request logs) — deferred in §3 but cheap to add later if the
   token's scope is widened.
