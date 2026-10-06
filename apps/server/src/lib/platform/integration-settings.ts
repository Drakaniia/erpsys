import { COLLECTIONS, getDbSync, idIn } from "../db/db.js";
import { genId } from "../db/ids.js";
import { env } from "./env.js";
import {
  credentialCollection,
  decryptDocValues,
  overridesLoaded,
} from "./env-overrides.js";

export const INTEGRATION_KEYS = [
  "turnstile",
  "r2",
  "googleAuth",
  "cloudflareChat",
  "email",
  "googleForms",
  "googleCalendar",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export const INTEGRATION_LABEL: Record<IntegrationKey, string> = {
  turnstile: "Bot protection",
  r2: "File uploads",
  googleAuth: "Google sign-in",
  cloudflareChat: "Student chat",
  email: "Email delivery",
  googleForms: "Google Forms",
  googleCalendar: "Google Calendar",
};

export const INTEGRATION_CONSEQUENCE: Record<IntegrationKey, string> = {
  turnstile:
    "Sign-in and registration become unchallenged. Bots can reach the form.",
  r2: "New uploads are refused. Existing files stay readable.",
  googleAuth:
    "Email and password become the only sign-in. Google-linked accounts without a password need the reset flow.",
  cloudflareChat: "The student chat disappears. Knowledge stays editable here.",
  email:
    "Password resets and turn alerts are no longer emailed. Students must ask the office to reset a password.",
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
  enabled: boolean;
  updatedById?: string;
  updatedAt: Date;
  createdAt: Date;
};

function turnstileSiteKey(): string {
  return env.VITE_TURNSTILE_SITE_KEY.trim();
}

function present(value: string): boolean {
  return value.trim().length > 0;
}

export function defaultEnabled(key: IntegrationKey): boolean {
  switch (key) {
    case "googleAuth":
      return env.GOOGLE_CLIENT_ID.trim().length > 0;
    case "googleCalendar":
      return integrationConfigured("googleCalendar");
    default:
      return true;
  }
}

export function integrationConfigured(key: IntegrationKey): boolean {
  switch (key) {
    case "turnstile":
      return present(env.TURNSTILE_SECRET_KEY) && present(turnstileSiteKey());
    case "r2":
      return (
        present(env.R2_ENDPOINT) &&
        present(env.R2_ACCESS_KEY_ID) &&
        present(env.R2_SECRET_ACCESS_KEY)
      );
    case "googleAuth":
      return present(env.GOOGLE_CLIENT_ID) && present(env.GOOGLE_CLIENT_SECRET);
    case "cloudflareChat":
      return (
        present(env.CLOUDFLARE_ACCOUNT_ID) && present(env.CLOUDFLARE_API_TOKEN)
      );
    case "email":
      return present(env.BREVO_API_KEY) && present(env.MAIL_FROM);
    case "googleForms":
      return (
        present(env.GOOGLE_FORMS_REFRESH_TOKEN) &&
        present(env.GOOGLE_CLIENT_ID) &&
        present(env.GOOGLE_CLIENT_SECRET)
      );
    case "googleCalendar":
      return (
        present(env.CALENDAR_TOKEN_KEY) &&
        present(env.GOOGLE_CLIENT_ID) &&
        present(env.GOOGLE_CLIENT_SECRET)
      );
  }
}

function computedFlags(): Record<IntegrationKey, boolean> {
  return {
    turnstile: defaultEnabled("turnstile"),
    r2: defaultEnabled("r2"),
    googleAuth: defaultEnabled("googleAuth"),
    cloudflareChat: defaultEnabled("cloudflareChat"),
    email: defaultEnabled("email"),
    googleForms: defaultEnabled("googleForms"),
    googleCalendar: defaultEnabled("googleCalendar"),
  };
}

async function readStoredFlags(): Promise<Record<IntegrationKey, boolean>> {
  const rows = await getDbSync()
    .collection<IntegrationSettingDoc>(COLLECTIONS.integrationSetting)
    .find({} as never)
    .toArray();
  const flags = computedFlags();
  for (const row of rows) flags[row.key] = row.enabled;
  return flags;
}

async function loadFlags(): Promise<Record<IntegrationKey, boolean>> {
  try {
    return await readStoredFlags();
  } catch (error) {
    console.error(
      "[integration-settings] flag read failed — falling back to computed defaults",
      error,
    );
    flagsPromise = null;
    return computedFlags();
  }
}

let flagsPromise: Promise<Record<IntegrationKey, boolean>> | null = null;
let payloadPromise: Promise<PublicIntegrationPayload> | null = null;

export function invalidateIntegrationCache(): void {
  flagsPromise = null;
  payloadPromise = null;
}

export async function integrationEnabled(
  key: IntegrationKey,
): Promise<boolean> {
  flagsPromise ??= loadFlags();
  const flags = await flagsPromise;
  return flags[key];
}

export type PublicIntegrationPayload = {
  flags: Record<IntegrationKey, boolean>;
  turnstileSiteKey: string;
  overridesLoaded: boolean;
};

async function turnstileSiteKeyFromStore(): Promise<string | null> {
  try {
    const doc = await credentialCollection().findOne({ key: "turnstile" } as never);
    if (!doc) return null;
    const decrypted = decryptDocValues(doc);
    if (decrypted.unreadable) return null;
    return decrypted.values.VITE_TURNSTILE_SITE_KEY ?? null;
  } catch {
    return null;
  }
}

async function loadPayload(): Promise<PublicIntegrationPayload> {
  const [states, storedSiteKey] = await Promise.all([
    allIntegrationStates(),
    turnstileSiteKeyFromStore(),
  ]);
  return {
    flags: Object.fromEntries(
      INTEGRATION_KEYS.map((key) => [
        key,
        states[key]?.enabled ?? defaultEnabled(key),
      ]),
    ) as Record<IntegrationKey, boolean>,
    turnstileSiteKey: (storedSiteKey ?? env.VITE_TURNSTILE_SITE_KEY).trim(),
    overridesLoaded: overridesLoaded(),
  };
}

export async function publicIntegrationPayload(): Promise<PublicIntegrationPayload> {
  payloadPromise ??= loadPayload().catch((error) => {
    payloadPromise = null;
    throw error;
  });
  return payloadPromise;
}

export async function loadPublicIntegrationFlags(): Promise<
  Record<IntegrationKey, boolean>
> {
  return (await publicIntegrationPayload()).flags;
}

export async function allIntegrationStates(): Promise<
  Record<IntegrationKey, IntegrationState>
> {
  const db = getDbSync();
  const rows = await db
    .collection<IntegrationSettingDoc>(COLLECTIONS.integrationSetting)
    .find({} as never)
    .toArray();

  const byKey = new Map(rows.map((row) => [row.key, row] as const));
  const actorIds = [
    ...new Set(
      rows.map((row) => row.updatedById).filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const users = await db
      .collection<{ _id: unknown; name?: string }>(COLLECTIONS.user)
      .find(idIn(actorIds) as never)
      .toArray();
    for (const user of users) {
      if (user.name) names.set(String(user._id), user.name);
    }
  }

  const states = {} as Record<IntegrationKey, IntegrationState>;
  for (const key of INTEGRATION_KEYS) {
    const row = byKey.get(key);
    states[key] = {
      enabled: row ? row.enabled : defaultEnabled(key),
      updatedAt: row ? new Date(row.updatedAt).toISOString() : null,
      updatedByName: row?.updatedById
        ? (names.get(String(row.updatedById)) ?? null)
        : null,
    };
  }
  return states;
}

export async function setIntegrationEnabled(args: {
  key: IntegrationKey;
  enabled: boolean;
  actorId: string;
}): Promise<void> {
  const db = getDbSync();
  const at = new Date();
  await db.collection(COLLECTIONS.integrationSetting).updateOne(
    { key: args.key } as never,
    {
      $set: {
        key: args.key,
        enabled: args.enabled,
        updatedById: args.actorId,
        updatedAt: at,
      },
      $setOnInsert: { _id: genId("integration"), createdAt: at },
    } as never,
    { upsert: true } as never,
  );
  invalidateIntegrationCache();
  await db.collection(COLLECTIONS.adminActionLog).insertOne({
    _id: genId("admin-action"),
    actorId: args.actorId,
    action: `${args.enabled ? "Enabled" : "Disabled"} ${INTEGRATION_LABEL[args.key]}`,
    targetRef: args.key,
    at,
  } as never);
}
