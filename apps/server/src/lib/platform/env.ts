import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

{
  dotenv.config({
    path: fileURLToPath(new URL("../../../../../.env", import.meta.url)),
  });
  dotenv.config();
}

const BASE: Record<string, string | undefined> = { ...process.env };
const LOCAL_ONLY = BASE.LOCAL_ONLY !== "false";
if (BASE.NODE_ENV === "production" && LOCAL_ONLY) {
  throw new Error("[env] production requires LOCAL_ONLY=false");
}
let overrides: Record<string, string> = {};

export const customEnvKey = (key: string): string => `CUSTOM_${key}`;
export const defaultEnvValue = (key: string): string => BASE[key] ?? "";
export const customEnvValue = (key: string): string =>
  BASE[customEnvKey(key)] ?? "";
export const baseEnvValue = (key: string): string =>
  customEnvValue(key).trim() ? customEnvValue(key) : defaultEnvValue(key);

const get = (key: string, fallback = "") =>
  (overrides[key]?.trim() || baseEnvValue(key)).trim() || fallback;
const off = (key: string) => get(key).toLowerCase() === "false";
const num = (key: string, fallback: number) => {
  const value = Number(get(key));
  return get(key) && Number.isFinite(value) && value >= 0 ? value : fallback;
};

export function applyEnvOverrides(values: Record<string, string>): void {
  overrides = { ...values };
  Object.assign(process.env, overrides);
}

export const effectiveValue = (key: string): string => get(key);

const DEFAULT_DATABASE_URL = "mongodb://localhost:27017/erpsys";

export const env = {
  LOCAL_ONLY,
  DATABASE_URL: get("DATABASE_URL", DEFAULT_DATABASE_URL),
  BETTER_AUTH_SECRET: get("BETTER_AUTH_SECRET"),
  INTEGRATION_CREDENTIAL_KEY: get("INTEGRATION_CREDENTIAL_KEY"),
  BETTER_AUTH_URL: LOCAL_ONLY
    ? "http://localhost:5173"
    : get("BETTER_AUTH_URL", "http://localhost:5173"),
  PUBLIC_SITE_URL: LOCAL_ONLY
    ? "http://localhost:5173"
    : (
        get("PUBLIC_SITE_URL") ||
        get("BETTER_AUTH_URL", "http://localhost:5173")
      ).replace(/\/+$/, ""),
  WEB_ORIGIN: LOCAL_ONLY ? "http://localhost:5173" : get("WEB_ORIGIN"),
  SERVE_WEB: !off("SERVE_WEB"),
  QUEUE_SHARE_SECRET: get("QUEUE_SHARE_SECRET") || get("BETTER_AUTH_SECRET"),
  get GOOGLE_CLIENT_ID() {
    return get("GOOGLE_CLIENT_ID");
  },
  get GOOGLE_CLIENT_SECRET() {
    return get("GOOGLE_CLIENT_SECRET");
  },
  get GOOGLE_FORMS_REFRESH_TOKEN() {
    return get("GOOGLE_FORMS_REFRESH_TOKEN");
  },
  get CALENDAR_TOKEN_KEY() {
    return get("CALENDAR_TOKEN_KEY");
  },
  ADMIN_EMAILS: get("ADMIN_EMAILS", "admin@buksu.edu.ph"),
  SU_PIN: get("SU_PIN"),
  get CLOUDFLARE_ACCOUNT_ID() {
    return get("CLOUDFLARE_ACCOUNT_ID");
  },
  get CLOUDFLARE_API_TOKEN() {
    return get("CLOUDFLARE_API_TOKEN");
  },
  CLOUDFLARE_PRIMARY_MODEL: get(
    "CLOUDFLARE_PRIMARY_MODEL",
    "@cf/openai/gpt-oss-20b",
  ),
  CLOUDFLARE_FALLBACK_MODELS: get(
    "CLOUDFLARE_FALLBACK_MODELS",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/meta/llama-3.1-8b-instruct-fp8",
  ),
  CLOUDFLARE_RPM: num("CLOUDFLARE_RPM", 30),
  CLOUDFLARE_DAILY_NEURON_CAP: num("CLOUDFLARE_DAILY_NEURON_CAP", 10_000),
  CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY: num(
    "CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY",
    20_000,
  ),
  CLOUDFLARE_CHAT_ENABLED: !off("CLOUDFLARE_CHAT_ENABLED"),
  CLOUDFLARE_MAINTENANCE_MESSAGE: get("CLOUDFLARE_MAINTENANCE_MESSAGE"),
  CLOUDFLARE_REQUEST_DEADLINE_MS: num("CLOUDFLARE_REQUEST_DEADLINE_MS", 30_000),
  get R2_BUCKET() {
    return get("R2_BUCKET");
  },
  get R2_ENDPOINT() {
    return get("R2_ENDPOINT");
  },
  get R2_ACCESS_KEY_ID() {
    return get("R2_ACCESS_KEY_ID");
  },
  get R2_SECRET_ACCESS_KEY() {
    return get("R2_SECRET_ACCESS_KEY");
  },
  R2_QUOTA_BYTES: num("R2_QUOTA_BYTES", 8589934592),
  R2_UPLOADS_ENABLED: !off("R2_UPLOADS_ENABLED"),
  R2_MAINTENANCE_MESSAGE: get("R2_MAINTENANCE_MESSAGE"),
  get BREVO_API_KEY() {
    return get("BREVO_API_KEY");
  },
  get MAIL_FROM() {
    return get("MAIL_FROM");
  },
  get TURNSTILE_SECRET_KEY() {
    return get("TURNSTILE_SECRET_KEY");
  },
  get TURNSTILE_HOSTNAMES() {
    return get("TURNSTILE_HOSTNAMES", "localhost,127.0.0.1");
  },
  get VITE_TURNSTILE_SITE_KEY() {
    return get("VITE_TURNSTILE_SITE_KEY");
  },
  PORT: Number(get("PORT", "3001")),
  NODE_ENV: LOCAL_ONLY ? "development" : get("NODE_ENV", "development"),
};

export function isLocalOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(
    origin,
  );
}

export function webOrigins(): string[] {
  return env.WEB_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

type EnvInput = Pick<
  typeof env,
  | "NODE_ENV"
  | "DATABASE_URL"
  | "BETTER_AUTH_SECRET"
  | "SU_PIN"
  | "PUBLIC_SITE_URL"
  | "R2_BUCKET"
  | "R2_ENDPOINT"
  | "R2_ACCESS_KEY_ID"
  | "R2_SECRET_ACCESS_KEY"
>;

export function productionEnvProblems(e: EnvInput = env): string[] {
  if (e.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (e.DATABASE_URL === DEFAULT_DATABASE_URL)
    problems.push("DATABASE_URL is the localhost default");
  if (e.BETTER_AUTH_SECRET.length < 32)
    problems.push("BETTER_AUTH_SECRET must be at least 32 characters");
  if (!/^\d{6}$/.test(e.SU_PIN) || e.SU_PIN === "123456")
    problems.push("SU_PIN must be 6 digits and not 123456");
  if (!e.PUBLIC_SITE_URL || isLocalOrigin(e.PUBLIC_SITE_URL))
    problems.push("PUBLIC_SITE_URL must be the deployed host");
  for (const key of [
    "R2_BUCKET",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const) {
    if (!e[key]) problems.push(`${key} is empty`);
  }
  return problems;
}

export function assertProductionEnv(): void {
  const problems = productionEnvProblems();
  if (problems.length > 0) {
    throw new Error(
      `[env] refusing to boot in production:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
