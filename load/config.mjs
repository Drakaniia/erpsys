/**
 * Environment parsing for the load gate.
 *
 * Every failure mode here is reported as an instruction, not a stack trace:
 * the gate needs a running server, a reachable database, and a signing secret
 * that matches the one the server booted with. A stack trace from a Mongo
 * timeout tells an operator nothing they can act on.
 */

const NUMERIC = new Set([
  "LOAD_STUDENTS",
  "LOAD_CONNECTIONS",
  "LOAD_DURATION_S",
  "LOAD_SEED_BATCH",
  "LOAD_METRICS_INTERVAL_S",
]);

const BOOLEAN = new Set([
  "LOAD_REQUIRE_P95_BUDGET",
  "LOAD_STRICT_5XX",
  "LOAD_TEARDOWN",
]);

export class ConfigError extends Error {
  constructor(problems) {
    super("load-test prerequisites not met");
    this.problems = problems;
  }
}

function readNumber(key, fallback) {
  const raw = (process.env[key] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ConfigError([`${key}="${raw}" is not a positive integer.`]);
  }
  return value;
}

function readBoolean(key, fallback) {
  const raw = (process.env[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new ConfigError([
    `${key}="${raw}" is not a boolean (use 1/0, true/false).`,
  ]);
}

function readOptionalNumber(key) {
  const raw = (process.env[key] ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError([`${key}="${raw}" is not a positive number.`]);
  }
  return value;
}

export const PREREQUISITES = [
  "A server must already be running and reachable at LOAD_BASE_URL (default http://127.0.0.1:3001).",
  '  Start one with "pnpm dev" or point LOAD_BASE_URL at a deployed origin.',
  "DATABASE_URL must point at a database this run may seed and tear down.",
  "BETTER_AUTH_SECRET must be the same value the server booted with, so the runner",
  "  can mint session cookies the server accepts.",
  "This scenario seeds its own students, sessions, steps and department; it does not",
  "  need a pre-seeded database, but it does need a writable one.",
  "LOAD_P95_BUDGET_MS is unset until the end of Phase 3 sets it — the run still",
  "  happens, reports the measured p95, and marks that one assertion SKIPPED.",
];

export function loadConfig() {
  const problems = [];

  const baseUrl = (process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3001")
    .trim()
    .replace(/\/+$/, "");
  try {
    new URL(baseUrl);
  } catch {
    problems.push(`LOAD_BASE_URL="${baseUrl}" is not a valid URL.`);
  }

  if (!process.env.DATABASE_URL?.trim()) {
    problems.push(
      "DATABASE_URL is not set. It must point at the same MongoDB the server uses;",
      "  the runner seeds students and session cookies directly, so it cannot use a default.",
    );
  }
  if (!process.env.BETTER_AUTH_SECRET?.trim()) {
    problems.push(
      "BETTER_AUTH_SECRET is not set. Better Auth signs the session cookie with it",
      "  (HMAC-SHA256, base64), so the runner cannot mint a session the server",
      "  accepts without it. It must match the server's value.",
    );
  }

  let numeric;
  try {
    numeric = Object.fromEntries(
      [...NUMERIC].map((k) => [k, readNumber(k, null)]),
    );
  } catch (error) {
    problems.push(
      ...(error instanceof ConfigError ? error.problems : [String(error)]),
    );
    numeric = {};
  }
  let flags;
  try {
    flags = Object.fromEntries(
      [...BOOLEAN].map((k) => [k, readBoolean(k, false)]),
    );
  } catch (error) {
    problems.push(
      ...(error instanceof ConfigError ? error.problems : [String(error)]),
    );
    flags = {};
  }

  const students = numeric.LOAD_STUDENTS ?? 500;
  let budgetMs = null;
  let ceilingMb = null;
  try {
    budgetMs = readOptionalNumber("LOAD_P95_BUDGET_MS");
    ceilingMb = readOptionalNumber("LOAD_MAX_OLD_SPACE_MB");
  } catch (error) {
    problems.push(
      ...(error instanceof ConfigError ? error.problems : [String(error)]),
    );
  }

  const scope = (process.env.LOAD_INTEGRITY_SCOPE ?? "year")
    .trim()
    .toLowerCase();
  if (!["year", "seeded"].includes(scope)) {
    problems.push(
      `LOAD_INTEGRITY_SCOPE="${scope}" must be "year" or "seeded".`,
    );
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    baseUrl,
    /** `Origin` is only sent when set; the REST surface does not gate on it. */
    origin: (process.env.LOAD_ORIGIN ?? "").trim() || null,
    students,
    connections: numeric.LOAD_CONNECTIONS ?? students,
    durationS: numeric.LOAD_DURATION_S ?? 60,
    seedBatch: numeric.LOAD_SEED_BATCH ?? 250,
    metricsIntervalS: numeric.LOAD_METRICS_INTERVAL_S ?? 5,
    databaseUrl: process.env.DATABASE_URL.trim(),
    authSecret: process.env.BETTER_AUTH_SECRET.trim(),
    p95BudgetMs: budgetMs,
    requireP95Budget: flags.LOAD_REQUIRE_P95_BUDGET,
    maxOldSpaceMb: ceilingMb,
    strict5xx: flags.LOAD_STRICT_5XX,
    teardown:
      process.env.LOAD_TEARDOWN === undefined ? true : flags.LOAD_TEARDOWN,
    integrityScope: scope,
    metricsToken: (
      process.env.LOAD_METRICS_TOKEN ??
      process.env.METRICS_TOKEN ??
      ""
    ).trim(),
  };
}

export function printHelp() {
  process.stdout.write(
    [
      "pnpm test:load — ERPSYS enrollment-day load gate",
      "",
      "Requires a RUNNING SERVER and a WRITABLE DATABASE. It seeds its own",
      "students, sessions, steps and a department, runs the scenario, asserts,",
      "then tears down what it seeded.",
      "",
      "Usage:",
      "  pnpm test:load                 run the gate",
      "  pnpm test:load -- --help       this text",
      "",
      "Environment:",
      "  LOAD_BASE_URL            server origin                    (default http://127.0.0.1:3001)",
      "  LOAD_ORIGIN              Origin header to send             (default: omitted; optional)",
      "  LOAD_STUDENTS            distinct seeded students         (default 500)",
      "  LOAD_CONNECTIONS         connections per sustained read   (default = LOAD_STUDENTS)",
      "  LOAD_DURATION_S          seconds the reads sustain         (default 60)",
      "  LOAD_P95_BUDGET_MS       p95 budget in ms. UNSET until Phase 3 records it;",
      "                           when unset the measured p95 is printed prominently",
      "                           and the assertion is SKIPPED, not faked.",
      "  LOAD_REQUIRE_P95_BUDGET  1 turns the unset budget into a hard failure",
      "  LOAD_MAX_OLD_SPACE_MB    the --max-old-space-size ceiling the server runs with",
      "  LOAD_STRICT_5XX         1 counts handled 503 backpressure as a 5xx failure too",
      "  LOAD_INTEGRITY_SCOPE     'year' (default) or 'seeded' — how wide the two",
      "                           Mongo invariant checks look",
      "  LOAD_METRICS_INTERVAL_S  /api/metrics scrape interval      (default 5)",
      "  LOAD_METRICS_TOKEN       bearer for /api/metrics          (default: $METRICS_TOKEN)",
      "  LOAD_TEARDOWN            1 (default) removes seeded rows afterwards, 0 keeps them",
      "  LOAD_SEED_BATCH          insertMany batch size            (default 250)",
      "  DATABASE_URL             Mongo to seed and assert against (required)",
      "  BETTER_AUTH_SECRET       must match the server's          (required)",
      "",
    ].join("\n"),
  );
}
