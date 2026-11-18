import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env, productionEnvProblems } from "./env.js";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("URL configuration", () => {
  async function loadUrls(publicUrl: string, authUrl: string) {
    vi.stubEnv("PUBLIC_SITE_URL", publicUrl);
    vi.stubEnv("BETTER_AUTH_URL", authUrl);
    vi.resetModules();
    return (await import("./env.js")).env;
  }

  it("loads the repository .env independently of the working directory", async () => {
    await loadUrls("", "");
    expect(dotenv.config).toHaveBeenCalledWith({
      path: fileURLToPath(new URL("../../../../../.env", import.meta.url)),
    });
  });

  it("defaults both public URLs to localhost when neither is configured", async () => {
    const loaded = await loadUrls("", "");
    expect(loaded.BETTER_AUTH_URL).toBe("http://localhost:5173");
    expect(loaded.PUBLIC_SITE_URL).toBe("http://localhost:5173");
  });

  it("uses explicit local URLs", async () => {
    const loaded = await loadUrls("http://localhost:5173/", "http://localhost:5173");
    expect(loaded.PUBLIC_SITE_URL).toBe("http://localhost:5173");
  });

  it("preserves an explicit deployed URL instead of forcing localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const loaded = await loadUrls("https://portal.example.org/", "https://portal.example.org");
    expect(loaded.PUBLIC_SITE_URL).toBe("https://portal.example.org");
    expect(loaded.BETTER_AUTH_URL).toBe("https://portal.example.org");
  });

  it("falls back to the configured auth URL for deployment", async () => {
    const loaded = await loadUrls("", "https://portal.example.org");
    expect(loaded.PUBLIC_SITE_URL).toBe("https://portal.example.org");
  });
});

const prod = {
  ...env,
  NODE_ENV: "production",
  DATABASE_URL: "mongodb+srv://cluster.example/erpsys",
  BETTER_AUTH_SECRET: "a".repeat(48),
  SU_PIN: "482913",
  PUBLIC_SITE_URL: "https://erpsys.example",
  R2_BUCKET: "erpsys-prod",
  R2_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
};

describe("productionEnvProblems", () => {
  it("passes a complete production config and ignores development", () => {
    expect(productionEnvProblems(prod)).toEqual([]);
    expect(productionEnvProblems({ ...prod, NODE_ENV: "development", SU_PIN: "" })).toEqual([]);
  });

  it("refuses a weak secret, sample PIN, local origin and missing R2 key", () => {
    // Each of these boots fine but fails students in production.
    const problems = productionEnvProblems({
      ...prod,
      BETTER_AUTH_SECRET: "short",
      SU_PIN: "123456",
      PUBLIC_SITE_URL: "http://localhost:5173",
      R2_SECRET_ACCESS_KEY: "",
    });
    expect(problems).toHaveLength(4);
  });
});
