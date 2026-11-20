# Local application

Cloudflare Pages project `erpsys` and Worker `erpsys-api` were deleted. No app is hosted there. MongoDB remains online; its connection string and all data are preserved.

From the repository root:

```sh
pnpm dev
```

Open http://localhost:5173. For the optimized build without watchers:

```sh
pnpm build
pnpm preview
```

The server binds to loopback only. Local-only mode is enabled by default (`LOCAL_ONLY=true`). It keeps password authentication and MongoDB, but disables Google, Turnstile, R2, AI, email and external credential probes, regardless of stored integration switches. Credentials and remote files are retained, not deleted. Features that need those services are unavailable; no local upload/email/AI substitute is implemented.

The private root `.env` remains the credential source. Local auth/public origins are http://localhost:5173. Changing `LOCAL_ONLY=false` explicitly opts out of this restriction; it does not recreate any deleted deployment.

The test project explicitly uses `LOCAL_ONLY=false` to exercise integration contracts with mocks. The local-only regression test separately verifies the offline-service restrictions.
