# Express backend migration to Cloudflare Workers

## Scope

Keep the existing `erpsys.pages.dev` frontend, MongoDB database, Better Auth, Google OAuth, R2 and Workers AI. Move the API off Vercel to a Cloudflare Worker. Preserve API contracts, public origin, encryption/authentication secrets and distributed timestamp ordering. The user subsequently requested deletion of the ERPSYS Vercel project and all its deployments after Cloudflare cutover; production data must remain intact.

## Design

- Use Cloudflare's Node HTTP bridge for Express with Node compatibility.
- Scope MongoDB clients to each request using AsyncLocalStorage. A stable database facade resolves collection calls inside the active request, including Better Auth's MongoDB adapter. Never share sockets between ordinary Worker requests. Close connections only after response streaming and registered background work finish.
- Keep the Mongo-backed timestamp oracle and shared rate limits. Configure callbacks against the scoped database, never a previously connected client.
- Use a scheduled handler for maintenance and the existing distributed maintenance lease. Do not start process intervals in Workers.
- Register audit writes, asynchronous email and object deletion with the request's tracked background lifetime while preserving the non-blocking evidence deletion contract.
- Keep static frontend delivery on Pages. Preserve its proxy secret and replace only the API target after backend verification.
- Use Worker secrets, not tracked environment values. Preserve Better Auth and credential-encryption keys. Disable filesystem SPA serving on the backend. Enable logs/traces and Smart Placement until the actual database region is confirmed.

## Execution and acceptance

1. Inspect Cloudflare account/project configuration and existing environment sources without printing secret values. Record the existing Pages deployment for rollback.
2. Implement Worker runtime isolation, bootstrap and maintenance; add regression tests.
3. Run `pnpm check`, `pnpm test`, frontend build if needed, Wrangler types and deployment dry run. Establish any pre-existing failures against the unchanged base before treating them as migration regressions.
4. Deploy the Worker with Wrangler and the existing production secrets. Exercise health, database readiness, unauthenticated session/protected routes, request concurrency, streaming and scheduled maintenance where safely possible.
5. Switch the existing Pages proxy to the verified Worker; verify public API and frontend in the browser. Retain the previous Pages deployment as rollback.
6. Record actual verification evidence and remaining limits. Google consent, authenticated writes and enrollment-scale performance require valid user interaction or safe test identities; do not claim those verified without evidence.

## Verification and deployment status

- Wrangler authenticated to the account owning the existing `erpsys` Pages project.
- Previous production Pages deployment: `71a7f5bb-34a6-4a30-8dcd-5f57ba59524d`. Current production Pages deployment: `98a4eb71.erpsys.pages.dev`; public origin remains `https://erpsys.pages.dev`. Its API proxy now targets the Worker.
- `pnpm check`, Worker generated types/typecheck and Wrangler deployment dry run passed.
- Final full suite: 1,270 tests across 135 files passed; repository typechecks, Worker generated types/typecheck, frontend build, three Pages proxy tests and deployment dry run passed.
- Worker uploaded with `npx wrangler deploy`: `https://erpsys-api.ovpcasss.workers.dev`, version `35249390-c19b-4d6e-bd46-cebd42c288b2`. Unauthorized direct requests return JSON `403`.
- User confirmed root `.env` as the production credential source. Uploaded 27 allowlisted settings through private stdin; no values printed. Provisioned the matching shared proxy secret on Pages. Explicit `nodejs_compat_populate_process_env` was necessary for the deployed runtime to expose secrets.
- Live database-backed health returns `200` with `runtime: cloudflare-workers`; session lookup returns `200 null`; a protected launch route returns `401`; internal maintenance is hidden with `404`. Eight concurrent health/session requests passed.
- Google sign-in initiation returns `200` with `accounts.google.com` and callback `https://erpsys.pages.dev/api/auth/callback/google`. Completing consent/login and authenticated writes was not tested.
- Every-minute cron is configured on the API Worker. Tail attempts produced no captured events, so successful maintenance execution is not claimed. Local Wrangler runtime attempts timed out; remote startup/database checks succeeded.
- Vercel CLI confirmed permanent deletion of project `erpsys-api` and its deployments. Project listing no longer includes it, deployment inspection fails, and the former production URL returns `404 DEPLOYMENT_NOT_FOUND`. Other Vercel projects were not changed.
- Removed the Vercel handler/configuration and obsolete scheduler proxy. Remaining gaps: real-user Google login, password login, authenticated uploads/download streams, AI responses, maintenance execution evidence and enrollment-scale load testing.

## Future deployments

Use `pnpm --filter @erpsys/server cf:check` and `pnpm --filter @erpsys/server cf:deploy` for the API. Use `pnpm --filter web cf:deploy` to rebuild the frontend, prepare the Pages API proxy/SPA routes, and deploy the existing Pages project. Keep Pages secrets in its production configuration. Do not roll back to old Vercel-targeting Pages deployments: that backend has been deleted.

## Risks

Per-request MongoDB TLS connections increase latency and connection churn; measure before enrollment-scale use. Tune small pools and use placement near MongoDB. Consider a separately scoped connection service only if measurements justify it. Check MongoDB network access from Workers without weakening database access controls automatically. Platform bundle/CPU/subrequest limits and Better Auth password hashing require runtime checks. Do not cut over when secrets or backend readiness are missing.
