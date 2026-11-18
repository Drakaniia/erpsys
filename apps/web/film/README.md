# The Enrollment Record

A 42-second, 1920 × 1080, 24 fps ERPSYS film for campus decision-makers. The five signed-in pages are the production React pages, not screenshots. The accounts, form answers, queue positions and term totals are fictional. No sign-in, API server, Google account, storage bucket or database is needed to render.

From the repository root:

```sh
pnpm --filter web film:studio
pnpm --filter web film:render
```

The render script writes `media/ERPSYS-The-Enrollment-Record.mp4`. Both commands regenerate the original instrumental score and prepare the existing COT–SBO seal. `film/public/` and `film/qa/` are local build products. For a constrained machine, use `pnpm --filter web film:prepare`, then `pnpm --filter web exec remotion render film/index.tsx TheEnrollmentRecord ../../media/ERPSYS-The-Enrollment-Record.mp4 --concurrency=1`.

## Edit the film

`Film.tsx` owns the named shots, transitions, typography and timing. `Application.tsx` mounts the real pages inside a memory router and places the pointer over measured app controls. `models.ts` and `records.ts` supply seekable demo states. The Remotion-only aliases in `remotion.config.ts` do not apply to the Vite app. `prepare.mjs` synthesizes the stereo soundtrack without external media.

- 00:00 — opening seal and title
- 00:04 — Mara submits her last outstanding clearance for review
- 00:11 — an officer reviews her profiling response and stamps it
- 00:18 — Mara is first in the faculty queue
- 00:21 — an adviser serves her, confirms enrollment and opens the enrolled roster
- 00:29 — leadership checks the backlog and opens the term’s completion report
- 00:37 — closing seal and system name

The film is designed to be understood without sound. Its score has no narration.
