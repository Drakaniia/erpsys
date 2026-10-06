import { describe, expect, it, vi } from "vitest";
import {
  applyEnvOverrides,
  assertProductionEnv,
  baseEnvValue,
  effectiveValue,
  env,
  isLocalOrigin,
  productionEnvProblems,
  type ProductionEnvInput,
} from "./env.js";

// env.js loads the repo-root `.env` at import, so the defaults test below
// would see real operator values — neutralize dotenv for this file. The
// pure `productionEnvProblems` tests never touch `process.env` anyway.
vi.mock("dotenv", () => ({ default: { config: () => {} } }));

/**
 * `assertProductionEnv` takes its values as an argument, so every branch is
 * reachable without touching `process.env` — which matters, because the whole
 * point of the check is that it runs in production, where a test cannot follow
 * it.
 */

function input(
  overrides: Partial<ProductionEnvInput> = {},
): ProductionEnvInput {
  return {
    isProduction: true,
    nodeEnv: "production",
    databaseUrl: "mongodb+srv://user:pw@cluster0.example.mongodb.net/erpsys",
    betterAuthSecret: "a".repeat(48),
    portFallbackUsed: false,
    r2Bucket: "erpsys-prod",
    r2Endpoint: "https://abc123.r2.cloudflarestorage.com",
    r2AccessKeyId: "key-id",
    r2SecretKey: "secret",
    ...overrides,
  };
}

describe("productionEnvProblems", () => {
  it("passes on a valid production config", () => {
    expect(productionEnvProblems(input())).toEqual([]);
    expect(() => assertProductionEnv(input())).not.toThrow();
  });

  it("enforces nothing outside production", () => {
    expect(
      productionEnvProblems(
        input({
          isProduction: false,
          nodeEnv: "development",
          databaseUrl: "mongodb://localhost:27017/erpsys",
          betterAuthSecret: "",
          portFallbackUsed: true,
        }),
      ),
    ).toEqual([]);
  });

  it("fails on a NODE_ENV that is not exactly production", () => {
    const problems = productionEnvProblems(
      input({ isProduction: true, nodeEnv: "prod" }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/NODE_ENV/);
    expect(() => assertProductionEnv(input({ nodeEnv: "prod" }))).toThrow(
      /NODE_ENV/,
    );
  });

  it("fails on a DATABASE_URL still at its localhost default", () => {
    const problems = productionEnvProblems(
      input({ databaseUrl: "mongodb://localhost:27017/erpsys" }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/DATABASE_URL/);
  });

  it("fails on a BETTER_AUTH_SECRET under 32 characters", () => {
    const problems = productionEnvProblems(
      input({ betterAuthSecret: "a".repeat(31) }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/BETTER_AUTH_SECRET/);
  });

  it("accepts a BETTER_AUTH_SECRET at exactly 32 characters", () => {
    expect(
      productionEnvProblems(input({ betterAuthSecret: "a".repeat(32) })),
    ).toEqual([]);
  });

  it("fails on a PORT that failed to parse", () => {
    const problems = productionEnvProblems(input({ portFallbackUsed: true }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/PORT/);
  });

  it("reports every problem at once, not one per deploy attempt", () => {
    expect(
      productionEnvProblems(
        input({
          nodeEnv: "development",
          databaseUrl: "mongodb://localhost:27017/erpsys",
          betterAuthSecret: "short",
          portFallbackUsed: true,
        }),
      ),
    ).toHaveLength(4);
  });

  it("names the failing checks in the thrown error", () => {
    expect(() =>
      assertProductionEnv(input({ portFallbackUsed: true })),
    ).toThrow(/refusing to boot in production/);
  });

  it("fails on missing R2 vars in production", () => {
    const problems = productionEnvProblems(
      input({
        r2Bucket: "",
        r2Endpoint: "",
        r2AccessKeyId: "",
        r2SecretKey: "",
      }),
    );
    expect(problems).toHaveLength(3);
    expect(problems.some((p) => p.includes("R2_BUCKET"))).toBe(true);
    expect(problems.some((p) => p.includes("R2_ENDPOINT"))).toBe(true);
    expect(problems.some((p) => p.includes("R2_ACCESS_KEY_ID"))).toBe(true);
  });

  it("fails on a half-set R2 key pair", () => {
    const missingSecret = productionEnvProblems(input({ r2SecretKey: "" }));
    expect(
      missingSecret.some((p) =>
        p.includes(
          "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set together",
        ),
      ),
    ).toBe(true);
    const missingId = productionEnvProblems(input({ r2AccessKeyId: "" }));
    expect(
      missingId.some((p) =>
        p.includes(
          "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set together",
        ),
      ),
    ).toBe(true);
    expect(productionEnvProblems(input())).toEqual([]);
  });

  it("defaults the R2 kill switch to on with an 8 GiB quota", async () => {
    const keys = [
      "R2_BUCKET",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_QUOTA_BYTES",
      "R2_UPLOADS_ENABLED",
      "R2_MAINTENANCE_MESSAGE",
    ];
    const saved = new Map(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    vi.resetModules();
    try {
      const { env } = await import("./env.js");
      expect(env.R2_UPLOADS_ENABLED).toBe(true);
      expect(env.R2_QUOTA_BYTES).toBe(8589934592);
      expect(env.R2_BUCKET).toBe("");
      expect(env.R2_ENDPOINT).toBe("");
      expect(env.R2_ACCESS_KEY_ID).toBe("");
      expect(env.R2_SECRET_ACCESS_KEY).toBe("");
      expect(env.R2_MAINTENANCE_MESSAGE).toBe("");
    } finally {
      for (const [k, v] of saved) {
        if (v !== undefined) process.env[k] = v;
        else delete process.env[k];
      }
      vi.resetModules();
      // Re-establish the statically-imported module for any later test file
      // sharing this worker (vitest isolates per file by default, but cheap).
      await import("./env.js");
    }
  });
});

describe("applyEnvOverrides", () => {
  it("shadows a credential key but keeps the base value and core config intact", () => {
    const base = baseEnvValue("GOOGLE_CLIENT_ID");
    applyEnvOverrides({ GOOGLE_CLIENT_ID: "stored-id" });
    try {
      expect(env.GOOGLE_CLIENT_ID).toBe("stored-id");
      expect(effectiveValue("GOOGLE_CLIENT_ID")).toBe("stored-id");
      expect(baseEnvValue("GOOGLE_CLIENT_ID")).toBe(base);
      expect(process.env.GOOGLE_CLIENT_ID).toBe("stored-id");
      expect(env.DATABASE_URL).not.toBe("stored-id");
    } finally {
      applyEnvOverrides({});
      if (base === "") delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = base;
    }
    expect(env.GOOGLE_CLIENT_ID).toBe(base);
  });
});

describe("isLocalOrigin", () => {
  it("recognises the loopback spellings", () => {
    expect(isLocalOrigin("http://localhost:5173")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1")).toBe(true);
    expect(isLocalOrigin("https://[::1]")).toBe(true);
  });

  it("rejects a deployed host", () => {
    expect(isLocalOrigin("https://enroll.buksu.edu.ph")).toBe(false);
    expect(isLocalOrigin("https://localhost.evil.test")).toBe(false);
  });
});
