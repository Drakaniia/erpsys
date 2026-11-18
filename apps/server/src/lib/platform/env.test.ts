import { describe, expect, it, vi } from "vitest";
import { env, productionEnvProblems } from "./env.js";

vi.mock("dotenv", () => ({ default: { config: () => {} } }));

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
