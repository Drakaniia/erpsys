import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../../src/lib/db/db.js";
import { AdminGateService } from "../../../src/services/auth/AdminGateService.js";
import { fakeDb, type Row } from "../../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown, code: "" }));

vi.mock("../../../src/lib/db/db.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/lib/db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});
vi.mock("../../../src/lib/platform/env.js", () => ({
  env: { SU_PIN: "123456", NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost" },
}));
vi.mock("../../../src/lib/platform/mailer.js", () => ({
  escapeHtml: (value: string) => value,
  sendMail: async (message: { subject: string }) => {
    holder.code = message.subject.slice(0, 6);
    return true;
  },
}));

let context: ReturnType<typeof fakeDb>;

function seed(accounts: Row[]) {
  context = fakeDb({
    [COLLECTIONS.adminStepUp]: [],
    [COLLECTIONS.account]: accounts,
  });
  holder.db = context.db;
}

beforeEach(() => seed([]));

describe("AdminGateService.submitPin", () => {
  it("goes straight to the email code for an admin who signed in with Google only", async () => {
    // Google sign-in creates no credential account, so a password can never
    // match; asking for one would lock the admin out of the confirmation.
    seed([{ _id: "a1", userId: "google-admin", providerId: "google" }]);
    await AdminGateService.submitPin("google-admin", "123456");
    const status = await AdminGateService.status("google-admin");
    expect(status.next).toBe("code");
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
    await AdminGateService.submitPin("password-admin", "123456");
    const status = await AdminGateService.status("password-admin");
    expect(status.next).toBe("password");
  });

  it("treats a credential account without a stored hash as passwordless", async () => {
    seed([{ _id: "a3", userId: "empty-admin", providerId: "credential" }]);
    await AdminGateService.submitPin("empty-admin", "123456");
    expect((await AdminGateService.status("empty-admin")).next).toBe("code");
  });

  it("does not skip anything when the PIN is wrong", async () => {
    await expect(
      AdminGateService.submitPin("google-admin-2", "000000"),
    ).rejects.toThrow("Incorrect PIN.");
    expect((await AdminGateService.status("google-admin-2")).next).toBe("pin");
  });
});

describe("AdminGateService.beforeAuthenticator", () => {
  it("keeps the authenticator try count when the email code is resent", async () => {
    // Resending used to zero totpAttempts, so whoever held the inbox got five
    // fresh authenticator guesses a minute instead of five per PIN chain.
    const user = { id: "admin", email: "admin@buksu.edu.ph" };
    const t0 = new Date();
    await AdminGateService.submitPin(user.id, "123456", t0);
    await AdminGateService.sendCode(user, t0);
    await AdminGateService.verifyCode(user.id, holder.code, t0);
    for (let i = 0; i < 4; i += 1) {
      await AdminGateService.beforeAuthenticator(user.id, t0);
    }

    const t1 = new Date(t0.getTime() + 61_000);
    await AdminGateService.sendCode(user, t1);
    await AdminGateService.verifyCode(user.id, holder.code, t1);
    await AdminGateService.beforeAuthenticator(user.id, t1);
    await expect(
      AdminGateService.beforeAuthenticator(user.id, t1),
    ).rejects.toThrow("Too many wrong codes");
    expect((await AdminGateService.status(user.id, t1)).next).toBe("pin");
  });
});
