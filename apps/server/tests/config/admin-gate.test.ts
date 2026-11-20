import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import {
  beforeAuthenticator,
  requireAuthenticatorReset,
  sendCode,
  stepUpStatus,
  submitPin,
  verifyCode,
} from "../../src/config/auth/admin-gate.js";
import { fakeDb, type Row } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown, code: "" }));

vi.mock("../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../src/lib/platform/env.js", () => ({
  env: {
    SU_PIN: "123456",
    NODE_ENV: "test",
    BETTER_AUTH_URL: "http://localhost",
  },
}));
vi.mock("../../src/lib/platform/mailer.js", () => ({
  escapeHtml: (value: string) => value,
  sendMail: async (message: { subject: string }) => {
    holder.code = message.subject.slice(0, 6);
    return true;
  },
}));

function seed(accounts: Row[]) {
  holder.db = fakeDb({
    [COLLECTIONS.adminStepUp]: [],
    [COLLECTIONS.account]: accounts,
  }).db;
}

beforeEach(() => seed([]));

describe("submitPin", () => {
  it("goes straight to the email code for an admin who signed in with Google only", async () => {
    // Google sign-in creates no credential account, so a password can never
    // match; asking for one would lock the admin out of the confirmation.
    seed([{ _id: "a1", userId: "google-admin", providerId: "google" }]);
    await submitPin("google-admin", "123456");
    expect((await stepUpStatus("google-admin")).next).toBe("code");
  });

  it("still asks for the password when the admin has one", async () => {
    seed([
      {
        _id: "a2",
        userId: "password-admin",
        providerId: "credential",
        password: "hashed",
      },
    ]);
    await submitPin("password-admin", "123456");
    expect((await stepUpStatus("password-admin")).next).toBe("password");
  });

  it("treats a credential account without a stored hash as passwordless", async () => {
    seed([{ _id: "a3", userId: "empty-admin", providerId: "credential" }]);
    await submitPin("empty-admin", "123456");
    expect((await stepUpStatus("empty-admin")).next).toBe("code");
  });

  it("does not skip anything when the PIN is wrong", async () => {
    await expect(submitPin("google-admin-2", "000000")).rejects.toThrow(
      "Incorrect PIN.",
    );
    expect((await stepUpStatus("google-admin-2")).next).toBe("pin");
  });
});

describe("authenticator recovery", () => {
  it("accepts the PIN and emailed code without the lost device for a passwordless admin", async () => {
    const user = { id: "lost-device-admin", email: "admin@example.test" };
    await submitPin(user.id, "123456");
    await expect(requireAuthenticatorReset(user.id)).rejects.toMatchObject({
      data: { code: "STEP_UP_REQUIRED", authenticatorReset: true },
    });
    await sendCode(user);
    await expect(verifyCode(user.id, "not-the-code")).rejects.toThrow(
      "Incorrect code",
    );
    await expect(requireAuthenticatorReset(user.id)).rejects.toThrow();
    await verifyCode(user.id, holder.code);
    await expect(requireAuthenticatorReset(user.id)).resolves.toBeUndefined();
    expect((await stepUpStatus(user.id)).unlocked).toBe(false);
  });
});

describe("beforeAuthenticator", () => {
  it("keeps the authenticator try count when the email code is resent", async () => {
    // Resending used to zero totpAttempts, so whoever held the inbox got five
    // fresh authenticator guesses a minute instead of five per PIN chain.
    const user = { id: "admin", email: "admin@buksu.edu.ph" };
    const t0 = new Date();
    await submitPin(user.id, "123456", t0);
    await sendCode(user, t0);
    await verifyCode(user.id, holder.code, t0);
    for (let i = 0; i < 4; i += 1) await beforeAuthenticator(user.id, t0);

    const t1 = new Date(t0.getTime() + 61_000);
    await sendCode(user, t1);
    await verifyCode(user.id, holder.code, t1);
    await beforeAuthenticator(user.id, t1);
    await expect(beforeAuthenticator(user.id, t1)).rejects.toThrow(
      "Too many wrong codes",
    );
    expect((await stepUpStatus(user.id, t1)).next).toBe("pin");
  });
});
