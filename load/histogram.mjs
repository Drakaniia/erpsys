/**
 * A fixed-bucket latency histogram, in whole milliseconds.
 *
 * autocannon reports p50/p75/p90/p97.5/p99 but not p95, and the spec's gate is
 * written against p95 — so the scenario records every response time itself from
 * autocannon's `response` event rather than approximating p95 from a nearby
 * percentile. Buckets are O(1) to update and O(1) in memory, which matters when
 * three procedures are running 500 connections each for a minute.
 */

/** Anything slower than this is a broken run, not a latency to be precise about. */
const TRACKED_MS = 300_000;

export class LatencyHistogram {
  constructor() {
    this.buckets = new Uint32Array(TRACKED_MS + 1);
    this.overflowCount = 0;
    this.count = 0;
    this.sum = 0;
    this.max = 0;
  }

  record(ms) {
    const value = Math.max(0, Math.round(ms));
    this.count += 1;
    this.sum += value;
    if (value > this.max) this.max = value;
    if (value > TRACKED_MS) {
      this.overflowCount += 1;
      return;
    }
    this.buckets[value] += 1;
  }

  percentile(p) {
    if (this.count === 0) return null;
    const target = p * this.count;
    let seen = 0;
    for (let ms = 0; ms <= TRACKED_MS; ms += 1) {
      seen += this.buckets[ms];
      if (seen >= target) {
        return this.overflowCount > 0 && seen === this.count
          ? Math.max(ms, this.max)
          : ms;
      }
    }
    return this.max;
  }

  summary() {
    return {
      count: this.count,
      mean: this.count === 0 ? null : Math.round(this.sum / this.count),
      min: this.count === 0 ? null : this._firstRecorded(),
      p50: this.percentile(0.5),
      p90: this.percentile(0.9),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
      max: this.max || null,
    };
  }

  _firstRecorded() {
    for (let ms = 0; ms <= TRACKED_MS; ms += 1) {
      if (this.buckets[ms] > 0) return ms;
    }
    return this.max;
  }
}
