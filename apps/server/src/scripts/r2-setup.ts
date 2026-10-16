import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { getR2Client } from "../lib/storage/client.js";

const HEALTHCHECK_KEY = "erpsys/__healthcheck";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DOTENV_PATH = path.resolve(scriptDir, "../../../../.env");
dotenv.config({ path: DOTENV_PATH });
dotenv.config();

function cfg() {
  return {
    bucket: (process.env["R2_BUCKET"] ?? "").trim() || "erpsys-dev",
    endpoint: (process.env["R2_ENDPOINT"] ?? "").trim(),
    keyId: (process.env["R2_ACCESS_KEY_ID"] ?? "").trim(),
    secret: (process.env["R2_SECRET_ACCESS_KEY"] ?? "").trim(),
  };
}

function idPrefix(keyId: string): string {
  return keyId.length <= 4 ? "****" : `${keyId.slice(0, 4)}****`;
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "(unset)";
  }
}

function wrangler(args: string): void {
  execSync(`npx wrangler ${args}`, { stdio: "inherit" });
}

function r2(c: ReturnType<typeof cfg>): S3Client {
  return getR2Client({
    endpoint: c.endpoint,
    accessKeyId: c.keyId,
    secretAccessKey: c.secret,
    bucket: c.bucket,
  });
}

function needCreds(c: ReturnType<typeof cfg>): void {
  if (!c.endpoint || !c.keyId || !c.secret) {
    throw new Error(
      "[r2] R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not all set.\n" +
        "Mint them in the dashboard (R2 → API tokens) and paste them into .env, then re-run.",
    );
  }
}

async function headBucket(c: ReturnType<typeof cfg>): Promise<void> {
  try {
    await r2(c).send(new HeadBucketCommand({ Bucket: c.bucket }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: unknown } })
      .$metadata?.httpStatusCode;
    throw new Error(`[r2] HeadBucket failed with HTTP ${status ?? "unknown"}.`);
  }
}

async function healthcheck(c: ReturnType<typeof cfg>): Promise<void> {
  const client = r2(c);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: c.bucket,
        Key: HEALTHCHECK_KEY,
        Body: "erpsys-healthcheck",
        ContentType: "application/octet-stream",
      }),
    );
    await client.send(
      new HeadObjectCommand({ Bucket: c.bucket, Key: HEALTHCHECK_KEY }),
    );
    await client.send(
      new DeleteObjectCommand({ Bucket: c.bucket, Key: HEALTHCHECK_KEY }),
    );
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: unknown } })
      .$metadata?.httpStatusCode;
    throw new Error(
      `[r2] healthcheck roundtrip failed with HTTP ${status ?? "unknown"}.`,
    );
  }
}

function ensureDotenv(c: ReturnType<typeof cfg>): void {
  const wanted: Record<string, string> = {
    R2_BUCKET: c.bucket,
    R2_ENDPOINT: c.endpoint,
    R2_ACCESS_KEY_ID: c.keyId,
    R2_SECRET_ACCESS_KEY: c.secret,
  };
  const existing = existsSync(DOTENV_PATH)
    ? readFileSync(DOTENV_PATH, "utf8")
    : "";
  const missing = Object.entries(wanted).filter(
    ([k]) => !new RegExp(`^${k}=`, "m").test(existing),
  );
  if (missing.length === 0) {
    console.log("[r2] .env already has every R2_* key — nothing appended.");
    return;
  }
  appendFileSync(
    DOTENV_PATH,
    `\n${missing.map(([k, v]) => `${k}=${v}`).join("\n")}\n`,
  );
  console.log(`[r2] appended to .env: ${missing.map(([k]) => k).join(", ")}`);
}

function reminder(): void {
  console.log(
    "[r2] token scope reminder: Object Read & Write on THIS bucket only " +
      "(R2 → API tokens). Standard class only — never Infrequent Access.",
  );
}

async function listCount(c: ReturnType<typeof cfg>): Promise<number> {
  const out = await r2(c).send(
    new ListObjectsV2Command({
      Bucket: c.bucket,
      Prefix: "erpsys/",
      MaxKeys: 1000,
    }),
  );
  return out.Contents?.length ?? 0;
}

async function setup(): Promise<void> {
  const c = cfg();
  wrangler("whoami");
  try {
    wrangler(`r2 bucket create ${c.bucket}`);
  } catch {
    console.log(`[r2] bucket ${c.bucket} already exists — continuing.`);
  }
  wrangler(`r2 bucket info ${c.bucket}`);
  if (!c.endpoint || !c.keyId || !c.secret) {
    console.log(
      `[r2] bucket=${c.bucket} host=${endpointHost(c.endpoint)} — ` +
        "no S3 creds pasted yet, skipping credential validation.",
    );
    ensureDotenv({ ...c, keyId: c.keyId, secret: c.secret });
    reminder();
    return;
  }
  console.log(
    `[r2] validating bucket=${c.bucket} host=${endpointHost(c.endpoint)} key=${idPrefix(c.keyId)}`,
  );
  await headBucket(c);
  await healthcheck(c);
  console.log(
    "[r2] credential validation passed (HeadBucket + put/head/delete).",
  );
  ensureDotenv(c);
  reminder();
}

async function info(): Promise<void> {
  const c = cfg();
  wrangler(`r2 bucket info ${c.bucket}`);
  if (!c.endpoint || !c.keyId || !c.secret) {
    console.log("[r2] no S3 creds in env — prefix count skipped.");
    return;
  }
  const n = await listCount(c);
  console.log(`[r2] bucket=${c.bucket} erpsys/ prefix objects (≤1000): ${n}`);
}

async function verify(): Promise<void> {
  const c = cfg();
  needCreds(c);
  console.log(
    `[r2] verifying bucket=${c.bucket} host=${endpointHost(c.endpoint)} key=${idPrefix(c.keyId)}`,
  );
  await headBucket(c);
  await healthcheck(c);
  console.log("[r2] verify green: HeadBucket + healthcheck roundtrip passed.");
}

const mode = process.argv[2] ?? "";
try {
  if (mode === "--info") await info();
  else if (mode === "--verify") await verify();
  else await setup();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
