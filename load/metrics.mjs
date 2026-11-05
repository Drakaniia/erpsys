/**
 * Heap sampling from the server's `/api/metrics` endpoint (Phase 4).
 *
 * The assertion is "heap stays below the `--max-old-space-size` ceiling", and
 * the ceiling is a property of how the *server* was started — this process
 * cannot see it. So the number is read from the server and the ceiling is
 * supplied as `LOAD_MAX_OLD_SPACE_MB`.
 *
 * Both halves are deliberately allowed to be absent. `lib/metrics.ts` may not
 * exist yet, the endpoint may be loopback-only, and the ceiling is an estimate
 * until Phase 3 records real numbers. When anything is missing the run reports
 * the measured peak and marks the assertion SKIPPED — inventing a ceiling would
 * be a guess dressed up as a threshold.
 *
 * Metric names are matched loosely because they are owned by `lib/metrics.ts`:
 * any sample whose name looks like Node heap or RSS usage is tracked, and the
 * full name list is printed so a mismatch is diagnosable.
 */

const HEAP_METRIC = /(?:^|_)heap_?(?:used|total)|nodejs_?heap|resident|rss/i;

function parsePrometheus(text) {
  const samples = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match =
      /^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(-?[0-9.eE+]+|NaN)(?:\s+.*)?$/.exec(
        trimmed,
      );
    if (!match) continue;
    const value = Number(match[2]);
    if (Number.isFinite(value)) samples.push({ name: match[1], value });
  }
  return samples;
}

export function startHeapSampler(config) {
  const peak = new Map();
  const seenNames = new Set();
  let available = null;
  let samples = 0;
  let lastError = null;

  const url = `${config.baseUrl}/api/metrics`;
  const headers = {};
  if (config.metricsToken)
    headers.authorization = `Bearer ${config.metricsToken}`;

  async function scrape() {
    let response;
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      lastError = `could not reach ${url}: ${error.message}`;
      return;
    }
    if (response.status === 404 || response.status === 403) {
      available = false;
      lastError = `${url} returned ${response.status} — the metrics endpoint is absent or gated by a token`;
      return;
    }
    if (!response.ok) {
      lastError = `${url} returned ${response.status}`;
      return;
    }
    const text = await response.text();
    const parsed = parsePrometheus(text);
    if (parsed.length === 0) {
      lastError = `${url} returned no parsable Prometheus samples`;
      return;
    }
    available = true;
    samples += 1;
    for (const { name, value } of parsed) {
      seenNames.add(name);
      if (!HEAP_METRIC.test(name)) continue;
      peak.set(name, Math.max(peak.get(name) ?? 0, value));
    }
  }

  const timer = setInterval(() => {
    void scrape();
  }, config.metricsIntervalS * 1000);
  timer.unref?.();

  return {
    async sampleNow() {
      await scrape();
    },
    stop() {
      clearInterval(timer);
    },
    report() {
      return {
        available: available === true,
        samples,
        metricNames: [...seenNames].sort(),
        peak: Object.fromEntries(peak),
        lastError,
      };
    },
  };
}
