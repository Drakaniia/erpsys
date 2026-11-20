import { afterEach, describe, expect, it } from "vitest";
import { decryptField, encryptField } from "./credentials.js";
import { env } from "./env.js";

const originalCredentialKey = env.INTEGRATION_CREDENTIAL_KEY;
const originalAuthSecret = env.BETTER_AUTH_SECRET;

afterEach(() => {
  env.INTEGRATION_CREDENTIAL_KEY = originalCredentialKey;
  env.BETTER_AUTH_SECRET = originalAuthSecret;
});

describe("integration credential encryption key", () => {
  it("uses a dedicated key outside the credential collection", () => {
    env.INTEGRATION_CREDENTIAL_KEY = "integration-key-".padEnd(40, "x");
    env.BETTER_AUTH_SECRET = "auth-secret-".padEnd(40, "a");
    const encrypted = encryptField(
      "googleAuth",
      "GOOGLE_CLIENT_ID",
      "reusable-client-id",
    );

    expect(encrypted.ciphertext).not.toContain("reusable-client-id");
    env.BETTER_AUTH_SECRET = "rotated-auth-secret-".padEnd(40, "b");
    expect(decryptField("googleAuth", "GOOGLE_CLIENT_ID", encrypted)).toBe(
      "reusable-client-id",
    );
  });

  it("retains the legacy key when no dedicated key is configured", () => {
    env.INTEGRATION_CREDENTIAL_KEY = "";
    env.BETTER_AUTH_SECRET = "legacy-auth-secret-".padEnd(40, "c");
    const encrypted = encryptField("email", "BREVO_API_KEY", "reusable-key");

    expect(decryptField("email", "BREVO_API_KEY", encrypted)).toBe(
      "reusable-key",
    );
  });
});
