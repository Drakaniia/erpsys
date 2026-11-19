import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../src/lib/db/db.js";
import { ensureIndexes } from "../src/lib/db/indexes.js";
import { sweep } from "../src/lib/db/sweeps.js";
import { loadCredentialOverrides, snapshotAppliedFingerprints } from "../src/lib/platform/credentials.js";
import { applyEnvOverrides, assertProductionEnv } from "../src/lib/platform/env.js";
import { configureServerless, runMaintenance } from "../src/lib/platform/serverless.js";

let application: Promise<ReturnType<typeof import("../src/app.js").buildApp>> | undefined;

function app() {
  application ??= (async () => {
    const db = await getDb();
    await db.command({ ping: 1 });
    await ensureIndexes();
    const overrides = await loadCredentialOverrides();
    applyEnvOverrides(overrides.values);
    snapshotAppliedFingerprints(overrides.fingerprints);
    assertProductionEnv();
    await configureServerless(db);
    const { buildApp } = await import("../src/app.js");
    return buildApp();
  })().catch((error) => { application = undefined; throw error; });
  return application;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const expected = process.env.API_PROXY_SECRET;
  const received = req.headers["x-erpsys-proxy-secret"];
  if (!expected || typeof received !== "string" || Buffer.byteLength(expected) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Use the public ERPSYS origin." }));
    return;
  }
  try {
    const express = await app();
    if (req.url?.split("?")[0] === "/api/internal/maintenance") {
      if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
      const { sweepCalendars } = await import("../src/services/calendar.js");
      const ran = await runMaintenance(await getDb(), async () => { await sweep(); await sweepCalendars(); });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, ran }));
      return;
    }
    const ip = req.headers["x-erpsys-client-ip"];
    if (typeof ip === "string") req.headers["x-forwarded-for"] = ip;
    req.headers["x-forwarded-proto"] = "https";
    req.headers["x-forwarded-host"] = "erpsys.pages.dev";
    express(req, res);
  } catch (error) {
    console.error("[serverless] request failed", error instanceof Error ? error.message : "unknown");
    if (!res.headersSent) res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "The service is temporarily unavailable." }));
  }
}
