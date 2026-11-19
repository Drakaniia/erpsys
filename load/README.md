# Load gate

`pnpm test:load` â€” the Phase 4 load gate from
`docs/specs/load-resilience-design.md`. 500 distinct authenticated students
against `POST /queues`, `GET /departments/mine` and `GET /queues/mine`, then
five assertions.

**Tool: autocannon.** It installs from the workspace with `pnpm add -D
autocannon` on Windows, macOS and Linux runners â€” no system-level binary, so
there is nothing for a CI image to keep in sync. k6's scenario model is the
better tool; if the gate ever needs arrival-rate shaping or per-VU scripting it
should move to k6, which requires the k6 binary to be installed first.

## Prerequisites

- **A running server** at `LOAD_BASE_URL` (default `http://127.0.0.1:3001`).
  `pnpm dev` is enough for a local run; a deployed origin is the honest one.
- **A writable MongoDB** at `DATABASE_URL`. The scenario seeds itself â€” students,
  sessions, step verifications, an adviser, an open queue â€” so it does not need
  a pre-seeded database, but it does need one it can write to and clean up
  after.
- **`BETTER_AUTH_SECRET`,** set to the same value the server booted with. The
  runner mints Better Auth session cookies directly, and they are HMAC-signed
  with that secret.
- A configured `step` catalog, if the database has none. `joinQueue` refuses the
  join until every pre-enrollment step is `VERIFIED`.

`pnpm test:load -- --help` prints the same list plus every environment variable.

## Running

```bash
# local
pnpm dev
pnpm test:load

# against a deployed origin, with the budget and heap ceiling the runbook records
LOAD_BASE_URL=https://erpsu.example \
LOAD_ORIGIN=https://erpsu.example \
LOAD_P95_BUDGET_MS=800 \
LOAD_MAX_OLD_SPACE_MB=768 \
pnpm test:load
```

The runner removes everything it created on the way out. `LOAD_TEARDOWN=0` keeps
the rows for inspection.

## What it asserts

| #   | Assertion                                                                 | Source                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Zero unhandled 5xx                                                        | autocannon status-code counts. A 503 is Phase 0's _handled_ backpressure signal and is reported separately; `LOAD_STRICT_5XX=1` counts it as a failure. Socket errors and timeouts fail this assertion too. |
| 2   | p95 under `LOAD_P95_BUDGET_MS`                                            | Every response time, recorded from autocannon's `response` event (it reports p90/p97.5 but not p95).                                                                                                        |
| 3   | Zero duplicate `(studentProfileId, academicYearId)` in `enrollment_queue` | A direct Mongo `$group` by the pair, not an inference from HTTP responses. Offending ids are printed.                                                                                                       |
| 4   | At most one `IN_PROGRESS` row per department                              | A direct Mongo `$group` by `(departmentId, academicYearId)`.                                                                                                                                                |
| 5   | Heap below the `--max-old-space-size` ceiling                             | `/api/metrics`, scraped during the run, against `LOAD_MAX_OLD_SPACE_MB`.                                                                                                                                    |

### The p95 budget is deliberately unset

The design fixes the budget at the end of Phase 3, from the before/after numbers
recorded there, and then writes it into `docs/ops/deployment.md`. A number chosen
now would be a guess dressed up as a target, so this scenario has none.

With `LOAD_P95_BUDGET_MS` unset it still runs, prints the measured p95 for every
procedure under a `MEASURED p95 â€” NO BUDGET HAS BEEN SET YET` heading, and marks
that assertion `SKIP`. Set `LOAD_REQUIRE_P95_BUDGET=1` to turn the absence into
a failure â€” useful for a nightly gate, once the budget exists.

Assertions 3 and 4 are the real value of the gate: they are what proves the
Phase 1 unique indexes held under concurrency. They are asked of the collection,
because the HTTP surface can only report what the server chose to return.

Assertion 4 has a known blind spot: this scenario drives the student surface
only, so nothing ever moves a queue row to `IN_PROGRESS` and the check usually
has nothing to contradict. The run says so when that happens. The adviser-side
race â€” N parallel `beginServing` calls on one department â€” is covered by the
Phase 1 concurrency tests, not here.

## Files

| File            | Role                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `run.mjs`       | Entry point: prerequisites, orchestration, report, exit code.            |
| `config.mjs`    | Environment parsing; every failure is an instruction, not a stack trace. |
| `wire.mjs`      | The REST wire format, asserted in one place.                             |
| `seed.mjs`      | Mongo seeding, Better Auth cookie signing, teardown.                     |
| `scenario.mjs`  | The three autocannon runs.                                               |
| `integrity.mjs` | The two Mongo invariant queries.                                         |
| `metrics.mjs`   | `/api/metrics` scraper for the heap assertion.                           |
| `histogram.mjs` | Fixed-bucket latency histogram, for an exact p95.                        |
