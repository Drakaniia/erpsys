import { expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("LOCAL_ONLY", "true");
  vi.stubEnv("BETTER_AUTH_URL", "https://erpsys.pages.dev");
  vi.stubEnv("PUBLIC_SITE_URL", "https://erpsys.pages.dev");
});

import { env } from "../../../src/lib/platform/env.js";
import { INTEGRATION_KEYS, integrationEnabled, integrationConfigured, setIntegrationEnabled } from "../../../src/lib/platform/integration-settings.js";
import { configuredR2Client } from "../../../src/lib/storage/configured-client.js";
import { probeCredentials } from "../../../src/lib/platform/credential-probes.js";

it("keeps MongoDB while blocking external integrations even when credentials exist", async () => {
  expect(env.BETTER_AUTH_URL).toBe("http://localhost:5173");
  expect(env.PUBLIC_SITE_URL).toBe("http://localhost:5173");
  expect(env.DATABASE_URL).toBeTruthy();
  for (const key of INTEGRATION_KEYS) {
    expect(await integrationEnabled(key)).toBe(key === "betterAuth");
    if (key !== "betterAuth") {
      expect(integrationConfigured(key)).toBe(false);
      expect((await probeCredentials(key, {})).ok).toBe(false);
    }
  }
  expect(configuredR2Client()).toBeNull();
  await expect(setIntegrationEnabled({ key: "email", enabled: true, actorId: "test" })).rejects.toThrow("local-only mode");
});
