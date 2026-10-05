import type { RequestHandler } from "express";
import { getDb } from "../db/db.js";

const READY_PING_TIMEOUT_MS = 2000;
const READY_RETRY_AFTER_SECONDS = 5;

let ready = true;

export function isReady(): boolean {
  return ready;
}

export function markNotReady(): void {
  ready = false;
}

export function markReady(): void {
  ready = true;
}

export function resetReadinessForTest(): void {
  ready = true;
}

function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

type DbReadyOptions = {
  timeoutMs?: number;
  ping?: () => Promise<unknown>;
};

async function defaultPing(): Promise<unknown> {
  const database = await getDb();
  return database.command({ ping: 1 });
}

export async function checkDbReady(
  options: DbReadyOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? READY_PING_TIMEOUT_MS;
  const ping = options.ping ?? defaultPing;
  try {
    await withTimeout(
      Promise.resolve(ping()),
      timeoutMs,
      "readiness ping timed out",
    );
    return true;
  } catch {
    return false;
  }
}

export const readinessHandler: RequestHandler = async (_req, res) => {
  if (!isReady()) {
    res.setHeader("Retry-After", String(READY_RETRY_AFTER_SECONDS));
    res.status(503).json({ ok: false, ready: false, reason: "draining" });
    return;
  }

  const dbOk = await checkDbReady();
  if (!dbOk) {
    res.setHeader("Retry-After", String(READY_RETRY_AFTER_SECONDS));
    res.status(503).json({ ok: false, ready: false, reason: "database" });
    return;
  }

  res.status(200).json({ ok: true, ready: true });
};
