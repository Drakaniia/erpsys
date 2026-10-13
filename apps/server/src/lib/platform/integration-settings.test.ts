import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../db/db.js";
import { encryptField } from "./credential-cipher.js";
import {
  INTEGRATION_KEYS,
  allIntegrationStates,
  defaultEnabled,
  integrationConfigured,
  integrationEnabled,
  invalidateIntegrationCache,
  publicIntegrationPayload,
  setIntegrationEnabled,
} from "./integration-settings.js";

/**
 * Unit harness: a fake db behind `getDbSync` and a mutable env, both matching
 * how the route tests in `routes/v1/*.test.ts` stand in for the driver.
 */

const envHolder = vi.hoisted(() => ({
  overrides: {
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    TURNSTILE_SECRET_KEY: "",
    VITE_TURNSTILE_SITE_KEY: "",
    R2_ENDPOINT: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    CLOUDFLARE_ACCOUNT_ID: "",
    CLOUDFLARE_API_TOKEN: "",
    BREVO_API_KEY: "",
    MAIL_FROM: "",
  },
}));

const dbHolder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./env.js")>();
  // A proxy, not a spread: a spread snapshots the values at mock time, so a
  // test that mutates the holder would read stale credentials.
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, key) =>
        key in envHolder.overrides
          ? envHolder.overrides[key as keyof typeof envHolder.overrides]
          : Reflect.get(target, key),
    }),
  };
});

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/db.js")>();
  return { ...actual, getDbSync: () => dbHolder.db };
});

type Row = Record<string, unknown>;

function matches(row: Row, filter: Row | undefined): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && "$in" in value) {
      const list = (value as { $in: unknown[] }).$in;
      return list.map(String).includes(String(row[key]));
    }
    return String(row[key]) === String(value);
  });
}

type Store = {
  db: Db;
  data: Record<string, Row[]>;
  /** Number of upcoming `find()` calls that reject, to prove a failure is not cached. */
  failFinds: number;
  findCalls: number;
};

function storeDb(): Store {
  const state: Store = {
    db: null as unknown as Db,
    data: {
      [COLLECTIONS.integrationSetting]: [],
      [COLLECTIONS.integrationCredential]: [],
      [COLLECTIONS.adminActionLog]: [],
      [COLLECTIONS.user]: [],
    },
    failFinds: 0,
    findCalls: 0,
  };

  state.db = {
    collection(name: string) {
      let rows = state.data[name];
      if (!rows) {
        rows = [];
        state.data[name] = rows;
      }
      return {
        find(filter: Row = {}) {
          state.findCalls += 1;
          if (state.failFinds > 0) {
            state.failFinds -= 1;
            return {
              toArray: async () => {
                throw new Error("mongo down");
              },
            };
          }
          return {
            toArray: async () => rows.filter((r) => matches(r, filter)),
          };
        },
        findOne: async (filter: Row) =>
          rows.find((r) => matches(r, filter)) ?? null,
        updateOne: async (
          filter: Row,
          update: { $set?: Row; $setOnInsert?: Row },
        ) => {
          const hit = rows.find((r) => matches(r, filter));
          if (hit) Object.assign(hit, update.$set ?? {});
          else
            rows.push({
              ...(update.$setOnInsert ?? {}),
              ...(update.$set ?? {}),
            });
          return { matchedCount: hit ? 1 : 0, upsertedCount: hit ? 0 : 1 };
        },
        insertOne: async (doc: Row) => {
          rows.push(doc);
          return { insertedId: doc._id };
        },
      };
    },
  } as unknown as Db;

  return state;
}

function clearEnv(): void {
  for (const key of Object.keys(envHolder.overrides)) {
    envHolder.overrides[key as keyof typeof envHolder.overrides] = "";
  }
}

let store: Store;

beforeEach(() => {
  clearEnv();
  store = storeDb();
  dbHolder.db = store.db;
  invalidateIntegrationCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("defaultEnabled", () => {
  it("is on for the three that already degrade gracefully", () => {
    expect(defaultEnabled("turnstile")).toBe(true);
    expect(defaultEnabled("r2")).toBe(true);
    expect(defaultEnabled("cloudflareChat")).toBe(true);
  });

  it("is off for Google without a client id", () => {
    expect(defaultEnabled("googleAuth")).toBe(false);
  });

  it("is on for Google with a client id", () => {
    envHolder.overrides.GOOGLE_CLIENT_ID = "  client-id  ";
    expect(defaultEnabled("googleAuth")).toBe(true);
  });
});

describe("integrationConfigured", () => {
  it("needs both halves of the Turnstile pair", () => {
    envHolder.overrides.TURNSTILE_SECRET_KEY = "secret";
    expect(integrationConfigured("turnstile")).toBe(false);
    envHolder.overrides.VITE_TURNSTILE_SITE_KEY = "site";
    expect(integrationConfigured("turnstile")).toBe(true);

    envHolder.overrides.VITE_TURNSTILE_SITE_KEY = "  ";
    expect(integrationConfigured("turnstile")).toBe(false);
  });

  it("needs all three R2 credentials", () => {
    envHolder.overrides.R2_ENDPOINT = "https://x.r2.cloudflarestorage.com";
    envHolder.overrides.R2_ACCESS_KEY_ID = "id";
    expect(integrationConfigured("r2")).toBe(false);
    envHolder.overrides.R2_SECRET_ACCESS_KEY = "secret";
    expect(integrationConfigured("r2")).toBe(true);
  });

  it("needs both Google credentials", () => {
    envHolder.overrides.GOOGLE_CLIENT_ID = "id";
    expect(integrationConfigured("googleAuth")).toBe(false);
    envHolder.overrides.GOOGLE_CLIENT_SECRET = "secret";
    expect(integrationConfigured("googleAuth")).toBe(true);
  });

  it("needs both Cloudflare credentials", () => {
    envHolder.overrides.CLOUDFLARE_ACCOUNT_ID = "acct";
    expect(integrationConfigured("cloudflareChat")).toBe(false);
    envHolder.overrides.CLOUDFLARE_API_TOKEN = "token";
    expect(integrationConfigured("cloudflareChat")).toBe(true);
  });

  it("needs both Brevo credentials for email", () => {
    envHolder.overrides.BREVO_API_KEY = "xkeysib-test";
    expect(integrationConfigured("email")).toBe(false);
    envHolder.overrides.MAIL_FROM = "ERPSYS <no-reply@buksu.edu.ph>";
    expect(integrationConfigured("email")).toBe(true);
  });
});

describe("integrationEnabled", () => {
  it("resolves computed defaults when no document exists", async () => {
    for (const key of INTEGRATION_KEYS) {
      expect(await integrationEnabled(key)).toBe(defaultEnabled(key));
    }
  });

  it("lets a stored false override a computed true", async () => {
    store.data[COLLECTIONS.integrationSetting].push({
      _id: "integration-1",
      key: "turnstile",
      enabled: false,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    expect(await integrationEnabled("turnstile")).toBe(false);
    expect(await integrationEnabled("r2")).toBe(true);
  });

  it("lets a stored true override a computed false", async () => {
    store.data[COLLECTIONS.integrationSetting].push({
      _id: "integration-2",
      key: "googleAuth",
      enabled: true,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    expect(await integrationEnabled("googleAuth")).toBe(true);
  });

  it("reads every row once and caches them", async () => {
    await integrationEnabled("turnstile");
    await integrationEnabled("r2");
    expect(store.findCalls).toBe(1);
  });

  it("makes a write visible after invalidateIntegrationCache", async () => {
    expect(await integrationEnabled("cloudflareChat")).toBe(true);
    expect(store.findCalls).toBe(1);

    await setIntegrationEnabled({
      key: "cloudflareChat",
      enabled: false,
      actorId: "u-1",
    });

    // The write path cleared the slot, so this read is the fresh one.
    expect(await integrationEnabled("cloudflareChat")).toBe(false);
    expect(store.findCalls).toBe(2);

    // A row changed behind the module's back stays invisible until invalidated.
    store.data[COLLECTIONS.integrationSetting][0].enabled = true;
    expect(await integrationEnabled("cloudflareChat")).toBe(false);
    invalidateIntegrationCache();
    expect(await integrationEnabled("cloudflareChat")).toBe(true);
  });

  it("falls back to defaults on a read failure and does not cache it", async () => {
    store.failFinds = 1;
    expect(await integrationEnabled("turnstile")).toBe(true);
    expect(store.findCalls).toBe(1);
    expect(console.error).toHaveBeenCalled();

    // The second call re-reads rather than replaying the failure.
    expect(await integrationEnabled("turnstile")).toBe(true);
    expect(store.findCalls).toBe(2);

    store.data[COLLECTIONS.integrationSetting].push({
      _id: "integration-3",
      key: "turnstile",
      enabled: false,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    invalidateIntegrationCache();
    expect(await integrationEnabled("turnstile")).toBe(false);
  });
});

describe("publicIntegrationPayload", () => {
  it("carries the flags, the site key and the boot state", async () => {
    envHolder.overrides.VITE_TURNSTILE_SITE_KEY = "env-site-key";
    const payload = await publicIntegrationPayload();
    expect(payload.flags.turnstile).toBe(true);
    expect(payload.turnstileSiteKey).toBe("env-site-key");
    expect(payload.overridesLoaded).toBe(true);
  });

  it("serves a stored site key before any restart", async () => {
    envHolder.overrides.VITE_TURNSTILE_SITE_KEY = "env-site-key";
    expect((await publicIntegrationPayload()).turnstileSiteKey).toBe(
      "env-site-key",
    );

    store.data[COLLECTIONS.integrationCredential].push({
      _id: "ic-1",
      key: "turnstile",
      values: {
        VITE_TURNSTILE_SITE_KEY: encryptField(
          "turnstile",
          "VITE_TURNSTILE_SITE_KEY",
          "saved-site-key",
        ),
      },
      version: 1,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    invalidateIntegrationCache();

    expect((await publicIntegrationPayload()).turnstileSiteKey).toBe(
      "saved-site-key",
    );
  });
});

describe("allIntegrationStates", () => {
  it("reports defaults, null attribution, and no timestamp with no documents", async () => {
    const states = await allIntegrationStates();
    expect(Object.keys(states)).toEqual([...INTEGRATION_KEYS]);
    expect(states.turnstile).toEqual({
      enabled: true,
      updatedAt: null,
      updatedByName: null,
    });
    expect(states.googleAuth.enabled).toBe(false);
  });

  it("resolves the stored value, ISO timestamp, and actor name", async () => {
    store.data[COLLECTIONS.user].push({ _id: "u-1", name: "Ana Reyes" });
    const updatedAt = new Date("2026-03-04T05:06:07.000Z");
    store.data[COLLECTIONS.integrationSetting].push({
      _id: "integration-1",
      key: "r2",
      enabled: false,
      updatedById: "u-1",
      updatedAt,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const states = await allIntegrationStates();
    expect(states.r2).toEqual({
      enabled: false,
      updatedAt: "2026-03-04T05:06:07.000Z",
      updatedByName: "Ana Reyes",
    });
    expect(states.turnstile.updatedAt).toBeNull();
  });

  it("survives an actor who no longer exists", async () => {
    store.data[COLLECTIONS.integrationSetting].push({
      _id: "integration-1",
      key: "r2",
      enabled: false,
      updatedById: "u-gone",
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    expect((await allIntegrationStates()).r2.updatedByName).toBeNull();
  });
});

describe("setIntegrationEnabled", () => {
  it("upserts the row and appends the audit line", async () => {
    await setIntegrationEnabled({
      key: "googleAuth",
      enabled: false,
      actorId: "u-1",
    });

    const rows = store.data[COLLECTIONS.integrationSetting];
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("googleAuth");
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].updatedById).toBe("u-1");
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(String(rows[0]._id)).toMatch(/^integration-/);

    const audit = store.data[COLLECTIONS.adminActionLog];
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("Disabled Google sign-in");
    expect(audit[0].targetRef).toBe("googleAuth");
    expect(audit[0].actorId).toBe("u-1");

    await setIntegrationEnabled({
      key: "googleAuth",
      enabled: true,
      actorId: "u-1",
    });
    expect(store.data[COLLECTIONS.integrationSetting]).toHaveLength(1);
    expect(store.data[COLLECTIONS.adminActionLog][1].action).toBe(
      "Enabled Google sign-in",
    );
  });
});
