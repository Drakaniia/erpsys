import { installProcessGuards } from "./lib/platform/guard.js";

installProcessGuards();

import { getDb } from "./lib/db/db.js";
import {
  applyEnvOverrides,
  assertProductionEnv,
  assertPublicOrigin,
  env,
} from "./lib/platform/env.js";
import { ensureIndexes } from "./lib/db/indexes.js";
import {
  loadCredentialOverrides,
  snapshotAppliedFingerprints,
} from "./lib/platform/env-overrides.js";
import { startSweeps } from "./lib/db/sweeps.js";
import { startStorageSweeps } from "./lib/storage/sweep.js";
import { startCalendarSweeps } from "./services/calendar/CalendarSweepService.js";
import { publishToAll } from "./lib/platform/sse.js";
import { installShutdownHandlers } from "./lib/platform/shutdown.js";

try {
  await (await getDb()).command({ ping: 1 });
  await ensureIndexes();

  const overrides = await loadCredentialOverrides();
  applyEnvOverrides(overrides.values);
  snapshotAppliedFingerprints(overrides.fingerprints);

  console.log("[server] database reachable, indexes ensured");
} catch (error) {
  console.error("[server] boot failed — refusing to accept traffic", error);
  process.exit(1);
}

const { buildApp } = await import("./app.js");
const app = buildApp();

assertPublicOrigin();
assertProductionEnv();

const server = app.listen(env.PORT, () => {
  console.log(`[server] listening on :${env.PORT}`);

  startSweeps();
  startStorageSweeps();
  startCalendarSweeps();
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 120_000;
server.maxConnections = 2048;

installShutdownHandlers({
  server,
  onDrain: () => publishToAll("reconnect"),
});

export default app;
