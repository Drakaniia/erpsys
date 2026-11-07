# Cloudflare Workers AI — setup and verification

Executable checklist for the student chatbot's Workers AI integration
([spec](../specs/cloudflare-ai-spec.md) §8–§10). Run the setup once per
account, and the smoke list once per environment.

There is **no Cloudflare Worker in this design**. Express calls the Workers AI
REST API from its own process, so nothing is deployed to Cloudflare and
`wrangler dev` / `wrangler deploy` / `wrangler tail` do not apply. `wrangler` is
pinned in `apps/server/devDependencies` for account inspection only, and is
deliberately absent from `pnpm build`, `pnpm check`, `pnpm test`, and CI.

## 1. Set up the account (once)

1. **Mint the token in the dashboard** — wrangler cannot create it. There is no
   `wrangler token` command (checked against 4.149.0: `wrangler ai` only has
   `models` and `finetune`, and the logged-in OAuth session is scoped
   `user: read`, so it cannot mint an API token either).
   `dash.cloudflare.com` → My Profile → API Tokens → **Create Token** →
   the **Workers AI** template → scope it to this one account. Copy the token.
2. **Set the environment.** In `.env` (never a tracked file):

   ```ini
   CLOUDFLARE_ACCOUNT_ID=<the account id from the dashboard URL>
   CLOUDFLARE_API_TOKEN=<the token from step 1>
   ```

   Leave the rest of the `CLOUDFLARE_*` block at its defaults unless the school
   has bought Workers Paid.

3. **Confirm the account id.** `wrangler whoami` prints the accounts this
   machine is authenticated as; the id there must match
   `CLOUDFLARE_ACCOUNT_ID`. It needs no `wrangler.jsonc` — and do not add one.

   ```bash
   pnpm --filter @erpsys/server cf:whoami     # == wrangler whoami
   pnpm --filter @erpsys/server exec wrangler login    # OAuth, a human on a workstation
   ```

4. **Verify the model chain.** The spec's third id,
   `@cf/meta/llama-3.1-8b-instruct`, is now reported as
   deprecated/removed by Cloudflare, so the default is
   `@cf/meta/llama-3.1-8b-instruct-fp8`. Re-check all three whenever the chain
   changes — an id that no longer exists is caught at runtime as `3042` and
   only that model is skipped, but it is a dead fallback until someone looks.

   ```bash
   pnpm --filter @erpsys/server exec wrangler ai models | grep -E 'gpt-oss-20b|llama-3.3-70b|llama-3.1-8b'
   ```

   Expected: `@cf/openai/gpt-oss-20b`,
   `@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
   `@cf/meta/llama-3.1-8b-instruct-fp8`. Model unit prices live on each
   model's page under `developers.cloudflare.com/workers-ai/models/` and feed
   the rate table in `lib/chat/budget.ts`.

5. **Boot and check the log.** With the token set, no `[chat] ... are not set`
   warning appears. With it empty, boot still succeeds and the chatbot answers
   with the friendly failure — that is intentional (spec §3 decision 7).

## 2. Manual smoke (once per environment)

Not automated: each step needs a real account and a real browser.

| #   | Step                                                                  | Expected                                                                                                                      |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm --filter @erpsys/server cf:whoami`                              | The account id matches `CLOUDFLARE_ACCOUNT_ID`.                                                                               |
| 2   | Ask one question in the student chat with the network tab open        | `start`, several `token`, then `done`. The answer is grounded in the knowledge doc, and **no chain-of-thought text** appears. |
| 3   | `CLOUDFLARE_DAILY_NEURON_CAP=1`, ask twice                            | First answer may stream; the next shows the account-resting copy, and `db.chat_usage` has `exhausted: true` for today.        |
| 4   | `CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY=1` (after one turn), ask again | The per-student copy: "You've reached today's chatbot limit…".                                                                |
| 5   | `CLOUDFLARE_PRIMARY_MODEL=@cf/does-not-exist`, ask again              | The log shows the bad-model code (`3042`), the chain moves on, and the student still gets an answer.                          |
| 6   | `CLOUDFLARE_CHAT_ENABLED=false`                                       | `503` with the maintenance copy; no upstream call.                                                                            |
| 7   | `CLOUDFLARE_API_TOKEN=""` in a production-like run                    | Boot succeeds, `[chat] ... are not set` is logged, the student sees the friendly failure.                                     |
| 8   | Compare the dashboard's Neuron spend with the day doc's `neurons`     | Within the safety margin. If not, re-tune `NEURON_SAFETY_FACTOR` (currently 1.25) and the 10% reserve.                        |
| 9   | Wait out the retention window (or check `db.chat_usage.getIndexes()`) | `ttl_chat_usage_expires_at` exists and day docs disappear after ~30 days.                                                     |

Reset every `CLOUDFLARE_*` value you changed for the smoke run.

## 3. Reading the logs

Everything is `console.warn` / `console.error` with a `[chat]` prefix — there is
no metrics counter for the chatbot (spec §3 decision 16).

| Line                                                            | Meaning                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `[chat] <model> attempt <n> upstream <status> (code <n>)`       | One rejected upstream call. Codes map to the spec's §4.3 table.                       |
| `[chat] the account's daily neurons are used up (3036)`         | The whole account is resting until 00:00 UTC. **Escalate if it appears before noon.** |
| `[chat] <model> attempt <n> could not be reached: … (deadline)` | The 30s deadline fired. A slow/black-holed upstream, not a client problem.            |
| `[chat] account-level failure (code 5035/3023)`                 | The plan or the account itself is wrong. Needs an operator, not a retry.              |
| `[chat] budget precheck failed, allowing the turn`              | Mongo hiccup; the turn was allowed through (the guard fails open).                    |
| `[chat] could not record this turn's usage`                     | Mongo hiccup during the commit; the answer still streamed.                            |
| `[chat] deadline (…) reached before …`                          | The chain ran out of wall clock before the next model.                                |

## 4. Incident switches

- **Stop the chatbot now:** `CLOUDFLARE_CHAT_ENABLED=false` in `.env`, restart
  the unit. Students see the maintenance copy; nothing else changes.
- **Change the maintenance copy:** `CLOUDFLARE_MAINTENANCE_MESSAGE="…"`.
- **Nothing streams at all:** check `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` first — an empty either one is the most common cause
  and logs exactly one `[chat]` warning.
