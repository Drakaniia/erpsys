import { COLLECTIONS, getDbSync } from "../db/db.js";
import { decryptField, fingerprint } from "./credential-cipher.js";
import {
  CREDENTIAL_ENV_KEYS,
  CREDENTIAL_FIELDS,
  credentialKeysOf,
} from "./credential-registry.js";
import { baseEnvValue, effectiveValue } from "./env.js";
import type { IntegrationKey } from "./integration-settings.js";

export type CredentialFieldDoc = {
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
};

export type IntegrationCredentialDoc = {
  _id: string;
  key: IntegrationKey;
  values: Record<string, CredentialFieldDoc>;
  version: number;
  updatedById?: string;
  updatedAt: Date;
  createdAt: Date;
};

export type LoadedOverrides = {
  values: Record<string, string>;
  fingerprints: Record<string, string>;
  unreadable: Record<IntegrationKey, boolean>;
  loaded: boolean;
};

export function credentialCollection() {
  return getDbSync().collection<IntegrationCredentialDoc>(
    COLLECTIONS.integrationCredential,
  );
}

export async function readCredentialDocs(): Promise<
  IntegrationCredentialDoc[]
> {
  return credentialCollection().find({} as never).toArray();
}

export function decryptDocValues(doc: IntegrationCredentialDoc): {
  values: Record<string, string>;
  unreadable: boolean;
} {
  const values: Record<string, string> = {};
  try {
    for (const [envKey, field] of Object.entries(doc.values ?? {})) {
      if (!CREDENTIAL_ENV_KEYS.includes(envKey)) continue;
      values[envKey] = decryptField(doc.key, envKey, field);
    }
    return { values, unreadable: false };
  } catch {
    return { values: {}, unreadable: true };
  }
}

function emptyUnreadable(): Record<IntegrationKey, boolean> {
  return Object.fromEntries(
    Object.keys(CREDENTIAL_FIELDS).map((key) => [key, false]),
  ) as Record<IntegrationKey, boolean>;
}

let booted: Record<string, string> = {};
let readFailed = false;
let unreadableState = emptyUnreadable();

export async function loadCredentialOverrides(): Promise<LoadedOverrides> {
  unreadableState = emptyUnreadable();

  let docs: IntegrationCredentialDoc[];
  try {
    docs = await readCredentialDocs();
  } catch (error) {
    readFailed = true;
    console.error(
      "[env] credential overrides could not be loaded — running on .env values",
      error,
    );
    return {
      values: {},
      fingerprints: {},
      unreadable: unreadableState,
      loaded: false,
    };
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

  return { values, fingerprints, unreadable: unreadableState, loaded: true };
}

export function bootFingerprints(): Record<string, string> {
  return booted;
}

export function snapshotAppliedFingerprints(
  values: Record<string, string>,
): void {
  booted = { ...values };
}

export function overridesLoaded(): boolean {
  return !readFailed;
}

export function unreadableIntegrations(): Record<IntegrationKey, boolean> {
  return unreadableState;
}

export async function pendingRestartFor(
  key: IntegrationKey,
): Promise<boolean> {
  let doc: IntegrationCredentialDoc | null = null;
  try {
    doc = await credentialCollection().findOne({ key } as never);
  } catch {
    return false;
  }

  for (const envKey of credentialKeysOf(key)) {
    const stored =
      doc?.values?.[envKey]?.fingerprint ?? fingerprint(baseEnvValue(envKey));
    const running = booted[envKey] ?? fingerprint(effectiveValue(envKey));
    if (stored !== running) return true;
  }
  return false;
}
