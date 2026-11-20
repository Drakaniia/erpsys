import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { seed, teardown, sessionCookieHeader } from "./seed.mjs";

const config = loadConfig();
const client = new MongoClient(config.databaseUrl);
const db = client.db();
let fixtures;
let server;
let adminId;
try {
  const occupied = await fetch(config.baseUrl + "/api/health").then(() => true, () => false);
  if (occupied) throw new Error("Measurement port is occupied; choose a free LOAD_BASE_URL port.");
  fixtures = await seed(db, config);
  const now = new Date();
  adminId = `perf-admin-${randomUUID()}`;
  const token = randomUUID();
  await db.collection("user").insertOne({ _id: adminId, name: "Synthetic Performance Admin", email: `${adminId}@buksu.edu.ph`, emailVerified: true, role: "ADMIN", createdAt: now, updatedAt: now });
  await db.collection("session").insertOne({ _id: `perf-session-${randomUUID()}`, token, userId: adminId, expiresAt: new Date(Date.now() + 3_600_000), createdAt: now, updatedAt: now });
  const adminCookie = sessionCookieHeader(token, config.authSecret);
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL("../apps/server/", import.meta.url)),
    env: { ...process.env, PORT: new URL(config.baseUrl).port, R2_UPLOADS_ENABLED: "false", CLOUDFLARE_CHAT_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (data) => process.stderr.write(data));
  server.stderr.on("data", (data) => process.stderr.write(data));
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    try {
      const health = await fetch(config.baseUrl + "/api/health");
      if (health.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error("Isolated measurement server did not start");
  const measurements = [];
  const endpoints = [
    ["student", "/api/v1/me/student", fixtures.probe.cookie],
    ["departments", "/api/v1/me/departments", fixtures.probe.cookie],
    ["queue", "/api/v1/me/queue", fixtures.probe.cookie],
    ["launch", "/api/v1/me/launch", adminCookie],
    ["overview", "/api/v1/me/overview", adminCookie],
  ];
  for (const [name, path, cookie] of endpoints) {
    const samples = [];
    const statuses = {};
    let bytes = 0;
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      const response = await fetch(config.baseUrl + path, { headers: { cookie } });
      const text = await response.text();
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      samples.push(performance.now() - start);
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      bytes = Buffer.byteLength(text);
    }
    samples.sort((a, b) => a - b);
    measurements.push({ name, samples: samples.length, p50: samples[9], p95: samples[18], max: samples[19], statuses, bytes });
  }
  const year = fixtures.year._id;
  const dept = fixtures.department._id;
  const shapes = [
    ["enrollment-year", "student_enrollment", { academicYearId: year }],
    ["enrollment-department", "student_enrollment", { academicYearId: year, departmentId: dept }],
    ["verification-status", "step_verification", { academicYearId: year, status: "VERIFIED" }],
    ["verification-recent", "step_verification", { academicYearId: year, status: "VERIFIED" }, { verifiedAt: -1 }],
  ];
  const explains = [];
  for (const [name, collection, filter, sort] of shapes) {
    let cursor = db.collection(collection).find(filter);
    if (sort) cursor = cursor.sort(sort).limit(8);
    const result = await cursor.explain("executionStats");
    explains.push({ name, docsExamined: result.executionStats.totalDocsExamined, keysExamined: result.executionStats.totalKeysExamined, returned: result.executionStats.nReturned, ms: result.executionStats.executionTimeMillis, plan: result.queryPlanner.winningPlan });
  }
  console.log(JSON.stringify({ students: config.students, measurements, explains }, null, 2));
} finally {
  server?.kill();
  if (adminId) {
    await db.collection("session").deleteMany({ userId: adminId });
    await db.collection("user").deleteOne({ _id: adminId });
  }
  if (fixtures) console.log("teardown", await teardown(db, fixtures));
  await client.close();
}
