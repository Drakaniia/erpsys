import { ApiError } from "../config/errors.js";
import { COLLECTIONS, getDbSync, idIn, refIn } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";
import {
  probeCredentials,
  type CredentialFailure,
} from "../lib/platform/credential-probes.js";
import {
  CREDENTIAL_ENV_KEYS,
  CREDENTIAL_FIELDS,
  credentialCollection,
  decryptDocValues,
  encryptField,
  maskSecret,
  overridesLoaded,
  pendingRestartFor,
  readCredentialDocs,
  unreadableIntegrations,
  type CredentialFieldSpec,
  type IntegrationCredentialDoc,
} from "../lib/platform/credentials.js";
import {
  baseEnvValue,
  customEnvValue,
  defaultEnvValue,
  effectiveValue,
  env,
} from "../lib/platform/env.js";
import {
  INTEGRATION_CONSEQUENCE,
  INTEGRATION_KEYS,
  INTEGRATION_LABEL,
  allIntegrationStates,
  integrationConfigured,
  integrationLocked,
  invalidateIntegrationCache,
  lockedError,
  type IntegrationKey,
  type IntegrationState,
} from "../lib/platform/integration-settings.js";
import { UserModel } from "../models/UserModel.js";

const DESCRIPTION: Record<IntegrationKey, string> = {
  betterAuth:
    "Password and email-code sign-in, optional email verification, sessions, student registration, password reset and the admin unlock.",
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
  "betterAuth",
];

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertIntegrationKey(raw: string): IntegrationKey {
  if (!(INTEGRATION_KEYS as readonly string[]).includes(raw)) {
    throw new ApiError("NOT_FOUND", { message: "Unknown integration." });
  }
  return raw as IntegrationKey;
}

const unprocessable = (failures: CredentialFailure[]) =>
  new ApiError("UNPROCESSABLE_CONTENT", {
    message:
      failures.length === 1 ? failures[0].reason : "Credentials rejected.",
    data: { failures },
  });

const conflict = () =>
  new ApiError("CONFLICT", {
    message:
      "These credentials changed since this row was loaded. Reload and try again.",
  });

async function actorNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const users = await getDbSync()
    .collection<{ _id: unknown; name?: string }>(COLLECTIONS.user)
    .find(idIn(ids) as never)
    .toArray();
  return new Map(
    users.flatMap((user) => (user.name ? [[String(user._id), user.name]] : [])),
  );
}

function fieldView(
  spec: CredentialFieldSpec,
  stored: string | undefined,
  unreadable: boolean,
  updatedAt: string | null,
  updatedByName: string | null,
) {
  const effective = stored ?? effectiveValue(spec.envKey);
  const set = effective.trim() !== "";
  return {
    envKey: spec.envKey,
    customEnvKey: `CUSTOM_${spec.envKey}`,
    label: spec.label,
    hint: spec.hint,
    helpUrl: spec.helpUrl ?? null,
    class: spec.className,
    required: spec.required,
    value: spec.className === "plain" && set ? effective : null,
    masked: spec.className === "secret" && set ? maskSecret(effective) : null,
    source:
      stored !== undefined
        ? "stored"
        : customEnvValue(spec.envKey).trim()
          ? "customEnv"
          : defaultEnvValue(spec.envKey).trim()
            ? "env"
            : "missing",
    unreadable,
    updatedAt,
    updatedByName,
  };
}

export async function adminAuthenticators() {
  const admins = await UserModel.listByRole("ADMIN");
  const factors = await getDbSync()
    .collection<{ userId: unknown; verified?: boolean }>("twoFactor")
    .find({ userId: refIn(admins.map((admin) => String(admin._id))) } as never)
    .toArray();
  const enrolled = new Set(
    factors
      .filter((factor) => factor.verified !== false)
      .map((factor) => String(factor.userId)),
  );
  return admins.map((admin) => ({
    userId: String(admin._id),
    name: admin.name ?? "",
    email: admin.email ?? "",
    enrolled: enrolled.has(String(admin._id)),
  }));
}

type AuthFeature = {
  key:
    | "emailPassword"
    | "emailCode"
    | "emailVerification"
    | "studentSignUp"
    | "passwordReset"
    | "twoFactor"
    | "adminUnlock"
    | "adminAccounts";
  label: string;
  state: "on" | "limited" | "off";
  note: string;
};

async function authFeatures(
  states: Record<IntegrationKey, IntegrationState>,
): Promise<AuthFeature[]> {
  const emailLive = states.email.enabled && integrationConfigured("email");
  const admins = await adminAuthenticators();
  const enrolled = admins.filter((admin) => admin.enrolled).length;
  const pinSet = /^\d{6}$/.test(env.SU_PIN);
  const adminEmails = env.ADMIN_EMAILS.split(",")
    .map((email) => email.trim())
    .filter(Boolean).length;
  return [
    {
      key: "emailPassword",
      label: "Email and password sign-in",
      state: "on",
      note: "Accounts with a password can sign in immediately, without email verification. Google and email-code sign-in are separate options.",
    },
    {
      key: "emailCode",
      label: "Email-code sign-in",
      state: emailLive ? "on" : "off",
      note: emailLive
        ? "Existing accounts can sign in with a 6-digit email code. Codes expire in 5 minutes and allow 3 wrong attempts. This does not create accounts."
        : "Email delivery is off or unconfigured. Use a password or Google instead.",
    },
    {
      key: "emailVerification",
      label: "Optional email verification",
      state: emailLive ? "on" : "limited",
      note: emailLive
        ? "Users can verify their email in Connected accounts. Verification is not required for first login. Email-code login also proves email ownership."
        : "Email verification is unavailable until email delivery is enabled and configured. Password login still works.",
    },
    {
      key: "studentSignUp",
      label: "Student self-registration",
      state: "on",
      note: "Students create their own account on the register page with a student number.",
    },
    emailLive
      ? {
          key: "passwordReset",
          label: "Password reset",
          state: "on",
          note: "Reset links are emailed. Each one expires after an hour and works once. A successful reset ends all existing sessions.",
        }
      : {
          key: "passwordReset",
          label: "Password reset",
          state: "limited",
          note: "Email delivery is off or has no credentials, so reset links aren't sent. Students must ask the office to reset a password.",
        },
    {
      key: "twoFactor",
      label: "Two-factor authentication (admins)",
      state: admins.length > 0 && enrolled === admins.length ? "on" : "limited",
      note: `${enrolled} of ${admins.length} admins have set up an authenticator app. Admins without one set it up at their next unlock.`,
    },
    !pinSet
      ? {
          key: "adminUnlock",
          label: "Admin unlock",
          state: "off",
          note: "SU_PIN isn't set to 6 digits, so no admin can unlock protected settings.",
        }
      : !emailLive
        ? {
            key: "adminUnlock",
            label: "Admin unlock",
            state: "limited",
            note:
              env.NODE_ENV === "production"
                ? "Email delivery is off, so the confirmation code can't be sent and the unlock stops at that step."
                : "Email delivery is off, so the confirmation code is printed to the server log instead of emailed.",
          }
        : {
            key: "adminUnlock",
            label: "Admin unlock",
            state: "on",
            note: "PIN, then password, then an emailed code, then the authenticator. Protected settings stay unlocked for 5 minutes.",
          },
    {
      key: "adminAccounts",
      label: "Admin accounts",
      state: adminEmails > 0 ? "on" : "off",
      note: `${adminEmails} ${adminEmails === 1 ? "address" : "addresses"} in ADMIN_EMAILS become admins only after verified email ownership and a new sign-in. Public password signup never grants privileges. ${admins.length} admin ${admins.length === 1 ? "account exists" : "accounts exist"}.`,
    },
  ];
}

export async function integrationRows() {
  const [states, docs] = await Promise.all([
    allIntegrationStates(),
    readCredentialDocs(),
  ]);
  const byKey = new Map(docs.map((doc) => [doc.key, doc] as const));
  const actors = await actorNames([
    ...new Set(
      docs.flatMap((doc) => (doc.updatedById ? [String(doc.updatedById)] : [])),
    ),
  ]);
  const unreadable = unreadableIntegrations();

  return Promise.all(
    ROW_ORDER.map(async (key) => {
      const doc = byKey.get(key);
      const decrypted = doc
        ? decryptDocValues(doc)
        : { values: {} as Record<string, string>, unreadable: false };
      const updatedAt = doc?.version
        ? new Date(doc.updatedAt).toISOString()
        : null;
      const updatedByName = doc?.updatedById
        ? (actors.get(String(doc.updatedById)) ?? null)
        : null;
      return {
        key,
        label: INTEGRATION_LABEL[key],
        description: DESCRIPTION[key],
        enabled: states[key].enabled,
        locked: integrationLocked(key),
        features: key === "betterAuth" ? await authFeatures(states) : null,
        configured: integrationConfigured(key),
        consequence: INTEGRATION_CONSEQUENCE[key],
        updatedByName,
        updatedAt,
        credentials: CREDENTIAL_FIELDS[key].map((spec) =>
          fieldView(
            spec,
            decrypted.values[spec.envKey],
            unreadable[key] || decrypted.unreadable,
            updatedAt,
            updatedByName,
          ),
        ),
        version: doc?.version ?? 0,
        pendingRestart: await pendingRestartFor(key),
        overridesLoaded: overridesLoaded(),
      };
    }),
  );
}

async function rowFor(key: IntegrationKey) {
  return (await integrationRows()).find((row) => row.key === key)!;
}

async function logAction(
  actorId: string,
  action: string,
  targetRef: string,
  detail: string,
) {
  await getDbSync()
    .collection(COLLECTIONS.auditLog)
    .insertOne({
      _id: genId("admin-action"),
      kind: "action",
      actorId,
      action,
      targetRef,
      detail,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
}

function assertKnownKeys(
  specs: CredentialFieldSpec[],
  values: Record<string, string | null>,
) {
  const known = new Set(specs.map((spec) => spec.envKey));
  for (const envKey of Object.keys(values)) {
    if (!known.has(envKey)) {
      throw new ApiError("BAD_REQUEST", {
        message: `Unknown credential key: ${envKey}.`,
      });
    }
  }
}

function candidateGroup(
  key: IntegrationKey,
  specs: CredentialFieldSpec[],
  current: Record<string, string>,
  values: Record<string, string | null>,
): {
  candidate: Record<string, string>;
  failures: CredentialFailure[];
  clearingOnly: boolean;
} {
  const failures: CredentialFailure[] = [];
  const candidate: Record<string, string> = {};
  const clearingOnly =
    Object.keys(values).length > 0 &&
    Object.values(values).every((value) => value === null);
  for (const spec of specs) {
    const incoming = values[spec.envKey];
    if (incoming === "") {
      failures.push({
        key: spec.envKey,
        reason:
          "must not be empty — use Reset to default to remove the override",
      });
      continue;
    }
    const fallback = baseEnvValue(spec.envKey).trim();
    candidate[spec.envKey] =
      incoming === undefined
        ? (current[spec.envKey] ?? fallback)
        : (incoming ?? fallback);
  }

  for (const spec of specs) {
    if (!spec.pair) continue;
    const hasLeft = values[spec.envKey] !== undefined;
    if (hasLeft !== (values[spec.pair] !== undefined)) {
      failures.push({
        key: hasLeft ? spec.pair : spec.envKey,
        reason: `must be saved together with ${hasLeft ? spec.envKey : spec.pair}`,
      });
    }
  }

  if (!clearingOnly) {
    for (const spec of specs) {
      if (spec.required && (candidate[spec.envKey] ?? "").trim() === "") {
        failures.push({ key: spec.envKey, reason: "is required" });
      }
    }
    if (key === "email") {
      const from = (candidate.MAIL_FROM ?? "").trim();
      const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
      if (from !== "" && !EMAIL_ADDRESS.test(address)) {
        failures.push({ key: "MAIL_FROM", reason: "is not an email address" });
      }
    }
  }

  return { candidate, failures, clearingOnly };
}

export async function validateCredentials(args: {
  key: IntegrationKey;
  version: number;
  values: Record<string, string | null>;
}) {
  if (integrationLocked(args.key)) throw lockedError(args.key);
  const specs = CREDENTIAL_FIELDS[args.key];
  assertKnownKeys(specs, args.values);
  const doc = await credentialCollection().findOne({ key: args.key } as never);
  const current = doc ? decryptDocValues(doc).values : {};
  const { candidate, failures, clearingOnly } = candidateGroup(
    args.key,
    specs,
    current,
    args.values,
  );
  if (failures.length > 0) throw unprocessable(failures);
  if (!clearingOnly) {
    const probe = await probeCredentials(args.key, candidate);
    if (!probe.ok) throw unprocessable(probe.failures);
  }
  if ((doc?.version ?? 0) !== args.version) throw conflict();
  return {
    key: args.key,
    version: doc?.version ?? 0,
    fields: specs.map((spec) => ({
      envKey: spec.envKey,
      set: (candidate[spec.envKey] ?? "").trim() !== "",
      source:
        args.values[spec.envKey] !== undefined
          ? ("draft" as const)
          : current[spec.envKey] !== undefined
            ? ("stored" as const)
            : ("env" as const),
    })),
  };
}

export async function saveCredentials(args: {
  actorId: string;
  key: IntegrationKey;
  version: number;
  values: Record<string, string | null>;
}) {
  if (integrationLocked(args.key)) throw lockedError(args.key);
  const specs = CREDENTIAL_FIELDS[args.key];
  assertKnownKeys(specs, args.values);

  const doc = await credentialCollection().findOne({ key: args.key } as never);
  const current = doc ? decryptDocValues(doc).values : {};

  const { candidate, failures, clearingOnly } = candidateGroup(
    args.key,
    specs,
    current,
    args.values,
  );
  if (failures.length > 0) throw unprocessable(failures);

  if (!clearingOnly) {
    const probe = await probeCredentials(args.key, candidate);
    if (!probe.ok) throw unprocessable(probe.failures);
  }

  const currentVersion = doc?.version ?? 0;
  if (currentVersion !== args.version) throw conflict();

  const sets: Record<string, unknown> = {};
  const insertValues: IntegrationCredentialDoc["values"] = {};
  const unsets: Record<string, string> = {};
  for (const spec of specs) {
    const incoming = args.values[spec.envKey];
    const stored = current[spec.envKey];
    if (incoming === undefined || incoming === stored) continue;
    if (incoming === null) {
      if (stored !== undefined) unsets[`values.${spec.envKey}`] = "";
      continue;
    }
    insertValues[spec.envKey] = encryptField(args.key, spec.envKey, incoming);
    sets[`values.${spec.envKey}`] = insertValues[spec.envKey];
  }

  const touched = [
    ...Object.keys(insertValues),
    ...Object.keys(unsets).map((path) => path.slice("values.".length)),
  ];
  if (touched.length === 0) return rowFor(args.key);

  const at = new Date();
  if (!doc) {
    try {
      await credentialCollection().insertOne({
        _id: genId("integration-credential"),
        key: args.key,
        values: insertValues,
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
  const secret = new Set(
    specs
      .filter((spec) => spec.className === "secret")
      .map((spec) => spec.envKey),
  );
  await logAction(
    args.actorId,
    args.key === "googleAuth"
      ? "Updated Google sign-in credentials"
      : `Updated ${INTEGRATION_LABEL[args.key]} credentials`,
    args.key,
    touched
      .map((envKey) => {
        const value = args.values[envKey];
        return secret.has(envKey) && typeof value === "string"
          ? `${envKey} (${maskSecret(value)})`
          : envKey;
      })
      .join(", "),
  );
  return rowFor(args.key);
}

export async function resetCredentials(actorId: string, key: IntegrationKey) {
  if (integrationLocked(key)) throw lockedError(key);
  const doc = await credentialCollection().findOne({ key } as never);
  const keys = doc ? Object.keys(doc.values ?? {}) : [];
  if (doc && keys.length > 0) {
    const result = await credentialCollection().updateOne(
      { _id: doc._id, version: doc.version } as never,
      {
        $set: {
          values: {},
          version: doc.version + 1,
          updatedById: actorId,
          updatedAt: new Date(),
        },
      } as never,
    );
    if (result.matchedCount === 0) throw conflict();
    invalidateIntegrationCache();
    console.log(
      `[integrations] credentials reset key=${key} actor=${actorId} fields=${keys.join(",")}`,
    );
    await logAction(
      actorId,
      `Reset ${INTEGRATION_LABEL[key]} credentials`,
      key,
      keys.join(", "),
    );
  }
  return rowFor(key);
}

const escapeEnvValue = (value: string) =>
  /[\s#"$\\]/.test(value)
    ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/\n/g, "\\n")}"`
    : value;

export async function exportCredentialsEnv(actorId: string) {
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
  const effective = (envKey: string) => stored[envKey] ?? baseEnvValue(envKey);

  const lines = [
    `# ERPSYS integrations — exported ${new Date().toISOString()} by ${actor?.email || actorId}`,
    "# Live credentials. Install at /etc/erpsys.env (root:erpsys, 0640) and restart erpsys.service.",
    "",
  ];
  for (const key of ROW_ORDER) {
    if (CREDENTIAL_FIELDS[key].length === 0) continue;
    lines.push(`# ${INTEGRATION_LABEL[key]}`);
    if (undecryptable.has(key)) {
      lines.push(
        "# Stored credentials could not be read (the encryption key changed). Values below come from .env.",
      );
    }
    const specs = CREDENTIAL_FIELDS[key];
    if (
      !specs.some(
        (spec) => spec.required && effective(spec.envKey).trim() !== "",
      )
    ) {
      for (const spec of specs.filter((field) => field.required)) {
        lines.push(`# ${spec.envKey} is not configured`);
      }
    } else {
      for (const spec of specs) {
        const value = effective(spec.envKey);
        if (value.trim() !== "")
          lines.push(`${spec.envKey}=${escapeEnvValue(value)}`);
      }
    }
    lines.push("");
  }

  await logAction(
    actorId,
    "Exported integration credentials",
    "integrations",
    CREDENTIAL_ENV_KEYS.join(", "),
  );
  return {
    filename: "erpsys-integrations.env",
    content: `${lines.join("\n").trimEnd()}\n`,
  };
}
