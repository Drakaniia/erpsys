import type { Server } from "node:http";
import { closeDb } from "../db/db.js";
import { env } from "./env.js";
import { setFatalHandler } from "./guard.js";
import { markNotReady } from "./readiness.js";

type ShutdownReason = string;

type ShutdownOptions = {
  server: Server;
  onDrain?: () => void | Promise<void>;
  closeDb?: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  exit?: (code: number) => void;
  drainDelayMs?: number;
  graceMs?: number;
  logger?: Pick<Console, "log" | "warn" | "error">;
};

type ShutdownRunner = (reason: ShutdownReason, code?: number) => Promise<void>;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function waitForServerClose(
  server: Server,
  sleep: (ms: number) => Promise<void>,
  graceMs: number,
): Promise<void> {
  const emitter = server as unknown as {
    once?: (event: string, listener: () => void) => unknown;
    removeListener?: (event: string, listener: () => void) => unknown;
  };

  if (typeof emitter.once !== "function") return;

  let detach = (): void => {};
  const closed = new Promise<void>((resolve) => {
    const onClose = () => resolve();
    emitter.once?.("close", onClose);
    detach = () => emitter.removeListener?.("close", onClose);
  });

  try {
    await Promise.race([closed, sleep(graceMs)]);
  } finally {
    detach();
  }
}

export function createShutdownRunner(options: ShutdownOptions): ShutdownRunner {
  const {
    server,
    onDrain,
    closeDb: close = closeDb,
    sleep = defaultSleep,
    exit = (code) => process.exit(code),
    drainDelayMs = env.DRAIN_DELAY_MS,
    graceMs = env.SHUTDOWN_GRACE_MS,
    logger = console,
  } = options;

  let running: Promise<void> | null = null;

  return function shutdown(reason: ShutdownReason, code = 0): Promise<void> {
    if (running) {
      logger.warn(`[shutdown] already draining (${reason}) — ignoring`);
      return running;
    }

    running = (async () => {
      logger.log(`[shutdown] ${reason} — draining`);

      markNotReady();
      if (drainDelayMs > 0) await sleep(drainDelayMs);

      try {
        server.close();
      } catch {}

      if (onDrain) {
        try {
          await onDrain();
        } catch (error) {
          logger.warn(`[shutdown] SSE drain publish failed: ${String(error)}`);
        }
      }

      server.closeIdleConnections?.();

      await waitForServerClose(server, sleep, graceMs);
      server.closeAllConnections?.();

      try {
        await close();
      } catch (error) {
        logger.warn(`[shutdown] db close failed: ${String(error)}`);
      }

      logger.log(`[shutdown] complete, exiting ${code}`);
      exit(code);
    })();

    return running;
  };
}

type InstalledShutdown = {
  shutdown: ShutdownRunner;
  remove: () => void;
};

export function installShutdownHandlers(
  options: ShutdownOptions,
): InstalledShutdown {
  const shutdown = createShutdownRunner(options);

  const onTerm = () => {
    void shutdown("SIGTERM");
  };
  const onInt = () => {
    void shutdown("SIGINT");
  };

  process.on("SIGTERM", onTerm);
  process.on("SIGINT", onInt);
  setFatalHandler(() => shutdown("uncaughtException", 1));

  return {
    shutdown,
    remove() {
      process.removeListener("SIGTERM", onTerm);
      process.removeListener("SIGINT", onInt);
      setFatalHandler(null);
    },
  };
}
