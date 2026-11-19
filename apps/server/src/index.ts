import { closeDb, getDb } from "./lib/db/db.js";
import { ensureIndexes } from "./lib/db/indexes.js";
import { startSweeps } from "./lib/db/sweeps.js";
import {
  loadCredentialOverrides,
  snapshotAppliedFingerprints,
} from "./lib/platform/credentials.js";
import { applyEnvOverrides, assertProductionEnv, env } from "./lib/platform/env.js";
import { sweepCalendars } from "./services/calendar.js";

process.on("unhandledRejection", (error) =>
  console.error("[server] unhandled rejection", error),
);

try {
  await (await getDb()).command({ ping: 1 });
  await ensureIndexes();
  const overrides = await loadCredentialOverrides();
  applyEnvOverrides(overrides.values);
  snapshotAppliedFingerprints(overrides.fingerprints);
} catch (error) {
  console.error("[server] boot failed", error);
  process.exit(1);
}

assertProductionEnv();

const { buildApp } = await import("./app.js");
const app = buildApp();

const server = app.listen(env.PORT, () => {
  console.log(`[server] listening on :${env.PORT}`);
  startSweeps();
  startSweeps(sweepCalendars, "calendar-sweep");
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () =>
    server.close(() => void closeDb().then(() => process.exit(0))),
  );
}

export default app;
