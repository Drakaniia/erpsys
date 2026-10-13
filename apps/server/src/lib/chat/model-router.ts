export const DEMOTE_AFTER = 2;
export const DEMOTE_LOOKBACK_MS = 60_000;
export const DEMOTE_COOLDOWN_MS = 5 * 60_000;
export const MAX_PACE_WAIT_MS = 20_000;
export const DEFAULT_CHAT_RPM = 30;

export type ModelOutcome = "ok" | "unavailable" | "rejected";

const modelFailures = new Map<string, number[]>();
const demotedUntil = new Map<string, number>();

export function resetModelHealth(): void {
  modelFailures.clear();
  demotedUntil.clear();
}

export function reportModelOutcome(
  model: string,
  outcome: ModelOutcome,
  now: number = Date.now(),
): void {
  if (outcome === "ok") {
    modelFailures.delete(model);
    return;
  }
  if (outcome !== "unavailable") return;

  const recent = (modelFailures.get(model) ?? []).filter(
    (t) => now - t < DEMOTE_LOOKBACK_MS,
  );
  recent.push(now);
  modelFailures.set(model, recent);

  if (recent.length >= DEMOTE_AFTER) {
    demotedUntil.set(model, now + DEMOTE_COOLDOWN_MS);
    modelFailures.delete(model);
  }
}

export function isModelDemoted(
  model: string,
  now: number = Date.now(),
): boolean {
  return (demotedUntil.get(model) ?? 0) > now;
}

export function orderModels(
  models: readonly string[],
  now: number = Date.now(),
): string[] {
  const healthy: string[] = [];
  const cooling: string[] = [];
  for (const model of models) {
    (isModelDemoted(model, now) ? cooling : healthy).push(model);
  }
  return [...healthy, ...cooling];
}

let rpm = DEFAULT_CHAT_RPM;
let capacity = rpm;
let tokens = capacity;
let refillPerMs = rpm / 60_000;
let lastRefillMs = 0;
let pauseUntilMs = 0;

export function configurePacer(
  rpmValue: number,
  now: number = Date.now(),
): void {
  rpm = Math.max(1, Math.floor(rpmValue));
  capacity = rpm;
  tokens = capacity;
  refillPerMs = rpm / 60_000;
  lastRefillMs = now;
  pauseUntilMs = 0;
}

export function resetPacer(now: number = Date.now()): void {
  configurePacer(DEFAULT_CHAT_RPM, now);
}

export function pauseProviderUntil(timestampMs: number): void {
  pauseUntilMs = Math.max(pauseUntilMs, timestampMs);
}

export function pacingWaitMs(now: number): number {
  if (pauseUntilMs > now) return pauseUntilMs - now;

  if (lastRefillMs === 0) lastRefillMs = now;
  if (now > lastRefillMs) {
    tokens = Math.min(capacity, tokens + (now - lastRefillMs) * refillPerMs);
    lastRefillMs = now;
  }

  if (tokens >= 1) {
    tokens -= 1;
    return 0;
  }
  return Math.ceil((1 - tokens) / refillPerMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireProviderSlot(
  maxWaitMs: number = MAX_PACE_WAIT_MS,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    const wait = pacingWaitMs(Date.now());
    if (wait === 0) return;
    const remaining = maxWaitMs - (Date.now() - started);
    if (remaining <= 0) return;
    await sleep(Math.min(wait, 250, remaining));
  }
}

export function parseRetryAfterSeconds(
  value: string | null,
  now: number = Date.now(),
): number | null {
  if (!value) return null;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds)) return Math.max(0, Math.floor(asSeconds));
  const asDate = new Date(value).getTime();
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, Math.ceil((asDate - now) / 1000));
}
