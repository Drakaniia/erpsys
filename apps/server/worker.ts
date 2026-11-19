import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { httpServerHandler } from "cloudflare:node";

import { closeDb, getDb, getDbSync, withRequestDb } from "./src/lib/db/db.js";
import { ensureIndexes } from "./src/lib/db/indexes.js";
import { sweep } from "./src/lib/db/sweeps.js";
import { drainBackgroundTasks, withBackgroundTasks } from "./src/lib/platform/background.js";
import { loadCredentialOverrides, snapshotAppliedFingerprints } from "./src/lib/platform/credentials.js";
import { applyEnvOverrides, assertProductionEnv } from "./src/lib/platform/env.js";
import { configureServerless, runMaintenance } from "./src/lib/platform/serverless.js";


let initialized = false;
let app: ReturnType<typeof import("./src/app.js").buildApp> | undefined;

async function initialize(): Promise<void> {
  if (initialized) return;
  await ensureIndexes();
  const overrides = await loadCredentialOverrides();
  applyEnvOverrides(overrides.values);
  snapshotAppliedFingerprints(overrides.fingerprints);
  assertProductionEnv();
  await configureServerless(getDbSync());
  const { buildApp } = await import("./src/app.js");
  app = buildApp();
  initialized = true;
}

const server = createServer((req, res) => {
  req.headers["x-forwarded-proto"] = "https";
  req.headers["x-forwarded-host"] = "erpsys.pages.dev";
  const ip = req.headers["x-erpsys-client-ip"];
  if (typeof ip === "string") req.headers["x-forwarded-for"] = ip;
  app!(req, res);
});
server.listen(3001);
const handler = httpServerHandler({ port: 3001 });

function authorized(request: Request): boolean {
  const expected = process.env.API_PROXY_SECRET;
  const received = request.headers.get("x-erpsys-proxy-secret");
  return Boolean(expected && received && Buffer.byteLength(expected) === Buffer.byteLength(received) && timingSafeEqual(Buffer.from(expected), Buffer.from(received)));
}

export default {
  async fetch(request, _env, ctx) {
    if (!authorized(request)) return Response.json({ error: "Use the public ERPSYS origin." }, { status: 403 });
    if (new URL(request.url).pathname.startsWith("/api/internal/")) return new Response("Not found", { status: 404 });
    const pending = new Set<Promise<unknown>>();
    return withRequestDb(() => withBackgroundTasks(pending, async () => {
      try {
        await getDb();
        await initialize();
        if (new URL(request.url).pathname === "/api/health") {
          await getDbSync().command({ ping: 1 });
          await closeDb();
          return Response.json({ ok: true, runtime: "cloudflare-workers" }, { headers: { "cache-control": "no-store" } });
        }
        const response = await handler.fetch!(request, _env, ctx);
        const cleanup = async () => { await drainBackgroundTasks(pending); await closeDb(); };
        if (!response.body) {
          ctx.waitUntil(cleanup());
          return response;
        }
        const { readable, writable } = new TransformStream();
        ctx.waitUntil(response.body.pipeTo(writable).catch(() => {}).finally(cleanup));
        return new Response(readable, response);
      } catch (error) {
        console.error(JSON.stringify({ event: "worker_request_failed", message: error instanceof Error ? error.message : "unknown" }));
        await drainBackgroundTasks(pending);
        await closeDb();
        return Response.json({ error: "The service is temporarily unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
      }
    }));
  },
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(withRequestDb(async () => {
      try {
        await getDb();
        await initialize();
        const { sweepCalendars } = await import("./src/services/calendar.js");
        const ran = await runMaintenance(getDbSync(), async () => { await sweep(); await sweepCalendars(); });
        console.log(JSON.stringify({ event: "worker_maintenance", ran }));
      } finally {
        await closeDb();
      }
    }));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
