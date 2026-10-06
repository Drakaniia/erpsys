import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./env.js", () => ({
  env: {
    CALENDAR_TOKEN_KEY: "k".repeat(40),
  },
}));

import { env } from "./env.js";
import { openToken, sealToken } from "./token-crypto.js";

const writable = env as { CALENDAR_TOKEN_KEY: string };

afterEach(() => {
  writable.CALENDAR_TOKEN_KEY = "k".repeat(40);
});

describe("token crypto", () => {
  it("round-trips a token and never stores it in the clear", () => {
    const sealed = sealToken("1//refresh-token");
    expect(sealed).not.toContain("refresh-token");
    expect(openToken(sealed)).toBe("1//refresh-token");
  });

  it("seals the same text differently each time", () => {
    expect(sealToken("same")).not.toBe(sealToken("same"));
  });

  it("refuses a tampered value", () => {
    const [iv, tag, body] = sealToken("secret").split(".");
    const flipped = Buffer.from(body!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      openToken([iv, tag, flipped.toString("base64")].join(".")),
    ).toThrow();
  });

  it("refuses to open with a different key", () => {
    const sealed = sealToken("secret");
    writable.CALENDAR_TOKEN_KEY = "z".repeat(40);
    expect(() => openToken(sealed)).toThrow();
  });

  it("refuses to seal without a key", () => {
    writable.CALENDAR_TOKEN_KEY = "";
    expect(() => sealToken("secret")).toThrow(/CALENDAR_TOKEN_KEY/);
  });
});
