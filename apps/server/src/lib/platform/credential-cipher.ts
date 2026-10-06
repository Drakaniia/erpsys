import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { env } from "./env.js";
import type { IntegrationKey } from "./integration-settings.js";

const SALT = "erpsys.integration-credential.v1";
const INFO = "aes-256-gcm";

let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

function derivedKey(): Buffer {
  const secret = env.BETTER_AUTH_SECRET;
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = Buffer.from(
    hkdfSync("sha256", Buffer.from(secret), Buffer.from(SALT), Buffer.from(INFO), 32),
  );
  cachedSecret = secret;
  return cachedKey;
}

function aad(key: IntegrationKey, envKey: string): Buffer {
  return Buffer.from(`${key}:${envKey}`);
}

export type EncryptedField = {
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
};

export function fingerprint(value: string): string {
  return createHmac("sha256", derivedKey())
    .update(value)
    .digest("hex")
    .slice(0, 16);
}

export function encryptField(
  key: IntegrationKey,
  envKey: string,
  value: string,
): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  cipher.setAAD(aad(key, envKey));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    fingerprint: fingerprint(value),
  };
}

export function decryptField(
  key: IntegrationKey,
  envKey: string,
  field: EncryptedField,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey(),
    Buffer.from(field.iv, "base64"),
  );
  decipher.setAAD(aad(key, envKey));
  decipher.setAuthTag(Buffer.from(field.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(field.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
