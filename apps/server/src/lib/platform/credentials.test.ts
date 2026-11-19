import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});

const { applyEnvOverrides, env } = await import("./env.js");
const {
  CREDENTIAL_ENV_KEYS,
  CREDENTIAL_FIELDS,
  MASK,
  decryptField,
  encryptField,
  fingerprint,
  loadCredentialOverrides,
  maskSecret,
  overridesLoaded,
  pendingRestartFor,
  snapshotAppliedFingerprints,
  unreadableIntegrations,
} = await import("./credentials.js");
const { INTEGRATION_KEYS } = await import("./integration-settings.js");

type Store = { db: Db; docs: Array<Record<string, unknown>> };

/** The two cursor methods the override loader touches. */
function storeDb(): Store {
  const store: Store = { db: null as unknown as Db, docs: [] };
  store.db = {
    collection: () => ({
      find: () => ({
        toArray: async () => store.docs.map((doc) => ({ ...doc })),
      }),
      findOne: async (filter: { key?: string }) => {
        const hit = store.docs.find((doc) => doc.key === filter.key);
        return hit ? { ...hit } : null;
      },
    }),
  } as unknown as Db;
  return store;
}

let store: Store;

const storedGoogleId = () => ({
  _id: "ic-1",
  key: "googleAuth",
  values: {
    GOOGLE_CLIENT_ID: encryptField(
      "googleAuth",
      "GOOGLE_CLIENT_ID",
      "stored-id",
    ),
  },
  version: 1,
  updatedAt: new Date(),
  createdAt: new Date(),
});

beforeEach(() => {
  env.BETTER_AUTH_SECRET = "s".repeat(40);
  applyEnvOverrides({});
  snapshotAppliedFingerprints({});
  store = storeDb();
  holder.db = store.db;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("CREDENTIAL_FIELDS", () => {
  it("covers every integration that has fields; the always-on core has none", () => {
    for (const key of INTEGRATION_KEYS) {
      if (key === "betterAuth") {
        expect(CREDENTIAL_FIELDS[key]).toEqual([]);
        continue;
      }
      expect(CREDENTIAL_FIELDS[key].length).toBeGreaterThan(0);
    }
  });

  it("declares every pair symmetrically", () => {
    for (const fields of Object.values(CREDENTIAL_FIELDS)) {
      const byKey = new Map(fields.map((field) => [field.envKey, field]));
      for (const field of fields) {
        if (!field.pair) continue;
        expect(byKey.get(field.pair)?.pair, `${field.envKey} pairs back`).toBe(
          field.envKey,
        );
      }
    }
  });

  it("flattens to the registry key list without duplicates", () => {
    const flattened = Object.values(CREDENTIAL_FIELDS)
      .flat()
      .map((field) => field.envKey);
    expect([...CREDENTIAL_ENV_KEYS]).toEqual(flattened);
    expect(new Set(flattened).size).toBe(flattened.length);
  });
});

describe("maskSecret", () => {
  it("returns null for a missing value", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret(undefined)).toBeNull();
    expect(maskSecret("")).toBeNull();
  });

  it("shows only dots below six characters, else five characters and twelve dots", () => {
    expect(maskSecret("abcde")).toBe(MASK);
    expect(maskSecret("abcdef")).toBe(`abcde${MASK}`);
    expect(maskSecret("a".repeat(80))).toBe(`aaaaa${MASK}`);
    expect(MASK).toHaveLength(12);
    expect(maskSecret("😀😀")).toBe(MASK);
  });
});

describe("encryptField / decryptField", () => {
  it("round-trips a value", () => {
    const field = encryptField("r2", "R2_SECRET_ACCESS_KEY", "hunter2-secret");
    expect(field.ciphertext).not.toContain("hunter2");
    expect(decryptField("r2", "R2_SECRET_ACCESS_KEY", field)).toBe(
      "hunter2-secret",
    );
  });

  it("fails closed under a different encryption key", () => {
    const field = encryptField("r2", "R2_SECRET_ACCESS_KEY", "value-here");
    env.BETTER_AUTH_SECRET = "t".repeat(40);
    expect(() => decryptField("r2", "R2_SECRET_ACCESS_KEY", field)).toThrow();
  });

  it("binds the ciphertext to its integration and key", () => {
    const field = encryptField("r2", "R2_ACCESS_KEY_ID", "value-here");
    expect(() => decryptField("r2", "R2_SECRET_ACCESS_KEY", field)).toThrow();
    expect(() => decryptField("email", "R2_ACCESS_KEY_ID", field)).toThrow();
  });

  it("uses a fresh IV per encryption and a stable fingerprint", () => {
    const a = encryptField("email", "BREVO_API_KEY", "same");
    const b = encryptField("email", "BREVO_API_KEY", "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.fingerprint).toBe(fingerprint("same"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
    expect(fingerprint("abc")).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("loadCredentialOverrides", () => {
  it("decrypts stored values and records their fingerprints", async () => {
    store.docs.push(storedGoogleId());
    const loaded = await loadCredentialOverrides();
    expect(overridesLoaded()).toBe(true);
    expect(loaded.values).toEqual({ GOOGLE_CLIENT_ID: "stored-id" });
    expect(loaded.fingerprints.GOOGLE_CLIENT_ID).toBe(fingerprint("stored-id"));
    applyEnvOverrides(loaded.values);
    expect(env.GOOGLE_CLIENT_ID).toBe("stored-id");
  });

  it("returns nothing and does not throw when the read fails", async () => {
    holder.db = {
      collection: () => ({
        find: () => ({
          toArray: async () => {
            throw new Error("mongo down");
          },
        }),
      }),
    };
    expect(await loadCredentialOverrides()).toEqual({
      values: {},
      fingerprints: {},
    });
    expect(overridesLoaded()).toBe(false);
    holder.db = store.db;
    await loadCredentialOverrides();
    expect(overridesLoaded()).toBe(true);
  });

  it("marks a group unreadable instead of failing the boot", async () => {
    store.docs.push({
      _id: "ic-1",
      key: "r2",
      values: {
        R2_SECRET_ACCESS_KEY: {
          ciphertext: "bm90LWEtcmVhbC1jaXBoZXJ0ZXh0",
          iv: "YmFk",
          tag: "YmFk",
          fingerprint: "0000000000000000",
        },
      },
      version: 1,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    expect((await loadCredentialOverrides()).values).toEqual({});
    expect(unreadableIntegrations().r2).toBe(true);
  });
});

describe("pendingRestartFor", () => {
  it("is false once the running process holds the stored value", async () => {
    store.docs.push(storedGoogleId());
    snapshotAppliedFingerprints({ GOOGLE_CLIENT_ID: fingerprint("stored-id") });
    expect(await pendingRestartFor("googleAuth")).toBe(false);
  });

  it("is true until a boot applied the stored value", async () => {
    store.docs.push(storedGoogleId());
    expect(await pendingRestartFor("googleAuth")).toBe(true);
  });

  it("is false with no stored override", async () => {
    expect(await pendingRestartFor("googleAuth")).toBe(false);
  });

  it("survives a database failure without claiming a restart", async () => {
    holder.db = {
      collection: () => ({
        findOne: async () => {
          throw new Error("mongo down");
        },
      }),
    };
    expect(await pendingRestartFor("googleAuth")).toBe(false);
  });
});
