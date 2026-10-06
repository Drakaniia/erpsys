import { afterEach, describe, expect, it } from "vitest";
import type { Db, MongoClientOptions } from "mongodb";
import { ObjectId } from "mongodb";
import {
  closeDb,
  mongoClientOptions,
  poolStats,
  refIn,
  setClientFactoryForTest,
} from "./db.js";
import { env } from "../platform/env.js";

/**
 * The pool option set is the load-shedding mechanism, and a wrong value in it
 * is invisible until the day it matters. So the test observes the object
 * actually handed to `MongoClient` rather than a copy of the defaults.
 */

afterEach(() => {
  setClientFactoryForTest(null);
});

describe("mongoClientOptions", () => {
  it("carries the spec's defaults", () => {
    expect(mongoClientOptions()).toEqual({
      maxPoolSize: 25,
      minPoolSize: 5,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 60000,
      appName: "erpsys",
    });
  });

  it("reads every value through env rather than process.env", () => {
    // The defaults above are the env defaults; the point of this assertion is
    // that there is no second, hidden source of truth.
    expect(env.MONGO_MAX_POOL_SIZE).toBe(25);
    expect(env.MONGO_WAIT_QUEUE_TIMEOUT_MS).toBe(5000);
    expect(env.MONGO_APP_NAME).toBe("erpsys");
  });

  it("does not leave waitQueueTimeoutMS at the driver's infinite default", () => {
    // 0 means "wait forever", which is the failure mode the whole option set
    // exists to remove.
    expect(mongoClientOptions().waitQueueTimeoutMS).not.toBe(0);
  });
});

describe("refIn", () => {
  it("offers both id forms for an ObjectId-shaped reference", () => {
    // A user whose `_id` was written by an older Mongo driver is an ObjectId,
    // while every reference to it is the 24-char string. Matching only the
    // string renders that user as "Unknown" on every surface that names them.
    expect(refIn(["6ac89ffb84609a7aca3c812e"]).$in).toEqual([
      "6ac89ffb84609a7aca3c812e",
      new ObjectId("6ac89ffb84609a7aca3c812e"),
    ]);
  });

  it("leaves an id that cannot be an ObjectId untouched", () => {
    expect(refIn(["u-1", "sp_2"]).$in).toEqual(["u-1", "sp_2"]);
  });
});

describe("client construction", () => {
  it("hands the option set to MongoClient", async () => {
    let seen: { url: string; options: MongoClientOptions } | null = null;
    let closed = 0;

    setClientFactoryForTest((url, options) => {
      seen = { url, options };
      return {
        db: () => ({}) as Db,
        connect: async () => undefined,
        close: async () => {
          closed += 1;
        },
      } as unknown as import("mongodb").MongoClient;
    });

    const { getDb } = await import("./db.js");
    await getDb();

    expect(seen).not.toBeNull();
    expect(seen!.url).toBe(env.DATABASE_URL);
    expect(seen!.options.maxPoolSize).toBe(25);
    expect(seen!.options.waitQueueTimeoutMS).toBe(5000);
    expect(seen!.options.appName).toBe("erpsys");
    expect(closed).toBe(0);
  });
});

describe("closeDb", () => {
  it("is safe when never connected", async () => {
    setClientFactoryForTest(null);
    await expect(closeDb()).resolves.toBeUndefined();
  });

  it("closes the client and is safe to call twice", async () => {
    let closed = 0;
    setClientFactoryForTest(
      () =>
        ({
          db: () => ({}) as Db,
          connect: async () => undefined,
          close: async () => {
            closed += 1;
          },
        }) as unknown as import("mongodb").MongoClient,
    );

    const { getDb } = await import("./db.js");
    await getDb();

    await closeDb();
    await closeDb();
    expect(closed).toBe(1);
  });

  it("does not throw when the driver close rejects", async () => {
    setClientFactoryForTest(
      () =>
        ({
          db: () => ({}) as Db,
          connect: async () => undefined,
          close: async () => {
            throw new Error("socket already gone");
          },
        }) as unknown as import("mongodb").MongoClient,
    );

    const { getDb } = await import("./db.js");
    await getDb();
    await expect(closeDb()).resolves.toBeUndefined();
  });
});

describe("poolStats", () => {
  it("reports zeros rather than throwing before a client exists", async () => {
    setClientFactoryForTest(null);
    await closeDb();
    expect(poolStats()).toEqual({
      checkedOut: 0,
      available: 0,
      size: 0,
      maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    });
  });

  it("reports zeros when the topology is not available yet", async () => {
    setClientFactoryForTest(
      () =>
        ({
          db: () => ({}) as Db,
          connect: async () => undefined,
          close: async () => undefined,
        }) as unknown as import("mongodb").MongoClient,
    );
    const { getDb } = await import("./db.js");
    await getDb();

    const stats = poolStats();
    expect(stats.size).toBe(0);
    expect(stats.maxPoolSize).toBe(25);
  });

  it("survives a topology that throws on access", async () => {
    setClientFactoryForTest(() => {
      const handle = {
        db: () => ({}) as Db,
        connect: async () => undefined,
        close: async () => undefined,
      };
      Object.defineProperty(handle, "topology", {
        get() {
          throw new Error("topology is not ready");
        },
      });
      return handle as unknown as import("mongodb").MongoClient;
    });
    const { getDb } = await import("./db.js");
    await getDb();

    expect(() => poolStats()).not.toThrow();
    expect(poolStats().size).toBe(0);
  });
});
