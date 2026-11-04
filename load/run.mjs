#!/usr/bin/env node
/**
 * ERPSYS load gate — `pnpm test:load`.
 *
 * Tool: **autocannon** (see `load/scenario.mjs` for why, and for the k6
 * alternative). This runner needs a RUNNING SERVER and a WRITABLE DATABASE: it
 * seeds its own students, sessions, step verifications, an adviser and an open
 * queue, drives the three student REST endpoints with 500 distinct
 * authenticated students, asserts, then removes everything it created.
 *
 * What it asserts, from the load-resilience design (Phase 4):
 *
 *   1. Zero unhandled 5xx. A 503 is Phase 0's *handled* backpressure signal
 *      (pool exhaustion, shutting down), so it is counted separately and
 *      excluded unless `LOAD_STRICT_5XX=1`.
 *   2. p95 latency under `LOAD_P95_BUDGET_MS`. That budget is set at the end of
 *      Phase 3 from the before/after numbers and written into the runbook. It is
 *      intentionally not invented here: with it unset, the measured p95 is
 *      printed prominently and the assertion is SKIPPED, never faked.
 *   3. Zero duplicate `(studentProfileId, academicYearId)` in `enrollment_queue`
 *      — a direct Mongo group-by, not an inference from HTTP responses.
 *   4. At most one `IN_PROGRESS` row per department per year — likewise.
 *   5. Heap below the `--max-old-space-size` ceiling, read from `/api/metrics`
 *      against `LOAD_MAX_OLD_SPACE_MB`.
 *
 * Exit codes: 0 pass (possibly with SKIPPED assertions), 1 an assertion failed,
 * 2 a prerequisite is missing.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ConfigError,
  PREREQUISITES,
  loadConfig,
  printHelp,
} from "./config.mjs";
import { checkIntegrity } from "./integrity.mjs";
import { startHeapSampler } from "./metrics.mjs";
import { runScenario } from "./scenario.mjs";
import { seed, teardown } from "./seed.mjs";
import { decodeResponse, encodeInput } from "./wire.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

function loadEnvFiles() {
  for (const candidate of [
    path.join(REPO_ROOT, ".env"),
    path.join(process.cwd(), ".env"),
  ]) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      // Absent .env is normal in CI; the env vars come from the workflow.
    }
  }
}

const out = (line = "") => process.stdout.write(`${line}\n`);
const hr = (title) => {
  out();
  out(`── ${title} ${"─".repeat(Math.max(0, 62 - title.length))}`);
};

/** A connection string is a credential. Print enough to debug, not enough to leak. */
function redact(url) {
  return url.replace(/\/\/[^@/]*@/, "//***:***@");
}

function reportPrerequisites(problems) {
  out("test:load — prerequisites not met");
  for (const problem of problems) out(`  ${problem}`);
  out();
  for (const line of PREREQUISITES) out(`  ${line}`);
}

/**
 * One `joinQueue` call with the probe student's cookie, before any sockets
 * open. A misconfigured seed should report the server's own reason here — a
 * missing step catalog, a closed queue, a rejected cookie — rather than produce
 * 500 identical 409s that look like a passing run.
 */
async function preflightProbe(config, probe, departmentId) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    cookie: probe.cookie,
  };
  if (config.origin) headers.origin = config.origin;

  const response = await fetch(`${config.baseUrl}/queues`, {
    method: "POST",
    headers,
    body: encodeInput({ departmentId }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const decoded = decodeResponse(response.status, text);

  if (!response.ok || !decoded.ok) {
    const reason = decoded.ok
      ? `HTTP ${response.status}`
      : decoded.malformed
        ? `malformed response: ${decoded.message}`
        : `${decoded.code} (HTTP ${response.status}): ${decoded.message}`;
    throw new Error(
      [
        `The pre-flight joinQueue probe failed: ${reason}`,
        "",
        "This is a seed or environment problem, not a load result — no traffic was",
        "generated. Check that:",
        "  - the active academic year and an open, live adviser queue exist",
        "  - every pre-enrollment step is configured and the probe student's",
        "    step_verification rows are VERIFIED",
        "  - BETTER_AUTH_SECRET matches the server's, so the session cookie is accepted",
      ].join("\n"),
    );
  }

  // An origin that answers 200 but is not the app server — the Vite dev server,
  // a proxy misroute, an SPA fallback — is a wrong LOAD_BASE_URL, and it would
  // otherwise turn into 500 silent "malformed response" failures.
  if (
    !decoded.value ||
    typeof decoded.value !== "object" ||
    typeof decoded.value.entryId !== "string"
  ) {
    throw new Error(
      [
        `${config.baseUrl}/queues answered 200 with a body that is not a`,
        `joinQueue result: ${text.slice(0, 200)}`,
        "",
        "POST /queues returns {entryId, departmentName, position} as raw JSON, with no",
        "envelope. Anything else means LOAD_BASE_URL is not pointing at the app server's",
        "REST surface.",
      ].join("\n"),
    );
  }

  return decoded.value;
}

async function assertServerReachable(config) {
  const url = `${config.baseUrl}/api/health`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    throw new ConfigError([
      `No server answered ${url} (${error.message}).`,
      '  Start one with "pnpm dev", or set LOAD_BASE_URL to a running origin.',
    ]);
  }
  if (!response.ok) {
    throw new ConfigError([
      `${url} returned HTTP ${response.status}, not 200.`,
    ]);
  }
}

function summariseLatency(latency) {
  if (!latency || latency.count === 0) return "no samples";
  const parts = [
    `p50 ${latency.p50}ms`,
    `p90 ${latency.p90}ms`,
    `p95 ${latency.p95}ms`,
    `p99 ${latency.p99}ms`,
    `max ${latency.max}ms`,
  ];
  return `${latency.count} samples · ${parts.join(" · ")}`;
}

/**
 * Per-procedure p95s, with the sample count beside each.
 *
 * Deliberately not merged into one number: an average of p95s is not a p95, and
 * the two sustained read procedures carry orders of magnitude more samples than
 * the one-shot join burst. The gate enforces the budget against the worst
 * procedure, and prints the rest.
 */
function latencyBreakdown(results) {
  const usable = results.filter((r) => (r.latency?.count ?? 0) > 0);
  if (usable.length === 0) return null;
  return usable.map((r) => ({
    name: r.name,
    count: r.latency.count,
    p95: r.latency.p95,
  }));
}

function printResults(results) {
  hr("HTTP results");
  for (const r of results) {
    out(`${r.name}`);
    out(`  connections        ${r.connections}`);
    // `result.duration` from autocannon is already in seconds (the CLI prints it
    // as "6.01s"), so it is not divided down again here.
    out(
      `  completed requests ${r.completed}  (${Math.round(r.requests)} req/s over ${Number(r.duration ?? 0).toFixed(1)}s)`,
    );
    out(`  latency            ${summariseLatency(r.latency)}`);
    out(
      `  statuses           ${
        Object.entries(r.statusCounts)
          .map(([s, n]) => `${s}×${n}`)
          .join("  ") || "none"
      }`,
    );
    if (r.errors) out(`  socket errors      ${r.errors}`);
    if (r.timeouts) out(`  timeouts           ${r.timeouts}`);
    for (const [status, message] of Object.entries(r.sampleMessages)) {
      out(`  ${status} sample     ${message}`);
    }
  }
}

const assertions = [];
function assert(name, status, detail) {
  assertions.push({ name, status, detail });
}

function printAssertions() {
  hr("Assertions");
  const mark = { PASS: "PASS", FAIL: "FAIL", SKIP: "SKIP" };
  for (const a of assertions) {
    out(`[${mark[a.status]}] ${a.name}`);
    for (const line of a.detail.split("\n")) out(`       ${line}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return 0;
  }

  loadEnvFiles();

  try {
    const config = loadConfig();
    await assertServerReachable(config);
  } catch (error) {
    if (error instanceof ConfigError) {
      reportPrerequisites(error.problems);
      return 2;
    }
    throw error;
  }

  return execute();
}

/**
 * Everything past the prerequisite gate. Split out so the environment checks and
 * the run itself read as separate steps, and so a `ConfigError` raised while
 * connecting to Mongo reaches the same reporter as the ones raised earlier.
 */
async function execute() {
  const config = loadConfig();

  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(config.databaseUrl, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = client.db();

  let seeded = null;
  const sampler = startHeapSampler(config);
  let exitCode = 0;

  try {
    try {
      await client.connect();
      await db.command({ ping: 1 });
    } catch (error) {
      throw new ConfigError([
        `- Could not reach MongoDB at ${redact(config.databaseUrl)} (${error.message}).`,
        "  The gate seeds students, sessions and queue-adjacent rows and asserts",
        "  against the collection afterwards, so it needs a reachable, writable",
        "  database. Check DATABASE_URL, the Atlas IP allowlist, and any network",
        "  policy between this machine and the cluster.",
      ]);
    }

    hr("Configuration");
    out(`base url            ${config.baseUrl}`);
    out(`students            ${config.students} distinct seeded students`);
    out(`read connections    ${config.connections} per sustained procedure`);
    out(`duration            ${config.durationS}s`);
    out(
      `p95 budget          ${config.p95BudgetMs === null ? "(not set)" : `${config.p95BudgetMs}ms`}`,
    );
    out(
      `heap ceiling        ${config.maxOldSpaceMb === null ? "(not set)" : `${config.maxOldSpaceMb}MB`}`,
    );
    out(`integrity scope     ${config.integrityScope}`);
    out(`teardown            ${config.teardown ? "on" : "off"}`);

    hr("Seeding");
    seeded = await seed(db, config);
    out(`run tag             ${seeded.runTag}`);
    out(`academic year       ${seeded.year._id} (${seeded.year.label})`);
    out(
      `department          ${seeded.department._id} (${seeded.department.name})`,
    );
    out(`steps verified      ${seeded.steps.map((s) => s.code).join(", ")}`);
    out(`students seeded     ${seeded.students.length} (+1 pre-flight probe)`);

    const probeResult = await preflightProbe(
      config,
      seeded.probe,
      seeded.department._id,
    );
    out(
      `pre-flight join     ok — position #${probeResult.position} in ${probeResult.departmentName}`,
    );

    out();
    out(`running for ${config.durationS}s …`);
    const results = await runScenario({
      config,
      students: seeded.students,
      departmentId: seeded.department._id,
    });
    printResults(results);

    await sampler.sampleNow();
    const heap = sampler.report();

    hr("Data integrity (direct Mongo queries)");
    const integrity = await checkIntegrity(db, {
      yearId: String(seeded.year._id),
      scope: config.integrityScope,
      profileIds: seeded.students.map((s) => s.profileId),
    });
    out(
      `scope               ${integrity.scope} · academic year ${integrity.yearId}`,
    );
    out(
      `queue rows          ${integrity.totalRows} total, ${integrity.inProgressTotal} IN_PROGRESS`,
    );

    // ── 1. zero unhandled 5xx ───────────────────────────────────────────────
    const fiveXx = results.flatMap((r) =>
      Object.entries(r.statusCounts)
        .filter(([status]) => Number(status) >= 500)
        .map(([status, count]) => ({
          procedure: r.name,
          status: Number(status),
          count,
        })),
    );
    const backpressure = fiveXx.filter((e) => e.status === 503);
    const unhandled = config.strict5xx
      ? fiveXx
      : fiveXx.filter((e) => e.status !== 503);
    const transport = results.reduce(
      (sum, r) => sum + r.errors + r.timeouts,
      0,
    );
    if (unhandled.length === 0 && transport === 0) {
      assert(
        "Zero unhandled 5xx",
        "PASS",
        backpressure.length > 0
          ? `no 5xx. ${backpressure.map((e) => `${e.count}× HTTP ${e.status} on ${e.procedure}`).join(", ")} treated as handled backpressure (set LOAD_STRICT_5XX=1 to fail on it).`
          : "no 5xx and no socket errors or timeouts.",
      );
    } else {
      assert(
        "Zero unhandled 5xx",
        "FAIL",
        [
          ...unhandled.map(
            (e) => `HTTP ${e.status} ×${e.count} on ${e.procedure}`,
          ),
          transport > 0 ? `${transport} socket errors/timeouts` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    // ── 2. p95 under budget ──────────────────────────────────────────────────
    const perProcedure = latencyBreakdown(results) ?? [];
    const worst = perProcedure
      .filter((p) => p.p95 !== null)
      .reduce((a, b) => (b.p95 > (a?.p95 ?? -1) ? b : a), null);
    const detail = perProcedure
      .map((p) => `${p.name}: p95 ${p.p95}ms over ${p.count} samples`)
      .join("\n");
    if (config.p95BudgetMs === null) {
      assert(
        `p95 latency under ${"LOAD_P95_BUDGET_MS"}ms`,
        config.requireP95Budget ? "FAIL" : "SKIP",
        [
          "",
          "  MEASURED p95 — NO BUDGET HAS BEEN SET YET",
          ...(worst
            ? [`  worst procedure: ${worst.name} at ${worst.p95}ms`]
            : []),
          "",
          detail,
          "",
          "  The budget is fixed at the end of Phase 3 from the before/after numbers",
          "  and recorded in docs/ops/deployment.md. Until then this assertion has",
          "  no threshold to compare against, so it is reported and skipped rather",
          "  than passed against an invented number. Set LOAD_P95_BUDGET_MS=<ms> to",
          "  enforce it, or LOAD_REQUIRE_P95_BUDGET=1 to make its absence fail.",
        ].join("\n"),
      );
    } else if (!worst) {
      assert(
        "p95 latency under budget",
        "FAIL",
        "no latency samples were recorded.",
      );
    } else if (worst.p95 <= config.p95BudgetMs) {
      assert(
        "p95 latency under budget",
        "PASS",
        `worst procedure ${worst.name} at ${worst.p95}ms, budget ${config.p95BudgetMs}ms\n${detail}`,
      );
    } else {
      assert(
        "p95 latency under budget",
        "FAIL",
        `worst procedure ${worst.name} at ${worst.p95}ms exceeds the ${config.p95BudgetMs}ms budget\n${detail}`,
      );
    }

    // ── 3. zero duplicate (studentProfileId, academicYearId) ─────────────────
    if (integrity.duplicates.length === 0) {
      assert(
        "Zero duplicate (studentProfileId, academicYearId) in enrollment_queue",
        "PASS",
        `no duplicate pair among ${integrity.totalRows} queue rows for the academic year.`,
      );
    } else {
      assert(
        "Zero duplicate (studentProfileId, academicYearId) in enrollment_queue",
        "FAIL",
        [
          `${integrity.duplicates.length} duplicate group(s) (showing up to 25):`,
          ...integrity.duplicates.map(
            (d) =>
              `  ${d.key} ×${d.count}  ids: ${d.ids.join(", ")}  statuses: ${d.statuses.join(", ")}`,
          ),
        ].join("\n"),
      );
    }

    // ── 4. at most one IN_PROGRESS row per department ────────────────────────
    if (integrity.concurrentServing.length === 0) {
      const vacuous = integrity.inProgressTotal === 0;
      assert(
        "At most one IN_PROGRESS row per department",
        "PASS",
        vacuous
          ? [
              `no department had more than one IN_PROGRESS row.`,
              `NOTE: there were 0 IN_PROGRESS rows in scope, so this assertion had nothing to`,
              `contradict — this scenario drives only the student surface. The adviser-side`,
              `race (N parallel beginServing calls on one department) belongs to the Phase 1`,
              `concurrency tests; run that alongside this gate to cover it.`,
            ].join("\n")
          : `no department had more than one IN_PROGRESS row (${integrity.inProgressTotal} IN_PROGRESS rows in scope).`,
      );
    } else {
      assert(
        "At most one IN_PROGRESS row per department",
        "FAIL",
        [
          `${integrity.concurrentServing.length} department(s) serving more than one student (showing up to 25):`,
          ...integrity.concurrentServing.map(
            (d) =>
              `  department ${d.key} ×${d.count}  ids: ${d.ids.join(", ")}\n      students: ${d.students.join(", ")}\n      advisers: ${d.advisers.join(", ")}`,
          ),
        ].join("\n"),
      );
    }

    // ── 5. heap under the --max-old-space-size ceiling ───────────────────────
    const heapDetail = [];
    heapDetail.push(
      `scraped ${heap.samples} time(s) from ${config.baseUrl}/api/metrics`,
    );
    if (!heap.available) {
      heapDetail.push(
        `unavailable — ${heap.lastError ?? "no samples matched"}`,
      );
    } else {
      for (const [name, value] of Object.entries(heap.peak)) {
        heapDetail.push(`peak ${name} ${(value / 1024 / 1024).toFixed(1)}MB`);
      }
    }
    if (!heap.available) {
      assert(
        "Heap below the --max-old-space-size ceiling",
        "SKIP",
        `${heapDetail.join("\n")}\nPhase 4's /api/metrics is the only place the server's heap is visible.`,
      );
    } else if (config.maxOldSpaceMb === null) {
      assert(
        "Heap below the --max-old-space-size ceiling",
        "SKIP",
        `${heapDetail.join("\n")}\nLOAD_MAX_OLD_SPACE_MB is not set, so there is no ceiling to compare against. Set it to the value the server is started with (deploy/erpsys.service ExecStart) — it is an estimate until Phase 3 records real numbers.`,
      );
    } else {
      const worstHeap = Math.max(
        0,
        ...Object.values(heap.peak).map((v) => v / 1024 / 1024),
      );
      if (worstHeap < config.maxOldSpaceMb) {
        assert(
          "Heap below the --max-old-space-size ceiling",
          "PASS",
          `${heapDetail.join("\n")}\npeak ${worstHeap.toFixed(1)}MB < ${config.maxOldSpaceMb}MB ceiling`,
        );
      } else {
        assert(
          "Heap below the --max-old-space-size ceiling",
          "FAIL",
          `${heapDetail.join("\n")}\npeak ${worstHeap.toFixed(1)}MB >= ${config.maxOldSpaceMb}MB ceiling`,
        );
      }
    }

    printAssertions();

    const failed = assertions.filter((a) => a.status === "FAIL");
    const skipped = assertions.filter((a) => a.status === "SKIP");
    hr("Result");
    out(
      `${assertions.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`,
    );
    exitCode = failed.length > 0 ? 1 : 0;
  } finally {
    sampler.stop();
    if (seeded) {
      hr("Teardown");
      if (config.teardown) {
        const removed = await teardown(db, seeded);
        for (const [collection, count] of Object.entries(removed)) {
          if (count) out(`removed ${count} ${collection}`);
        }
        out(`seeded run tag ${seeded.runTag} cleaned up`);
      } else {
        out(
          `LOAD_TEARDOWN=0 — leaving run tag ${seeded.runTag} in the database.`,
        );
        out(
          `Remove it with: db.collection("user").deleteMany({ email: /loadtest-${seeded.runTag}-/ })`,
        );
      }
    }
    await client.close().catch(() => {});
  }

  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof ConfigError) {
      reportPrerequisites(error.problems);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`\ntest:load failed: ${error?.message ?? error}\n`);
    process.stderr.write("  Run with LOAD_DEBUG=1 for a stack trace.\n");
    if (process.env.LOAD_DEBUG) process.stderr.write(`${error?.stack}\n`);
    process.exitCode = 1;
  });
