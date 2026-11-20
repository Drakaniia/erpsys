import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("custom integration environment overrides", () => {
  it.each([
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_FORMS_REFRESH_TOKEN",
    "CALENDAR_TOKEN_KEY",
    "TURNSTILE_SECRET_KEY",
    "VITE_TURNSTILE_SITE_KEY",
    "TURNSTILE_HOSTNAMES",
    "R2_BUCKET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "BREVO_API_KEY",
    "MAIL_FROM",
  ])(
    "resolves database override, CUSTOM_%s, then the original",
    async (key) => {
      vi.stubEnv(key, "default-value");
      vi.stubEnv(`CUSTOM_${key}`, "custom-value");
      const {
        applyEnvOverrides,
        baseEnvValue,
        defaultEnvValue,
        effectiveValue,
      } = await import("./env.js");

      expect(effectiveValue(key)).toBe("custom-value");
      expect(baseEnvValue(key)).toBe("custom-value");
      expect(defaultEnvValue(key)).toBe("default-value");

      applyEnvOverrides({ [key]: "database-value" });
      expect(effectiveValue(key)).toBe("database-value");
      expect(defaultEnvValue(key)).toBe("default-value");
    },
  );

  it("uses the original when the custom variable is empty and ignores whitespace-only database values", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "original-client");
    vi.stubEnv("CUSTOM_GOOGLE_CLIENT_ID", "");
    const { applyEnvOverrides, effectiveValue } = await import("./env.js");

    expect(effectiveValue("GOOGLE_CLIENT_ID")).toBe("original-client");
    applyEnvOverrides({ GOOGLE_CLIENT_ID: "   " });
    expect(effectiveValue("GOOGLE_CLIENT_ID")).toBe("original-client");
  });
});
