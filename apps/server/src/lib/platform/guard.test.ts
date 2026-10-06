import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installProcessGuards,
  isProcessGuardsInstalled,
  removeProcessGuardsForTest,
  setFatalHandler,
} from "./guard.js";

/**
 * The guards are the difference between one student's bad request and 999
 * other students losing their session, so what is pinned here is behaviour
 * that cannot be observed by running the app: that installing twice does not
 * double-register, and that the uncaught path still exits when the shutdown it
 * calls is itself broken.
 */

afterEach(() => {
  removeProcessGuardsForTest();
});

function countListeners(event: string): number {
  return process.listeners(event).length;
}

describe("installProcessGuards", () => {
  it("registers exactly one listener per event", () => {
    const before = {
      rejection: countListeners("unhandledRejection"),
      exception: countListeners("uncaughtException"),
    };

    installProcessGuards();
    expect(countListeners("unhandledRejection")).toBe(before.rejection + 1);
    expect(countListeners("uncaughtException")).toBe(before.exception + 1);
  });

  it("is idempotent — a second call does not double-register", () => {
    installProcessGuards();
    installProcessGuards();
    installProcessGuards();

    expect(isProcessGuardsInstalled()).toBe(true);
    expect(countListeners("unhandledRejection")).toBe(1);
    expect(countListeners("uncaughtException")).toBe(1);
  });

  it("logs an unhandled rejection and keeps going", () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const exit = vi.fn();
    installProcessGuards({ logger, exit });
    setFatalHandler(exit);

    process.emit(
      "unhandledRejection",
      new Error("one bad request"),
      Promise.resolve(),
    );

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(logger.error.mock.calls[0]?.[0])).toMatch(/one bad request/);
    // The point of the handler: no exit, no shutdown.
    expect(exit).not.toHaveBeenCalled();
  });

  it("includes the stack for a non-Error rejection reason", () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    installProcessGuards({ logger, exit: vi.fn() });

    process.emit("unhandledRejection", "just a string", Promise.resolve());

    expect(String(logger.error.mock.calls[0]?.[0])).toMatch(/just a string/);
  });

  it("runs the graceful shutdown on an uncaught exception", () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const exit = vi.fn();
    const shutdown = vi.fn();
    installProcessGuards({ logger, exit });
    setFatalHandler(shutdown);

    process.emit("uncaughtException", new Error("boom"));

    expect(logger.error).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("exits non-zero when no shutdown is registered", () => {
    const exit = vi.fn();
    installProcessGuards({ logger: { error: vi.fn(), warn: vi.fn() }, exit });

    process.emit("uncaughtException", new Error("boom"));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits non-zero when the shutdown itself throws", () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const exit = vi.fn();
    installProcessGuards({ logger, exit });
    setFatalHandler(() => {
      throw new Error("shutdown exploded");
    });

    // The whole point: the fatal path must never be what finally kills the
    // process by hanging. A throw here has to fall through to a hard exit.
    process.emit("uncaughtException", new Error("boom"));

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits non-zero when the shutdown rejects", async () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const exit = vi.fn();
    installProcessGuards({ logger, exit });
    setFatalHandler(() => Promise.reject(new Error("shutdown rejected")));

    process.emit("uncaughtException", new Error("boom"));
    await Promise.resolve();
    await Promise.resolve();

    expect(exit).toHaveBeenCalledWith(1);
  });
});
