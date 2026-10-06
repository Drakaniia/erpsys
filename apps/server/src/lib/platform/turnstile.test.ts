import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `turnstile` gate. `verifyTurnstile` is the only place the flag is read,
 * and the assertion that matters is negative: with the integration off, the
 * siteverify request must never leave the process.
 */

const holder = vi.hoisted(() => ({
  enabled: true,
  keys: [] as string[],
  siteverifyCalls: 0,
}));

vi.mock("./integration-settings.js", () => ({
  integrationEnabled: async (key: string) => {
    holder.keys.push(key);
    return holder.enabled;
  },
}));

import { verifyTurnstile } from "./turnstile.js";

const SECRET = "0x-test-secret";

function stubSiteverify(payload: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      holder.siteverifyCalls += 1;
      return new Response(JSON.stringify(payload), {
        status: ok ? 200 : 500,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  holder.enabled = true;
  holder.keys = [];
  holder.siteverifyCalls = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the turnstile flag gate", () => {
  it("short-circuits before the siteverify fetch when the integration is off", async () => {
    holder.enabled = false;
    stubSiteverify({ success: true });

    const result = await verifyTurnstile("a-token", { secret: SECRET });

    expect(result).toEqual({ success: true });
    expect(holder.siteverifyCalls).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the flag exactly once, and only for the turnstile key", async () => {
    holder.enabled = false;
    await verifyTurnstile("a-token", { secret: SECRET });
    expect(holder.keys).toEqual(["turnstile"]);
  });

  it("still calls siteverify when the integration is on, so the gate is not vacuous", async () => {
    holder.enabled = true;
    stubSiteverify({
      success: false,
      "error-codes": ["invalid-input-response"],
    });

    const result = await verifyTurnstile("a-token", { secret: SECRET });

    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["invalid-input-response"]);
    expect(holder.siteverifyCalls).toBe(1);
  });

  it("ignores a malformed token when off — the gate is before validation too", async () => {
    holder.enabled = false;
    stubSiteverify({ success: true });
    expect(await verifyTurnstile("", { secret: SECRET })).toEqual({
      success: true,
    });
    expect(holder.siteverifyCalls).toBe(0);
  });

  it("keeps the no-secret bypass: an unconfigured secret never calls out", async () => {
    holder.enabled = true;
    stubSiteverify({ success: true });
    expect(await verifyTurnstile("a-token", { secret: "" })).toEqual({
      success: true,
    });
    expect(holder.siteverifyCalls).toBe(0);
  });
});
