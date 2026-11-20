import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { COLLECTIONS, getDbSync } from "../db/db.js";
import { baseEnvValue, effectiveValue, env } from "./env.js";
import type { IntegrationKey } from "./integration-settings.js";

export type CredentialFieldSpec = {
  envKey: string;
  label: string;
  hint: string;
  helpUrl?: string;
  className: "secret" | "plain";
  required: boolean;
  pair?: string;
};

const GOOGLE_CONSOLE = "https://console.cloud.google.com/apis/credentials";
const TURNSTILE_DASH = "https://dash.cloudflare.com/?to=/:account/turnstile";
const R2_TOKENS = "https://dash.cloudflare.com/?to=/:account/r2/api-tokens";

export const CREDENTIAL_FIELDS: Record<IntegrationKey, CredentialFieldSpec[]> =
  {
    betterAuth: [],
    googleAuth: [
      {
        envKey: "GOOGLE_CLIENT_ID",
        label: "Client ID",
        hint: "OAuth 2.0 client ID from Google Cloud → APIs & Services → Credentials.",
        helpUrl: GOOGLE_CONSOLE,
        className: "secret",
        required: true,
        pair: "GOOGLE_CLIENT_SECRET",
      },
      {
        envKey: "GOOGLE_CLIENT_SECRET",
        label: "Client secret",
        hint: "The client's secret. Authorised redirect URI: /api/auth/callback/google on this site.",
        helpUrl: GOOGLE_CONSOLE,
        className: "secret",
        required: true,
        pair: "GOOGLE_CLIENT_ID",
      },
    ],
    turnstile: [
      {
        envKey: "TURNSTILE_SECRET_KEY",
        label: "Secret key",
        hint: "Server-side secret of the Turnstile widget.",
        helpUrl: TURNSTILE_DASH,
        className: "secret",
        required: true,
        pair: "VITE_TURNSTILE_SITE_KEY",
      },
      {
        envKey: "VITE_TURNSTILE_SITE_KEY",
        label: "Site key",
        hint: "Public site key of the same widget. Applies without a restart.",
        helpUrl: TURNSTILE_DASH,
        className: "plain",
        required: true,
        pair: "TURNSTILE_SECRET_KEY",
      },
      {
        envKey: "TURNSTILE_HOSTNAMES",
        label: "Allowed hostnames",
        hint: "Comma-separated hostnames the widget is served on. Empty uses Cloudflare's default check.",
        className: "plain",
        required: false,
      },
    ],
    r2: [
      {
        envKey: "R2_BUCKET",
        label: "Bucket",
        hint: "Standard-class bucket that stores evidence files.",
        className: "plain",
        required: true,
      },
      {
        envKey: "R2_ENDPOINT",
        label: "Endpoint",
        hint: "https://<account id>.r2.cloudflarestorage.com — no path, query or port.",
        helpUrl: R2_TOKENS,
        className: "plain",
        required: true,
      },
      {
        envKey: "R2_ACCESS_KEY_ID",
        label: "Access key ID",
        hint: "R2 API token with Object Read & Write on this bucket only.",
        helpUrl: R2_TOKENS,
        className: "secret",
        required: true,
        pair: "R2_SECRET_ACCESS_KEY",
      },
      {
        envKey: "R2_SECRET_ACCESS_KEY",
        label: "Secret access key",
        hint: "Secret half of the same R2 token.",
        helpUrl: R2_TOKENS,
        className: "secret",
        required: true,
        pair: "R2_ACCESS_KEY_ID",
      },
    ],
    cloudflareChat: [
      {
        envKey: "CLOUDFLARE_ACCOUNT_ID",
        label: "Account ID",
        hint: "Cloudflare account that owns Workers AI.",
        className: "plain",
        required: true,
      },
      {
        envKey: "CLOUDFLARE_API_TOKEN",
        label: "API token",
        hint: "Token with Workers AI run permission.",
        helpUrl: "https://dash.cloudflare.com/profile/api-tokens",
        className: "secret",
        required: true,
      },
    ],
    email: [
      {
        envKey: "BREVO_API_KEY",
        label: "API key",
        hint: "Brevo transactional API key (v3).",
        helpUrl: "https://app.brevo.com/settings/keys/api",
        className: "secret",
        required: true,
      },
      {
        envKey: "MAIL_FROM",
        label: "Sender",
        hint: 'A sender verified in Brevo — "Name <addr>" or a bare address.',
        helpUrl: "https://app.brevo.com/senders",
        className: "plain",
        required: true,
      },
    ],
    googleForms: [
      {
        envKey: "GOOGLE_FORMS_REFRESH_TOKEN",
        label: "Refresh token",
        hint: "OAuth refresh token of the account that owns the forms, minted against the Google sign-in client with the forms.body, forms.responses.readonly and drive.file scopes.",
        helpUrl: "https://developers.google.com/oauthplayground",
        className: "secret",
        required: true,
      },
    ],
    googleCalendar: [
      {
        envKey: "CALENDAR_TOKEN_KEY",
        label: "Token encryption key",
        hint: "Random secret of 32+ characters that encrypts instructors' Calendar refresh tokens. Changing it disconnects every instructor. Authorised redirect URI: /api/v1/calendar/callback on this site.",
        helpUrl: GOOGLE_CONSOLE,
        className: "secret",
        required: true,
      },
    ],
  };

export const CREDENTIAL_ENV_KEYS: readonly string[] = Object.values(
  CREDENTIAL_FIELDS,
).flatMap((fields) => fields.map((field) => field.envKey));

export const MASK = "••••••••••••";

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length < 6 ? MASK : value.slice(0, 5) + MASK;
}

export const credentialKeysOf = (key: IntegrationKey): string[] =>
  CREDENTIAL_FIELDS[key].map((field) => field.envKey);

export type EncryptedField = {
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
};

let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

function derivedKey(): Buffer {
  const secret = env.BETTER_AUTH_SECRET;
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret),
      Buffer.from("erpsys.integration-credential.v1"),
      Buffer.from("aes-256-gcm"),
      32,
    ),
  );
  cachedSecret = secret;
  return cachedKey;
}

const aad = (key: IntegrationKey, envKey: string) =>
  Buffer.from(`${key}:${envKey}`);

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

export type IntegrationCredentialDoc = {
  _id: string;
  key: IntegrationKey;
  values: Record<string, EncryptedField>;
  version: number;
  updatedById?: string;
  updatedAt: Date;
  createdAt: Date;
};

export const credentialCollection = () =>
  getDbSync().collection<IntegrationCredentialDoc>(
    COLLECTIONS.integrationSetting,
  );

export const readCredentialDocs = () =>
  credentialCollection()
    .find({} as never)
    .toArray();

export function decryptDocValues(doc: IntegrationCredentialDoc): {
  values: Record<string, string>;
  unreadable: boolean;
} {
  const values: Record<string, string> = {};
  try {
    for (const [envKey, field] of Object.entries(doc.values ?? {})) {
      if (CREDENTIAL_ENV_KEYS.includes(envKey)) {
        values[envKey] = decryptField(doc.key, envKey, field);
      }
    }
    return { values, unreadable: false };
  } catch {
    return { values: {}, unreadable: true };
  }
}

const noneUnreadable = () =>
  Object.fromEntries(
    Object.keys(CREDENTIAL_FIELDS).map((key) => [key, false]),
  ) as Record<IntegrationKey, boolean>;

let booted: Record<string, string> = {};
let readFailed = false;
let unreadableState = noneUnreadable();

export async function loadCredentialOverrides(): Promise<{
  values: Record<string, string>;
  fingerprints: Record<string, string>;
}> {
  unreadableState = noneUnreadable();
  let docs: IntegrationCredentialDoc[];
  try {
    docs = await readCredentialDocs();
  } catch (error) {
    readFailed = true;
    console.error(
      "[env] credential overrides could not be loaded — running on .env values",
      error,
    );
    return { values: {}, fingerprints: {} };
  }
  readFailed = false;
  const values: Record<string, string> = {};
  const fingerprints: Record<string, string> = {};
  for (const doc of docs) {
    if (!(doc.key in CREDENTIAL_FIELDS)) continue;
    const decrypted = decryptDocValues(doc);
    if (decrypted.unreadable) {
      unreadableState[doc.key] = true;
      console.error(
        `[env] stored credentials for "${doc.key}" cannot be read — the encryption key changed or the document is damaged. Re-enter them, or reset to .env.`,
      );
      continue;
    }
    for (const [envKey, plaintext] of Object.entries(decrypted.values)) {
      values[envKey] = plaintext;
      fingerprints[envKey] = fingerprint(plaintext);
    }
  }
  console.log(
    `[env] applied ${Object.keys(values).length} stored credential override(s)`,
  );
  return { values, fingerprints };
}

export function snapshotAppliedFingerprints(
  values: Record<string, string>,
): void {
  booted = { ...values };
}

export const overridesLoaded = () => !readFailed;
export const unreadableIntegrations = () => unreadableState;

export async function pendingRestartFor(key: IntegrationKey): Promise<boolean> {
  let doc: IntegrationCredentialDoc | null;
  try {
    doc = await credentialCollection().findOne({ key } as never);
  } catch {
    return false;
  }
  return credentialKeysOf(key).some((envKey) => {
    const stored =
      doc?.values?.[envKey]?.fingerprint ?? fingerprint(baseEnvValue(envKey));
    const running = booted[envKey] ?? fingerprint(effectiveValue(envKey));
    return stored !== running;
  });
}
