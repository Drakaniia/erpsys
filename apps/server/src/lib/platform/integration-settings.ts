import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn } from "../db/db.js";
import { genId } from "../db/ids.js";
import {
  credentialCollection,
  decryptDocValues,
  overridesLoaded,
} from "./credentials.js";
import { env } from "./env.js";

export const INTEGRATION_KEYS = [
  "betterAuth",
  "turnstile",
  "r2",
  "googleAuth",
  "cloudflareChat",
  "email",
  "googleForms",
  "googleCalendar",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export const LOCKED_INTEGRATIONS: readonly IntegrationKey[] = ["betterAuth"];

export const integrationLocked = (key: IntegrationKey) => LOCKED_INTEGRATIONS.includes(key);

export function lockedError(key: IntegrationKey): ApiError {
  return new ApiError("CONFLICT", {
    message: `${INTEGRATION_LABEL[key]} is always on. It runs every sign-in and session, and its settings come from the deployment env.`,
    data: { code: "INTEGRATION_LOCKED" },
  });
}

export const INTEGRATION_LABEL: Record<IntegrationKey, string> = {
  betterAuth: "Better Auth",
  turnstile: "Bot protection",
  r2: "File uploads",
  googleAuth: "Google sign-in",
  cloudflareChat: "Student chat",
  email: "Email delivery",
  googleForms: "Google Forms",
  googleCalendar: "Google Calendar",
};

export const INTEGRATION_CONSEQUENCE: Record<IntegrationKey, string> = {
  betterAuth:
    "It can't be turned off. Every sign-in, session, registration, password reset and admin unlock runs through it.",
  turnstile: "Sign-in and registration become unchallenged. Bots can reach the form.",
  r2: "New uploads are refused. Existing files stay readable.",
  googleAuth:
    "Google sign-in stops. Use a password or an emailed sign-in code when email delivery is available.",
  cloudflareChat: "The student chat disappears. Knowledge stays editable here.",
  email:
    "Email-code login, email verification, password resets, admin unlock codes and turn alerts cannot be emailed. Password and Google sign-in remain available.",
  googleForms:
    "Officers can't create the profiling form and students can't send in their Profiling response. The step stays visible with an unavailable notice.",
  googleCalendar:
    "Instructors can't connect or sync Google Calendar. Office-hour schedules stay editable and visible to students.",
};

export type IntegrationState = {
  enabled: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};

type IntegrationSettingDoc = {
  _id: string;
  key: IntegrationKey;
  enabled?: boolean;
  enabledById?: string;
  enabledAt?: Date;
};

const present = (value: string) => value.trim().length > 0;
const googleClient = () =>
  present(env.GOOGLE_CLIENT_ID) && present(env.GOOGLE_CLIENT_SECRET);

export function integrationConfigured(key: IntegrationKey): boolean {
  switch (key) {
    case "betterAuth":
      return present(env.BETTER_AUTH_SECRET) && present(env.BETTER_AUTH_URL);
    case "turnstile":
      return present(env.TURNSTILE_SECRET_KEY) && present(env.VITE_TURNSTILE_SITE_KEY);
    case "r2":
      return present(env.R2_ENDPOINT) && present(env.R2_ACCESS_KEY_ID) && present(env.R2_SECRET_ACCESS_KEY);
    case "googleAuth":
      return googleClient();
    case "cloudflareChat":
      return present(env.CLOUDFLARE_ACCOUNT_ID) && present(env.CLOUDFLARE_API_TOKEN);
    case "email":
      return present(env.BREVO_API_KEY) && present(env.MAIL_FROM);
    case "googleForms":
      return present(env.GOOGLE_FORMS_REFRESH_TOKEN) && googleClient();
    case "googleCalendar":
      return present(env.CALENDAR_TOKEN_KEY) && googleClient();
  }
}

export function defaultEnabled(key: IntegrationKey): boolean {
  if (key === "googleAuth") return present(env.GOOGLE_CLIENT_ID);
  if (key === "googleCalendar") return integrationConfigured(key);
  return true;
}

const settings = () =>
  getDbSync().collection<IntegrationSettingDoc>(COLLECTIONS.integrationSetting);

const computedFlags = () =>
  Object.fromEntries(INTEGRATION_KEYS.map((key) => [key, defaultEnabled(key)])) as Record<
    IntegrationKey,
    boolean
  >;

async function loadFlags(): Promise<Record<IntegrationKey, boolean>> {
  try {
    const flags = computedFlags();
    for (const row of await settings().find({} as never).toArray()) {
      if (integrationLocked(row.key)) continue;
      if (typeof row.enabled === "boolean") flags[row.key] = row.enabled;
    }
    return flags;
  } catch (error) {
    console.error("[integration-settings] flag read failed — falling back to computed defaults", error);
    flagsPromise = null;
    return computedFlags();
  }
}

export type PublicIntegrationPayload = {
  flags: Record<IntegrationKey, boolean>;
  turnstileSiteKey: string;
  overridesLoaded: boolean;
};

let flagsPromise: Promise<Record<IntegrationKey, boolean>> | null = null;
let payloadPromise: Promise<PublicIntegrationPayload> | null = null;

export function invalidateIntegrationCache(): void {
  flagsPromise = null;
  payloadPromise = null;
}

export async function integrationEnabled(key: IntegrationKey): Promise<boolean> {
  flagsPromise ??= loadFlags();
  return (await flagsPromise)[key];
}

async function storedTurnstileSiteKey(): Promise<string | null> {
  try {
    const doc = await credentialCollection().findOne({ key: "turnstile" } as never);
    if (!doc) return null;
    const decrypted = decryptDocValues(doc);
    return decrypted.unreadable ? null : (decrypted.values.VITE_TURNSTILE_SITE_KEY ?? null);
  } catch {
    return null;
  }
}

async function loadPayload(): Promise<PublicIntegrationPayload> {
  const [states, siteKey] = await Promise.all([
    allIntegrationStates(),
    storedTurnstileSiteKey(),
  ]);
  return {
    flags: Object.fromEntries(
      INTEGRATION_KEYS.map((key) => [key, states[key].enabled]),
    ) as Record<IntegrationKey, boolean>,
    turnstileSiteKey: (siteKey ?? env.VITE_TURNSTILE_SITE_KEY).trim(),
    overridesLoaded: overridesLoaded(),
  };
}

export function publicIntegrationPayload(): Promise<PublicIntegrationPayload> {
  payloadPromise ??= loadPayload().catch((error) => {
    payloadPromise = null;
    throw error;
  });
  return payloadPromise;
}

export async function allIntegrationStates(): Promise<Record<IntegrationKey, IntegrationState>> {
  const db = getDbSync();
  const rows = await settings().find({} as never).toArray();
  const byKey = new Map(rows.map((row) => [row.key, row] as const));
  const actorIds = [...new Set(rows.flatMap((row) => (row.enabledById ? [row.enabledById] : [])))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const users = await db
      .collection<{ _id: unknown; name?: string }>(COLLECTIONS.user)
      .find(idIn(actorIds) as never)
      .toArray();
    for (const user of users) if (user.name) names.set(String(user._id), user.name);
  }
  return Object.fromEntries(
    INTEGRATION_KEYS.map((key) => {
      const row = byKey.get(key);
      return [
        key,
        {
          enabled: typeof row?.enabled === "boolean" && !integrationLocked(key) ? row.enabled : defaultEnabled(key),
          updatedAt: row?.enabledAt ? new Date(row.enabledAt).toISOString() : null,
          updatedByName: row?.enabledById ? (names.get(String(row.enabledById)) ?? null) : null,
        },
      ];
    }),
  ) as Record<IntegrationKey, IntegrationState>;
}

export async function setIntegrationEnabled(args: {
  key: IntegrationKey;
  enabled: boolean;
  actorId: string;
}): Promise<void> {
  if (integrationLocked(args.key)) throw lockedError(args.key);
  const at = new Date();
  await settings().updateOne(
    { key: args.key } as never,
    {
      $set: { key: args.key, enabled: args.enabled, enabledById: args.actorId, enabledAt: at },
      $setOnInsert: { _id: genId("integration"), values: {}, version: 0, createdAt: at },
    } as never,
    { upsert: true },
  );
  invalidateIntegrationCache();
  await getDbSync().collection(COLLECTIONS.auditLog).insertOne({
    _id: genId("admin-action"),
    kind: "action",
    actorId: args.actorId,
    action: `${args.enabled ? "Enabled" : "Disabled"} ${INTEGRATION_LABEL[args.key]}`,
    targetRef: args.key,
    at,
    createdAt: at,
    updatedAt: at,
  } as never);
}
