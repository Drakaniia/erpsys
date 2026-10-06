import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ secret: "s".repeat(40) }));

vi.mock("./env.js", () => ({
  env: {
    get BETTER_AUTH_SECRET() {
      return holder.secret;
    },
  },
}));

const { decryptField, encryptField, fingerprint } = await import(
  "./credential-cipher.js"
);

beforeEach(() => {
  holder.secret = "s".repeat(40);
});

describe("encryptField / decryptField", () => {
  it("round-trips a value", () => {
    const field = encryptField("r2", "R2_SECRET_ACCESS_KEY", "hunter2-secret");
    expect(field.ciphertext).not.toContain("hunter2");
    expect(decryptField("r2", "R2_SECRET_ACCESS_KEY", field)).toBe(
      "hunter2-secret",
    );
  });

  it("fails closed under a different encryption key", () => {
    const field = encryptField("r2", "R2_SECRET_ACCESS_KEY", "value-here");
    holder.secret = "t".repeat(40);
    expect(() =>
      decryptField("r2", "R2_SECRET_ACCESS_KEY", field),
    ).toThrow();
  });

  it("binds the ciphertext to its integration and key", () => {
    const field = encryptField("r2", "R2_ACCESS_KEY_ID", "value-here");
    expect(() =>
      decryptField("r2", "R2_SECRET_ACCESS_KEY", field),
    ).toThrow();
    expect(() =>
      decryptField("email", "R2_ACCESS_KEY_ID", field),
    ).toThrow();
  });

  it("uses a fresh IV per encryption", () => {
    const a = encryptField("email", "BREVO_API_KEY", "same");
    const b = encryptField("email", "BREVO_API_KEY", "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe("fingerprint", () => {
  it("is stable for the same value and differs across values", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
    expect(fingerprint("abc")).toMatch(/^[a-f0-9]{16}$/);
  });

  it("matches the fingerprint stored with an encryption", () => {
    const field = encryptField("email", "BREVO_API_KEY", "abc");
    expect(field.fingerprint).toBe(fingerprint("abc"));
  });
});
