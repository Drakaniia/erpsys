#!/usr/bin/env node
/**
 * Step-catalog bootstrap for the load gate's CI job.
 *
 * `joinQueue` refuses the join until every pre-enrollment step is `VERIFIED`, so
 * the gate cannot run against a database with an empty `step` collection. A
 * long-lived enrollment database has one; a fresh CI container does not.
 *
 * The step *codes* are owned by `apps/server/src/config/constants.ts` and are not
 * redeclared here. This script imports them from the server's own compiled
 * output, so the CI database is configured from the single source of truth
 * rather than from a second copy that can drift.
 *
 * Run it only from CI, after `pnpm --filter @erpsys/server build`:
 *
 *   node load/step-catalog.mjs
 *
 * `load/run.mjs` does not call this. A gate pointed at a database with no step
 * catalog fails there, with the reason, rather than quietly configuring the
 * database it is supposed to be measuring.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DOMAIN_MODULE = path.join(
  REPO_ROOT,
  "apps",
  "server",
  "dist",
  "config",
  "constants.js",
);

const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
if (!databaseUrl) {
  process.stderr.write("step-catalog: DATABASE_URL is not set.\n");
  process.exit(2);
}

let domain;
try {
  domain = await import(`file://${DOMAIN_MODULE.replace(/\\/g, "/")}`);
} catch (error) {
  process.stderr.write(
    [
      `step-catalog: could not load ${DOMAIN_MODULE} (${error.message}).`,
      "Build the server first:",
      "  pnpm --filter @erpsys/server build",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const { STEP_CODES, STEP_NAMES } = domain;
if (!Array.isArray(STEP_CODES) || STEP_CODES.length === 0) {
  process.stderr.write(
    "step-catalog: STEP_CODES is empty — the server build looks wrong.\n",
  );
  process.exit(2);
}

const { MongoClient } = await import("mongodb");
const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const steps = client.db().collection("step");
  let created = 0;
  for (const [order, code] of STEP_CODES.entries()) {
    const existing = await steps.findOne({ code });
    if (existing) continue;
    await steps.insertOne({
      _id: `step-${code}`,
      code,
      name: STEP_NAMES[code] ?? code,
      order: order + 1,
      description: "",
      requiresEvidence: false,
      isActive: true,
    });
    created += 1;
  }
  const total = await steps.countDocuments();
  process.stdout.write(
    `step-catalog: ${created} step(s) created, ${total} configured\n`,
  );
} finally {
  await client.close().catch(() => {});
}
