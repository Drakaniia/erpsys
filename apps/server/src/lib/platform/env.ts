import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const BASE: Record<string, string | undefined> = { ...process.env };

let overrides: Record<string, string> = {};

function req(key: string, fallback = ""): string {
  return overrides[key] ?? BASE[key] ?? fallback;
}

export function applyEnvOverrides(values: Record<string, string>): void {
  overrides = { ...values };
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

export function baseEnvValue(key: string): string {
  return BASE[key] ?? "";
}

export function effectiveValue(key: string): string {
  return req(key, "");
}
function num(key: string, fallback: number): number {
  const raw = req(key, "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    console.warn(`[env] ignoring unusable ${key}="${raw}" — using ${fallback}`);
    return fallback;
  }
  return value;
}

let portFallbackUsed = false;

function port(key: string, fallback: number): number {
  const raw = req(key, "").trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 1 || value > 65535) {
    if (raw) {
      console.warn(
        `[env] ignoring unusable ${key}="${raw}" — using ${fallback}`,
      );
      portFallbackUsed = true;
    }
    return fallback;
  }
  return value;
}

function publicOrigin(): string {
  const raw = (
    req("PUBLIC_SITE_URL", "") ||
    req("BETTER_AUTH_URL", "") ||
    ""
  ).trim();
  return raw.replace(/\/+$/, "");
}

const DEFAULT_DATABASE_URL = "mongodb://localhost:27017/erpsys";

export const env = {
  DATABASE_URL: req("DATABASE_URL", DEFAULT_DATABASE_URL),
  BETTER_AUTH_SECRET: req("BETTER_AUTH_SECRET", ""),
  BETTER_AUTH_URL: req("BETTER_AUTH_URL", "http://localhost:5173"),
  PUBLIC_SITE_URL: publicOrigin(),
  WEB_ORIGIN: req("WEB_ORIGIN", ""),
  SERVE_WEB: req("SERVE_WEB", "true").trim().toLowerCase() !== "false",
  QUEUE_SHARE_SECRET:
    req("QUEUE_SHARE_SECRET", "") || req("BETTER_AUTH_SECRET", ""),
  get GOOGLE_CLIENT_ID() {
    return req("GOOGLE_CLIENT_ID", "");
  },
  get GOOGLE_CLIENT_SECRET() {
    return req("GOOGLE_CLIENT_SECRET", "");
  },
  get GOOGLE_FORMS_REFRESH_TOKEN() {
    return req("GOOGLE_FORMS_REFRESH_TOKEN", "");
  },
  get CALENDAR_TOKEN_KEY() {
    return req("CALENDAR_TOKEN_KEY", "");
  },
  ADMIN_EMAILS: req("ADMIN_EMAILS", "admin@buksu.edu.ph"),
  get SU_PIN() {
    return req("SU_PIN", "").trim();
  },

  get CLOUDFLARE_ACCOUNT_ID() {
    return req("CLOUDFLARE_ACCOUNT_ID", "");
  },
  get CLOUDFLARE_API_TOKEN() {
    return req("CLOUDFLARE_API_TOKEN", "");
  },
  CLOUDFLARE_PRIMARY_MODEL: req(
    "CLOUDFLARE_PRIMARY_MODEL",
    "@cf/openai/gpt-oss-20b",
  ),
  CLOUDFLARE_FALLBACK_MODELS: req(
    "CLOUDFLARE_FALLBACK_MODELS",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast,@cf/meta/llama-3.1-8b-instruct-fp8",
  ),
  CLOUDFLARE_RPM: num("CLOUDFLARE_RPM", 30),
  CLOUDFLARE_DAILY_NEURON_CAP: num("CLOUDFLARE_DAILY_NEURON_CAP", 10_000),
  CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY: num(
    "CLOUDFLARE_TOKENS_PER_STUDENT_PER_DAY",
    20_000,
  ),
  CLOUDFLARE_CHAT_ENABLED:
    req("CLOUDFLARE_CHAT_ENABLED", "true").trim().toLowerCase() !== "false",
  CLOUDFLARE_MAINTENANCE_MESSAGE: req("CLOUDFLARE_MAINTENANCE_MESSAGE", ""),
  CLOUDFLARE_REQUEST_DEADLINE_MS: num("CLOUDFLARE_REQUEST_DEADLINE_MS", 30_000),
  get R2_BUCKET() {
    return req("R2_BUCKET", "");
  },
  get R2_ENDPOINT() {
    return req("R2_ENDPOINT", "");
  },
  get R2_ACCESS_KEY_ID() {
    return req("R2_ACCESS_KEY_ID", "");
  },
  get R2_SECRET_ACCESS_KEY() {
    return req("R2_SECRET_ACCESS_KEY", "");
  },
  R2_QUOTA_BYTES: num("R2_QUOTA_BYTES", 8589934592),
  R2_UPLOADS_ENABLED:
    req("R2_UPLOADS_ENABLED", "true").trim().toLowerCase() !== "false",
  R2_MAINTENANCE_MESSAGE: req("R2_MAINTENANCE_MESSAGE", ""),
  get BREVO_API_KEY() {
    return req("BREVO_API_KEY", "");
  },
  get MAIL_FROM() {
    return req("MAIL_FROM", "");
  },
  get TURNSTILE_SECRET_KEY() {
    return req("TURNSTILE_SECRET_KEY", "");
  },
  get TURNSTILE_HOSTNAMES() {
    return req("TURNSTILE_HOSTNAMES", "localhost,127.0.0.1");
  },
  get VITE_TURNSTILE_SITE_KEY() {
    return req("VITE_TURNSTILE_SITE_KEY", "");
  },
  PORT: port("PORT", 3001),
  NODE_ENV: req("NODE_ENV", "development"),

  MONGO_MAX_POOL_SIZE: num("MONGO_MAX_POOL_SIZE", 25),
  MONGO_MIN_POOL_SIZE: num("MONGO_MIN_POOL_SIZE", 5),
  MONGO_WAIT_QUEUE_TIMEOUT_MS: num("MONGO_WAIT_QUEUE_TIMEOUT_MS", 5000),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: num(
    "MONGO_SERVER_SELECTION_TIMEOUT_MS",
    5000,
  ),
  MONGO_CONNECT_TIMEOUT_MS: num("MONGO_CONNECT_TIMEOUT_MS", 10000),
  MONGO_SOCKET_TIMEOUT_MS: num("MONGO_SOCKET_TIMEOUT_MS", 45000),
  MONGO_MAX_IDLE_TIME_MS: num("MONGO_MAX_IDLE_TIME_MS", 60000),
  MONGO_APP_NAME: req("MONGO_APP_NAME", "erpsys") || "erpsys",

  SHUTDOWN_GRACE_MS: num("SHUTDOWN_GRACE_MS", 10000),
  DRAIN_DELAY_MS: num("DRAIN_DELAY_MS", 2000),

  METRICS_TOKEN: req("METRICS_TOKEN", ""),
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

export type ProductionEnvInput = {
  isProduction: boolean;
  nodeEnv: string;
  databaseUrl: string;
  betterAuthSecret: string;
  portFallbackUsed: boolean;
  suPin?: string;
  r2Bucket?: string;
  r2Endpoint?: string;
  r2AccessKeyId?: string;
  r2SecretKey?: string;
};

export function productionEnvProblems(input: ProductionEnvInput): string[] {
  if (!input.isProduction) return [];

  const problems: string[] = [];

  if (input.nodeEnv !== "production") {
    problems.push(
      `[env] NODE_ENV is "${input.nodeEnv}" but this is a production boot — set NODE_ENV=production (defaults to "development", which serves stack traces to students).`,
    );
  }

  if (input.databaseUrl === DEFAULT_DATABASE_URL) {
    problems.push(
      `[env] DATABASE_URL is still the localhost default — Atlas credentials are missing.`,
    );
  }

  if (input.betterAuthSecret.length < 32) {
    problems.push(
      `[env] BETTER_AUTH_SECRET is ${input.betterAuthSecret.length} characters; it must be at least 32.`,
    );
  }

  if (input.portFallbackUsed) {
    problems.push(
      `[env] PORT could not be parsed and fell back to 3001 — the proxy will not reach this process.`,
    );
  }

  if (input.suPin !== undefined && !/^\d{6}$/.test(input.suPin)) {
    problems.push(
      `[env] SU_PIN must be exactly 6 digits — administrators cannot change integration settings without it.`,
    );
  } else if (input.suPin === "123456") {
    problems.push(`[env] SU_PIN is still the sample value 123456.`);
  }

  const r2Bucket = (input.r2Bucket ?? "").trim();
  const r2Endpoint = (input.r2Endpoint ?? "").trim();
  const r2KeyId = (input.r2AccessKeyId ?? "").trim();
  const r2Secret = (input.r2SecretKey ?? "").trim();
  if (r2Bucket === "") {
    problems.push(
      `[env] R2_BUCKET is empty — R2 uploads cannot mint. Set it to the Standard-class bucket (erpsys-prod in production).`,
    );
  }
  if (r2Endpoint === "") {
    problems.push(
      `[env] R2_ENDPOINT is empty — set it to https://<accountId>.r2.cloudflarestorage.com.`,
    );
  }
  if ((r2KeyId === "") !== (r2Secret === "")) {
    problems.push(
      `[env] R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set together — one is missing, so R2 uploads would fail after writing pending rows.`,
    );
  }
  if (r2KeyId === "" || r2Secret === "") {
    problems.push(
      `[env] R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are empty — mint an API token with Object Read & Write on this bucket only.`,
    );
  }

  return problems;
}

function currentProductionEnvInput(): ProductionEnvInput {
  return {
    isProduction: env.NODE_ENV === "production",
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    portFallbackUsed,
    suPin: env.SU_PIN,
    r2Bucket: env.R2_BUCKET,
    r2Endpoint: env.R2_ENDPOINT,
    r2AccessKeyId: env.R2_ACCESS_KEY_ID,
    r2SecretKey: env.R2_SECRET_ACCESS_KEY,
  };
}

export function assertProductionEnv(
  input: ProductionEnvInput = currentProductionEnvInput(),
): void {
  const problems = productionEnvProblems(input);
  if (problems.length === 0) return;
  throw new Error(
    `[env] refusing to boot in production:\n  - ${problems.join("\n  - ")}`,
  );
}

export function assertPublicOrigin(): void {
  const origin = env.PUBLIC_SITE_URL;
  if (!origin) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "[env] PUBLIC_SITE_URL (or BETTER_AUTH_URL) must be set in production — share links cannot be built without it.",
      );
    }
    console.warn(
      "[env] no PUBLIC_SITE_URL/BETTER_AUTH_URL set — share links will be built from a fallback origin.",
    );
    return;
  }
  if (isLocalOrigin(origin) && env.NODE_ENV === "production") {
    throw new Error(
      `[env] PUBLIC_SITE_URL is "${origin}" — a local origin in production would hand students localhost links. Set it to the deployed host.`,
    );
  }
}
