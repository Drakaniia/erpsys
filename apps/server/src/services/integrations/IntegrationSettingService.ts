import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import { encryptField } from "../../lib/platform/credential-cipher.js";
import {
  probeCredentials,
  type CredentialFailure,
} from "../../lib/platform/credential-probes.js";
import {
  CREDENTIAL_FIELDS,
  CREDENTIAL_ENV_KEYS,
  maskSecret,
} from "../../lib/platform/credential-registry.js";
import { baseEnvValue, effectiveValue } from "../../lib/platform/env.js";
import {
  credentialCollection,
  decryptDocValues,
  overridesLoaded,
  pendingRestartFor,
  readCredentialDocs,
  unreadableIntegrations,
  type IntegrationCredentialDoc,
} from "../../lib/platform/env-overrides.js";
import {
  INTEGRATION_CONSEQUENCE,
  INTEGRATION_KEYS,
  INTEGRATION_LABEL,
  allIntegrationStates,
  defaultEnabled,
  integrationConfigured,
  invalidateIntegrationCache,
  loadPublicIntegrationFlags,
  publicIntegrationPayload,
  setIntegrationEnabled,
  type IntegrationKey,
  type PublicIntegrationPayload,
} from "../../lib/platform/integration-settings.js";

const DESCRIPTION: Record<IntegrationKey, string> = {
  turnstile: "Challenge bot sign-in and registration.",
  r2: "Upload evidence photos and documents.",
  googleAuth: "Sign in and link accounts with Google.",
  cloudflareChat: "Ask the assistant about your enrollment.",
  email: "Email password resets and turn alerts to students.",
  googleForms: "Create the profiling Google Form and read student responses.",
  googleCalendar: "Mirror instructor office hours to their Google Calendar.",
};

const ROW_ORDER: readonly IntegrationKey[] = [
  "googleAuth",
  "googleForms",
  "googleCalendar",
  "turnstile",
  "r2",
  "cloudflareChat",
  "email",
];

export type CredentialFieldView = {
  envKey: string;
  label: string;
  hint: string;
  helpUrl: string | null;
  class: "secret" | "plain";
  required: boolean;
  value: string | null;
  masked: string | null;
  source: "env" | "stored" | "missing";
  unreadable: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

export type IntegrationRow = {
  key: IntegrationKey;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  consequence: string;
  updatedByName: string | null;
  updatedAt: string | null;
  credentials: CredentialFieldView[];
  version: number;
  pendingRestart: boolean;
  overridesLoaded: boolean;
};

export type PublicIntegrationFlags = Record<IntegrationKey, boolean>;

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function unprocessable(failures: CredentialFailure[]): ApiError {
  return new ApiError("UNPROCESSABLE_CONTENT", {
    message: failures.length === 1 ? failures[0].reason : "Credentials rejected.",
    data: { failures },
  });
}

function conflict(): ApiError {
  return new ApiError("CONFLICT", {
    message:
      "These credentials changed since this row was loaded. Reload and try again.",
  });
}

async function actorNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const users = await getDbSync()
    .collection<{ _id: unknown; name?: string }>(COLLECTIONS.user)
    .find(idIn(ids) as never)
    .toArray();
  for (const user of users) {
    if (user.name) names.set(String(user._id), user.name);
  }
  return names;
}

function fieldView(args: {
  spec: (typeof CREDENTIAL_FIELDS)[IntegrationKey][number];
  stored: string | undefined;
  unreadable: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}): CredentialFieldView {
  const { spec } = args;
  const effective = args.stored ?? effectiveValue(spec.envKey);
  const source: CredentialFieldView["source"] =
    args.stored !== undefined
      ? "stored"
      : baseEnvValue(spec.envKey).trim()
        ? "env"
        : "missing";

  return {
    envKey: spec.envKey,
    label: spec.label,
    hint: spec.hint,
    helpUrl: spec.helpUrl ?? null,
    class: spec.className,
    required: spec.required,
    value:
      spec.className === "plain" && effective.trim() ? effective : null,
    masked:
      spec.className === "secret" && effective.trim()
        ? maskSecret(effective)
        : null,
    source,
    unreadable: args.unreadable,
    updatedAt: args.updatedAt,
    updatedByName: args.updatedByName,
  };
}

function buildRow(args: {
  key: IntegrationKey;
  enabled: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
  doc: IntegrationCredentialDoc | undefined;
  unreadable: boolean;
  pendingRestart: boolean;
}): IntegrationRow {
  const decrypted = args.doc
    ? decryptDocValues(args.doc)
    : { values: {} as Record<string, string>, unreadable: false };
  const unreadable = args.unreadable || decrypted.unreadable;
  const docUpdatedAt = args.doc
    ? new Date(args.doc.updatedAt).toISOString()
    : null;

  return {
    key: args.key,
    label: INTEGRATION_LABEL[args.key],
    description: DESCRIPTION[args.key],
    enabled: args.enabled,
    configured: integrationConfigured(args.key),
    consequence: INTEGRATION_CONSEQUENCE[args.key],
    updatedByName: args.updatedByName,
    updatedAt: args.updatedAt,
    credentials: CREDENTIAL_FIELDS[args.key].map((spec) =>
      fieldView({
        spec,
        stored: decrypted.values[spec.envKey],
        unreadable,
        updatedAt: docUpdatedAt,
        updatedByName: args.updatedByName,
      }),
    ),
    version: args.doc?.version ?? 0,
    pendingRestart: args.pendingRestart,
    overridesLoaded: overridesLoaded(),
  };
}

function escapeEnvValue(value: string): string {
  if (!/[\s#"$\\]/.test(value)) return value;
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n")}"`;
}

export class IntegrationSettingService {
  static async rows(): Promise<IntegrationRow[]> {
    const [states, docs] = await Promise.all([
      allIntegrationStates(),
      readCredentialDocs(),
    ]);

    const byKey = new Map(docs.map((doc) => [doc.key, doc] as const));
    const updatedByIds = [
      ...new Set(
        docs
          .map((doc) => doc.updatedById)
          .filter((id): id is string => typeof id === "string" && id !== ""),
      ),
    ];
    const actors = await actorNames(updatedByIds);
    const unreadable = unreadableIntegrations();

    return Promise.all(
      ROW_ORDER.map(async (key) => {
        const doc = byKey.get(key);
        return buildRow({
          key,
          enabled: states[key]?.enabled ?? defaultEnabled(key),
          updatedByName: doc?.updatedById
            ? (actors.get(String(doc.updatedById)) ?? null)
            : null,
          updatedAt: doc ? new Date(doc.updatedAt).toISOString() : null,
          doc,
          unreadable: unreadable[key],
          pendingRestart: await pendingRestartFor(key),
        });
      }),
    );
  }

  static async publicPayload(): Promise<PublicIntegrationPayload> {
    return publicIntegrationPayload();
  }

  static async publicFlags(): Promise<PublicIntegrationFlags> {
    return loadPublicIntegrationFlags();
  }

  static assertKey(raw: string): IntegrationKey {
    if (!(INTEGRATION_KEYS as readonly string[]).includes(raw)) {
      throw new ApiError("NOT_FOUND", { message: "Unknown integration." });
    }
    return raw as IntegrationKey;
  }

  static async setEnabled(
    actorId: string,
    key: IntegrationKey,
    enabled: boolean,
  ): Promise<{ key: IntegrationKey; enabled: boolean }> {
    await setIntegrationEnabled({ key, enabled, actorId });
    return { key, enabled };
  }

  static async saveCredentials(args: {
    actorId: string;
    key: IntegrationKey;
    version: number;
    values: Record<string, string | null>;
  }): Promise<IntegrationRow> {
    const specs = CREDENTIAL_FIELDS[args.key];
    const known = new Set(specs.map((spec) => spec.envKey));
    for (const envKey of Object.keys(args.values)) {
      if (!known.has(envKey)) {
        throw new ApiError("BAD_REQUEST", {
          message: `Unknown credential key: ${envKey}.`,
        });
      }
    }

    const doc = await credentialCollection().findOne({
      key: args.key,
    } as never);
    const current = doc
      ? decryptDocValues(doc)
      : { values: {} as Record<string, string>, unreadable: false };

    const failures: CredentialFailure[] = [];
    const candidate: Record<string, string> = {};
    for (const spec of specs) {
      const incoming = args.values[spec.envKey];
      if (incoming === "") {
        failures.push({
          key: spec.envKey,
          reason: "must not be empty — use Reset to fall back to .env",
        });
        continue;
      }
      candidate[spec.envKey] =
        incoming === undefined
          ? (current.values[spec.envKey] ?? baseEnvValue(spec.envKey).trim())
          : incoming === null
            ? baseEnvValue(spec.envKey).trim()
            : incoming;
    }

    for (const spec of specs) {
      if (!spec.pair) continue;
      const hasLeft = args.values[spec.envKey] !== undefined;
      const hasRight = args.values[spec.pair] !== undefined;
      if (hasLeft !== hasRight) {
        const missing = hasLeft ? spec.pair : spec.envKey;
        failures.push({
          key: missing,
          reason: `must be saved together with ${hasLeft ? spec.envKey : spec.pair}`,
        });
      }
    }

    const clearingOnly =
      Object.keys(args.values).length > 0 &&
      Object.values(args.values).every((value) => value === null);

    if (!clearingOnly) {
      for (const spec of specs) {
        if (spec.required && (candidate[spec.envKey] ?? "").trim() === "") {
          failures.push({ key: spec.envKey, reason: "is required" });
        }
      }

      if (args.key === "email") {
        const from = (candidate.MAIL_FROM ?? "").trim();
        const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
        if (from !== "" && !EMAIL_ADDRESS.test(address)) {
          failures.push({ key: "MAIL_FROM", reason: "is not an email address" });
        }
      }
    }

    if (failures.length > 0) throw unprocessable(failures);

    if (!clearingOnly) {
      const probe = await probeCredentials(args.key, candidate);
      if (!probe.ok) throw unprocessable(probe.failures);
    }

    const currentVersion = doc?.version ?? 0;
    if (currentVersion !== args.version) throw conflict();

    const sets: Record<string, unknown> = {};
    const insertValues: Record<string, unknown> = {};
    const unsets: Record<string, string> = {};
    for (const spec of specs) {
      const incoming = args.values[spec.envKey];
      if (incoming === undefined) continue;
      const stored = current.values[spec.envKey];
      if (incoming === null) {
        if (stored !== undefined) unsets[`values.${spec.envKey}`] = "";
        continue;
      }
      if (stored === incoming) continue;
      const field = encryptField(args.key, spec.envKey, incoming);
      sets[`values.${spec.envKey}`] = field;
      insertValues[spec.envKey] = field;
    }

    const touched = [
      ...Object.keys(insertValues),
      ...Object.keys(unsets).map((path) => path.slice("values.".length)),
    ];
    if (touched.length === 0) {
      return (await this.rows()).find((row) => row.key === args.key)!;
    }

    const at = new Date();
    if (!doc) {
      try {
        await credentialCollection().insertOne({
          _id: genId("integration-credential"),
          key: args.key,
          values: insertValues as IntegrationCredentialDoc["values"],
          version: 1,
          updatedById: args.actorId,
          updatedAt: at,
          createdAt: at,
        });
      } catch {
        throw conflict();
      }
    } else {
      const result = await credentialCollection().updateOne(
        { _id: doc._id, version: currentVersion } as never,
        {
          $set: {
            ...sets,
            version: currentVersion + 1,
            updatedById: args.actorId,
            updatedAt: at,
          },
          ...(Object.keys(unsets).length > 0 ? { $unset: unsets } : {}),
        } as never,
      );
      if (result.matchedCount === 0) throw conflict();
    }

    invalidateIntegrationCache();
    console.log(
      `[integrations] credentials saved key=${args.key} actor=${args.actorId} fields=${touched.join(",")}`,
    );

    const action =
      args.key === "googleAuth"
        ? "Updated Google sign-in credentials"
        : `Updated ${INTEGRATION_LABEL[args.key]} credentials`;
    const detail = touched
      .map((envKey) => {
        const spec = specs.find((field) => field.envKey === envKey);
        const value = args.values[envKey];
        return spec?.className === "secret" && typeof value === "string"
          ? `${envKey} (${maskSecret(value)})`
          : envKey;
      })
      .join(", ");

    await getDbSync().collection(COLLECTIONS.adminActionLog).insertOne({
      _id: genId("admin-action"),
      actorId: args.actorId,
      action,
      targetRef: args.key,
      detail,
      at,
    } as never);

    return (await this.rows()).find((row) => row.key === args.key)!;
  }

  static async resetCredentials(
    actorId: string,
    key: IntegrationKey,
  ): Promise<IntegrationRow> {
    const doc = await credentialCollection().findOne({ key } as never);
    const keys = doc ? Object.keys(doc.values ?? {}) : [];

    if (doc && keys.length > 0) {
      const at = new Date();
      await credentialCollection().updateOne(
        { _id: doc._id } as never,
        {
          $set: {
            values: {},
            version: doc.version + 1,
            updatedById: actorId,
            updatedAt: at,
          },
        } as never,
      );
      invalidateIntegrationCache();
      console.log(
        `[integrations] credentials reset key=${key} actor=${actorId} fields=${keys.join(",")}`,
      );
      await getDbSync().collection(COLLECTIONS.adminActionLog).insertOne({
        _id: genId("admin-action"),
        actorId,
        action: `Reset ${INTEGRATION_LABEL[key]} credentials`,
        targetRef: key,
        detail: keys.join(", "),
        at,
      } as never);
    }

    return (await this.rows()).find((row) => row.key === key)!;
  }

  static async exportEnv(
    actorId: string,
  ): Promise<{ filename: string; content: string }> {
    const [docs, actor] = await Promise.all([
      readCredentialDocs(),
      getDbSync()
        .collection<{ email?: string }>(COLLECTIONS.user)
        .findOne(idIn([actorId]) as never),
    ]);
    const stored: Record<string, string> = {};
    const undecryptable = new Set<IntegrationKey>();
    for (const doc of docs) {
      const decrypted = decryptDocValues(doc);
      if (decrypted.unreadable) undecryptable.add(doc.key);
      else Object.assign(stored, decrypted.values);
    }
    const effective = (envKey: string): string =>
      stored[envKey] ?? baseEnvValue(envKey);

    const lines: string[] = [
      `# ERPSYS integrations — exported ${new Date().toISOString()} by ${actor?.email || actorId}`,
      "# Live credentials. Install at /etc/erpsys.env (root:erpsys, 0640) and restart erpsys.service.",
      "",
    ];

    for (const key of ROW_ORDER) {
      lines.push(`# ${INTEGRATION_LABEL[key]}`);
      if (undecryptable.has(key)) {
        lines.push(
          "# Stored credentials could not be read (the encryption key changed). Values below come from .env.",
        );
      }
      const specs = CREDENTIAL_FIELDS[key];
      const configured = specs.some(
        (spec) => spec.required && effective(spec.envKey).trim() !== "",
      );
      if (!configured) {
        for (const spec of specs.filter((field) => field.required)) {
          lines.push(`# ${spec.envKey} is not configured`);
        }
      } else {
        for (const spec of specs) {
          const value = effective(spec.envKey);
          if (value.trim() === "") continue;
          lines.push(`${spec.envKey}=${escapeEnvValue(value)}`);
        }
      }
      lines.push("");
    }

    await getDbSync().collection(COLLECTIONS.adminActionLog).insertOne({
      _id: genId("admin-action"),
      actorId,
      action: "Exported integration credentials",
      targetRef: "integrations",
      detail: CREDENTIAL_ENV_KEYS.join(", "),
      at: new Date(),
    } as never);

    return {
      filename: "erpsys-integrations.env",
      content: `${lines.join("\n").trimEnd()}\n`,
    };
  }
}
