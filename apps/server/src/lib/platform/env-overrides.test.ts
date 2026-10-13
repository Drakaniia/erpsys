import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../db/db.js";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../db/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/db.js")>();
  return { ...actual, getDbSync: () => holder.db };
});

const { encryptField, fingerprint } = await import("./credential-cipher.js");
const { applyEnvOverrides, env } = await import("./env.js");
const {
  loadCredentialOverrides,
  pendingRestartFor,
  snapshotAppliedFingerprints,
  unreadableIntegrations,
} = await import("./env-overrides.js");

type Store = {
  db: Db;
  docs: Array<Record<string, unknown>>;
};

/** The two cursor methods this loader touches. */
function storeDb(): Store {
  const store: Store = { db: null as unknown as Db, docs: [] };

  store.db = {
    collection: () => ({
      find: () => ({ toArray: async () => store.docs.map((doc) => ({ ...doc })) }),
      findOne: async (filter: { key?: string }) => {
        const hit = store.docs.find((doc) => doc.key === filter.key);
        return hit ? { ...hit } : null;
      },
    }),
  } as unknown as Db;

  return store;
}

let store: Store;

function seed(doc: Record<string, unknown>): void {
  store.docs.push(doc);
}

beforeEach(() => {
  applyEnvOverrides({});
  snapshotAppliedFingerprints({});
  store = storeDb();
  holder.db = store.db;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadCredentialOverrides", () => {
  it("decrypts stored values and records their fingerprints", async () => {
    seed({
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

    const loaded = await loadCredentialOverrides();
    expect(loaded.loaded).toBe(true);
    expect(loaded.values).toEqual({ GOOGLE_CLIENT_ID: "stored-id" });
    expect(loaded.fingerprints.GOOGLE_CLIENT_ID).toBe(
      fingerprint("stored-id"),
    );

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

    const loaded = await loadCredentialOverrides();
    expect(loaded).toMatchObject({ values: {}, fingerprints: {}, loaded: false });
    expect(console.error).toHaveBeenCalled();

    holder.db = store.db;
    expect((await loadCredentialOverrides()).loaded).toBe(true);
  });

  it("marks a group unreadable instead of failing the boot", async () => {
    seed({
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

    const loaded = await loadCredentialOverrides();
    expect(loaded.loaded).toBe(true);
    expect(loaded.values).toEqual({});
    expect(loaded.unreadable.r2).toBe(true);
    expect(unreadableIntegrations().r2).toBe(true);
  });
});

describe("pendingRestartFor", () => {
  it("is false once the running process holds the stored value", async () => {
    seed({
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
    snapshotAppliedFingerprints({
      GOOGLE_CLIENT_ID: fingerprint("stored-id"),
    });

    expect(await pendingRestartFor("googleAuth")).toBe(false);
  });

  it("is true until a boot applied the stored value", async () => {
    seed({
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
