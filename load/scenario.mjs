/**
 * The load scenario: 500 distinct students against the three student REST
 * resources that the enrollment-day page actually calls.
 *
 * Tool: **autocannon**, chosen over k6 because it installs from the workspace
 * with `pnpm add -D autocannon` on Windows, macOS and Linux runners alike â€” no
 * system-level binary, no `apt-get`/`brew` step, nothing for a CI image to keep
 * in sync. k6's scenario model is the better tool, and if the load gate ever
 * needs arrival-rate shaping or per-VU scripting it should move to k6, which
 * needs the k6 binary installed.
 *
 * Why three instances rather than one: autocannon drives a single endpoint per
 * instance, and the gate needs three different endpoints running at once.
 * `setupClient` runs once per connection, which is what makes the students
 * genuinely distinct â€” each connection gets its own `Cookie` header and its own
 * `POST /queues` body, from the 500 signed sessions the seed minted.
 *
 *   - `POST /queues`          500 connections, `maxConnectionRequests: 1`. One
 *                             simultaneous insert per student: the unique-index
 *                             race the gate exists to prove.
 *   - `GET /departments/mine` `LOAD_CONNECTIONS` sustained. The read that used
 *                             to fetch every WAITING row in the institution.
 *   - `GET /queues/mine`      `LOAD_CONNECTIONS` sustained.
 *
 * Latency is recorded from autocannon's per-response `response` event rather
 * than from its summary, because autocannon reports p90/p97.5 but not p95 and
 * the budget is written against p95.
 */

import { LatencyHistogram } from "./histogram.mjs";
import { decodeResponse, encodeInput } from "./wire.mjs";

export async function loadAutocannon() {
  try {
    const mod = await import("autocannon");
    return mod.default ?? mod;
  } catch (error) {
    throw new Error(
      [
        "autocannon could not be loaded, so the load gate cannot run.",
        "It is a devDependency of the workspace root:",
        "  pnpm install",
        "",
        `Underlying error: ${error.message}`,
      ].join("\n"),
    );
  }
}

function headersFor(config, cookie) {
  const headers = { cookie };
  // The REST surface is same-origin by design and emits no CORS headers, but it
  // does not reject a request by Origin, so LOAD_ORIGIN is informational: set it
  // to mimic a browser, or leave it unset for a local run.
  if (config.origin) headers.origin = config.origin;
  return headers;
}

/**
 * One autocannon run against one procedure path. `cookies` is dealt out one per
 * connection, cycling, so `LOAD_CONNECTIONS` sockets reuse a pool of distinct
 * students the same way a real page load does.
 */
function startProcedure({
  autocannon,
  config,
  name,
  method,
  path,
  input,
  cookies,
  connections,
  duration,
  maxConnectionRequests,
  inspectBodies,
}) {
  const histogram = new LatencyHistogram();
  const statusCounts = new Map();
  const sampleMessages = new Map();
  // A GET resource carries no body; only the write sends one.
  const body = input === undefined ? null : encodeInput(input);
  let next = 0;

  const requests = inspectBodies
    ? [
        {
          onResponse(status, responseBody) {
            if (sampleMessages.has(status)) return;
            const decoded = decodeResponse(status, String(responseBody ?? ""));
            if (!decoded.ok) {
              sampleMessages.set(
                status,
                decoded.malformed
                  ? "malformed response body"
                  : `${decoded.code}: ${decoded.message}`,
              );
            }
          },
        },
      ]
    : undefined;

  const instance = autocannon({
    title: name,
    url: `${config.baseUrl}${path}`,
    method,
    connections,
    pipelining: 1,
    duration,
    maxConnectionRequests,
    // autocannon only records latency for 2xx unless `excludeErrorStats` is
    // false, which is the default. Keep it false: a 409 or a 503 is part of the
    // cost the gate is measuring.
    excludeErrorStats: false,
    timeout: 30,
    // Workers would aggregate in a child process and the per-response `response`
    // event â€” the only source of an exact p95 â€” would not reach this process.
    workers: 0,
    requests,
    headers: { "content-type": "application/json", accept: "application/json" },
    setupClient(client) {
      const cookie = cookies[next % cookies.length];
      next += 1;
      // Per-connection headers are merged over the static ones by autocannon's
      // request builder, so content-type/accept survive this. A GET has no body,
      // and autocannon would otherwise send one.
      if (body === null) client.setHeaders(headersFor(config, cookie));
      else client.setHeadersAndBody(headersFor(config, cookie), body);
    },
  });

  instance.on("response", (_client, statusCode, _bytes, responseTime) => {
    histogram.record(responseTime);
    statusCounts.set(statusCode, (statusCounts.get(statusCode) ?? 0) + 1);
  });

  return new Promise((resolve, reject) => {
    instance.once("error", reject);
    instance.once("done", (result) =>
      resolve({
        name,
        connections,
        requests: result.requests?.average ?? 0,
        duration: result.duration,
        completed: result.requests?.total,
        errors: result.errors,
        timeouts: result.timeouts,
        non2xx: result.non2xx,
        statusCounts: Object.fromEntries(
          [...statusCounts].sort((a, b) => a[0] - b[0]),
        ),
        sampleMessages: Object.fromEntries(sampleMessages),
        latency: histogram.summary(),
      }),
    );
  });
}

/**
 * Launch all three procedures concurrently and resolve once every one is done.
 * `joinQueue` self-terminates (`maxConnectionRequests: 1`), so the gate waits on
 * the two sustained reads for the full `LOAD_DURATION_S`.
 */
export function runScenario({ config, students, departmentId }) {
  const cookies = students.map((s) => s.cookie);
  const shared = { autocannon: null, config, cookies };

  return (async () => {
    shared.autocannon = await loadAutocannon();
    return Promise.all([
      startProcedure({
        ...shared,
        name: "POST /queues",
        method: "POST",
        path: "/queues",
        input: { departmentId },
        connections: cookies.length,
        duration: config.durationS,
        maxConnectionRequests: 1,
        inspectBodies: true,
      }),
      startProcedure({
        ...shared,
        name: "GET /departments/mine",
        method: "GET",
        path: "/departments/mine",
        connections: config.connections,
        duration: config.durationS,
      }),
      startProcedure({
        ...shared,
        name: "GET /queues/mine",
        method: "GET",
        path: "/queues/mine",
        connections: config.connections,
        duration: config.durationS,
      }),
    ]);
  })();
}
