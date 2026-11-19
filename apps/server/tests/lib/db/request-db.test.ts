import { afterEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => [] as { connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; db: ReturnType<typeof vi.fn> }[]);
vi.mock("mongodb", async (original) => {
  const actual = await original<typeof import("mongodb")>();
  return { ...actual, MongoClient: class {
    connect = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    db = vi.fn(() => ({ collection: () => ({ findOne: async () => clients.indexOf(this) }) }));
    constructor() { clients.push(this); }
  } };
});
vi.mock("../../../src/lib/db/timestamp-ordering.js", () => ({ guardDb: (db: unknown) => db }));
import { closeDb, getDb, getDbSync, withRequestDb } from "../../../src/lib/db/db.js";

afterEach(() => { vi.unstubAllEnvs(); clients.length = 0; });

describe("Worker MongoDB request ownership", () => {
  it("resolves a cached collection against each request's client", async () => {
    vi.stubEnv("CLOUDFLARE_WORKER", "1");
    const collection = getDbSync().collection("user");
    const results = await Promise.all([0, 1].map(() => withRequestDb(async () => {
      await getDb();
      await new Promise((resolve) => setTimeout(resolve, 1));
      const result = await collection.findOne({});
      await closeDb();
      return result;
    })));
    expect(results).toEqual([0, 1]);
    expect(clients).toHaveLength(2);
    for (const client of clients) {
      expect(client.connect).toHaveBeenCalledOnce();
      expect(client.close).toHaveBeenCalledOnce();
    }
    expect(() => collection.findOne({})).toThrow("outside Worker request");
  });
});
