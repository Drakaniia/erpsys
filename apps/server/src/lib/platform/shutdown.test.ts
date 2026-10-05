import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { createShutdownRunner, installShutdownHandlers } from "./shutdown.js";
import { isReady, resetReadinessForTest } from "./readiness.js";
import { setFatalHandler } from "./guard.js";

/**
 * The order of the shutdown sequence is the entire correctness claim: closing
 * sockets before advertising not-ready produces a burst of 502s on every
 * deploy, and no amount of manual testing catches that reliably under load.
 * So the sequence is driven with an injected clock, injected exit, and a
 * recorded step list.
 */

afterEach(() => {
  resetReadinessForTest();
  setFatalHandler(null);
});

/**
 * A hand-rolled stand-in for `http.Server`, in the same spirit as the fake `Db`
 * in `services/student.test.ts`: only the four methods the sequence touches,
 * recording the order they were called in.
 */
function fakeServer(options: { autoClose?: boolean } = {}) {
  const steps: string[] = [];
  const emitter = new EventEmitter() as EventEmitter & {
    listening: boolean;
    close: (cb?: () => void) => unknown;
    closeIdleConnections: () => void;
    closeAllConnections: () => void;
  };

  emitter.listening = true;
  // Node's `close(cb)` only calls back once every connection is gone, and the
  // sequence deliberately does not wait for that — so the fake does not call
  // the callback at all unless it is modelling a full close.
  emitter.close = ((cb?: () => void) => {
    steps.push("server.close");
    emitter.listening = false;
    if (options.autoClose) {
      setTimeout(() => {
        emitter.emit("close");
        cb?.();
      }, 0);
    }
    return emitter;
  }) as (cb?: () => void) => unknown;
  emitter.closeIdleConnections = () => {
    steps.push("closeIdleConnections");
    // A real server emits `close` once the last socket is gone — the signal
    // the grace period is racing against.
    if (options.autoClose) setTimeout(() => emitter.emit("close"), 0);
  };
  emitter.closeAllConnections = () => steps.push("closeAllConnections");

  return { steps, server: emitter as unknown as Server };
}

function harness(
  overrides: Partial<Parameters<typeof createShutdownRunner>[0]> = {},
) {
  const { steps, server } = fakeServer();
  const exit = vi.fn();
  const closeDb = vi.fn(async () => {
    steps.push("closeDb");
  });

  const runner = createShutdownRunner({
    server,
    closeDb,
    exit,
    sleep: async (ms) => {
      steps.push(`sleep:${ms}`);
    },
    drainDelayMs: 2000,
    graceMs: 10000,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  });

  return { steps, server, exit, closeDb, runner };
}

describe("createShutdownRunner", () => {
  it("runs the steps in the spec's order", async () => {
    const { steps, runner } = harness({
      onDrain: () => {
        steps.push("onDrain");
      },
    });

    await runner("SIGTERM");

    expect(steps).toEqual([
      "sleep:2000",
      "server.close",
      "onDrain",
      "closeIdleConnections",
      "sleep:10000",
      "closeAllConnections",
      "closeDb",
    ]);
  });

  it("flips readiness to not-ready before the drain delay", async () => {
    const order: string[] = [];
    const { runner } = harness({
      sleep: async () => {
        order.push(`ready=${isReady()}`);
      },
      drainDelayMs: 2000,
    });

    expect(isReady()).toBe(true);
    await runner("SIGTERM");
    expect(order[0]).toBe("ready=false");
  });

  it("exits 0 on a signal", async () => {
    const { exit, runner } = harness();
    await runner("SIGTERM");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits with the caller's code when one is given", async () => {
    const { exit, runner } = harness();
    await runner("uncaughtException", 1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("runs the sequence once, however many signals arrive", async () => {
    const { steps, runner, exit } = harness({
      onDrain: () => {
        steps.push("onDrain");
      },
    });

    await Promise.all([runner("SIGTERM"), runner("SIGTERM"), runner("SIGINT")]);

    expect(steps.filter((step) => step === "server.close")).toHaveLength(1);
    expect(steps.filter((step) => step === "onDrain")).toHaveLength(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("returns the in-flight promise for a second signal, not a new run", async () => {
    const { runner } = harness();
    const first = runner("SIGTERM");
    const second = runner("SIGTERM");
    expect(second).toBe(first);
    await first;
  });

  it("skips the grace wait when the server closes on its own", async () => {
    // This one needs a real timer: the skip is proven by the server's own
    // `close` winning the race against the grace period, which an instant
    // injected sleep would always lose.
    const { steps, server } = fakeServer({ autoClose: true });
    const exit = vi.fn();
    const runner = createShutdownRunner({
      server,
      exit,
      closeDb: async () => {
        steps.push("closeDb");
      },
      sleep: (ms) => {
        // Recorded on *resolve*, not on call: the point of this test is
        // whether the grace period is actually waited out, and a call that
        // loses the race still happened.
        return new Promise((resolve) =>
          setTimeout(() => {
            steps.push(`sleep:${ms}`);
            resolve();
          }, ms),
        );
      },
      drainDelayMs: 0,
      graceMs: 300,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await runner("SIGTERM");

    expect(steps).not.toContain("sleep:300");
    expect(steps).toContain("closeAllConnections");
    expect(steps).toContain("closeDb");
  });

  it("does not skip the grace wait while a socket is still open", async () => {
    const { steps, runner } = harness();
    await runner("SIGTERM");
    expect(steps).toContain("sleep:10000");
  });

  it("tolerates a server that is not listening", async () => {
    const { steps, server, exit, runner } = harness();
    (server as unknown as { listening: boolean }).listening = false;

    await runner("SIGTERM");

    expect(steps).toContain("closeDb");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("tolerates a server whose close throws", async () => {
    const { steps, server, exit, runner } = harness();
    (server as unknown as { close: () => void }).close = () => {
      steps.push("server.close");
      throw new Error("ERR_SERVER_NOT_RUNNING");
    };

    await runner("SIGTERM");

    expect(steps).toContain("closeDb");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("still exits when the SSE drain publish throws", async () => {
    const { steps, exit, runner } = harness({
      onDrain: () => {
        throw new Error("subscriber stream already closed");
      },
    });

    await runner("SIGTERM");

    expect(steps).toContain("closeDb");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("still exits when closing the database throws", async () => {
    const { exit, runner } = harness({
      closeDb: async () => {
        throw new Error("pool already gone");
      },
    });

    await runner("SIGTERM");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("does not leave a `close` listener attached after the grace wait", async () => {
    const { server, runner } = harness();
    await runner("SIGTERM");
    expect(server.listenerCount("close")).toBe(0);
  });
});

describe("installShutdownHandlers", () => {
  it("registers SIGTERM and SIGINT exactly once per install", () => {
    const { server } = fakeServer();
    const before = process.listenerCount("SIGTERM");
    const installed = installShutdownHandlers({
      server,
      exit: vi.fn(),
      sleep: async () => {},
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    expect(process.listenerCount("SIGTERM")).toBe(before + 1);
    expect(process.listenerCount("SIGINT")).toBe(before + 1);

    installed.remove();
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  it("drains on SIGTERM", async () => {
    const { steps, server } = fakeServer();
    const exit = vi.fn();
    const installed = installShutdownHandlers({
      server,
      exit,
      sleep: async () => {},
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    process.emit("SIGTERM");
    await installed.shutdown("SIGTERM");
    installed.remove();

    expect(steps).toContain("server.close");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("points the uncaughtException guard at a non-zero drain", async () => {
    const { steps, server } = fakeServer();
    const exit = vi.fn();
    const installed = installShutdownHandlers({
      server,
      exit,
      sleep: async () => {},
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await installed.shutdown("uncaughtException", 1);
    installed.remove();

    expect(steps).toContain("server.close");
    // State is unknown on this path, so the exit code must not be 0.
    expect(exit).toHaveBeenCalledWith(1);
  });
});
