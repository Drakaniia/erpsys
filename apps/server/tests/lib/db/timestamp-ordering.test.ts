import type { Db } from "mongodb";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  beginTransaction,
  guardDb,
  nextTs,
  stampWriterReads,
  TS_ABORTED,
} from "../../../src/lib/db/timestamp-ordering.js";
import { catchAsync } from "../../../src/middleware/catchAsync.js";
import { timestampOrdering } from "../../../src/middleware/timestamp.js";
import { fakeDb, type Row } from "../../helpers/fakeDb.js";

function setup(row: Row = { _id: "x", v: 0 }) {
  const { db, store } = fakeDb({ things: [row] });
  const guarded = guardDb(db as unknown as Db);
  const things = () =>
    guarded.collection<{ _id: string; [key: string]: unknown }>("things");
  return { things, stored: () => store.things[0] };
}

function inTx<T>(
  ts: number | undefined,
  method: string,
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) =>
    beginTransaction(ts, method, () => {
      fn().then(resolve, reject);
    }),
  );
}

const abortCode = (error: unknown) =>
  (error as { data?: { code?: string } }).data?.code;

describe("timestamp ordering", () => {
  it("hides collection-local editor markers from reads, counts and bulk writes", async () => {
    const { db, store } = fakeDb({
      user: [
        { _id: "real", email: "real@example.com" },
        { _id: "@edit-presence:user:new", kind: "edit-presence" },
      ],
      content: [
        { _id: "link", kind: "social-link" },
        { _id: "@edit-presence:social-link:new", kind: "edit-presence" },
      ],
    });
    const guarded = guardDb(db as unknown as Db);
    const users = guarded.collection("user");
    expect(() => users.insertOne({ _id: "marker", kind: "edit-presence" } as never)).toThrow("Reserved presence record");
    expect(() => users.insertOne({ _id: "@edit-presence:fake" } as never)).toThrow("Reserved presence record");
    expect(await users.countDocuments()).toBe(1);
    expect(await users.find({}).toArray()).toHaveLength(1);
    expect(await users.findOne({ _id: "@edit-presence:user:new" } as never)).toBeNull();
    expect(() => users.updateOne({}, { $set: { kind: "edit-presence" } })).toThrow("Reserved presence record");
    await inTx(nextTs(), "GET", async () => {
      expect(await users.countDocuments()).toBe(1);
      expect(await users.find({}).toArray()).toHaveLength(1);
    });
    await users.updateMany({}, { $set: { touched: true } });
    expect(store.user[1].touched).toBeUndefined();
    expect(await guarded.collection("content").countDocuments({ kind: "edit-presence" })).toBe(0);
    await guarded.collection("content").deleteMany({});
    expect(store.content).toEqual([{ _id: "@edit-presence:social-link:new", kind: "edit-presence" }]);
  });
  it("reports TS_ABORTED when a racing writer makes the atomic write filter match nothing", async () => {
    const { db, store } = fakeDb({ things: [{ _id: "x", value: 0 }] });
    const raw = db.collection("things");
    const update = raw.updateOne;
    const ts = nextTs();
    vi.spyOn(db, "collection").mockImplementation(() => ({
      ...raw,
      updateOne: async (...args: Parameters<typeof update>) => {
        store.things[0].writeTs = ts + 1;
        return update(...args);
      },
    }));
    const guarded = guardDb(db as unknown as Db);
    await expect(
      inTx(ts, "PATCH", () =>
        guarded
          .collection("things")
          .updateOne({ _id: "x" } as never, { $set: { value: 1 } }),
      ),
    ).rejects.toMatchObject({ status: 409, data: { code: TS_ABORTED } });
    expect(store.things[0].value).toBe(0);
    vi.restoreAllMocks();
  });
  it("aborts the older writer once a younger transaction has read X (textbook schedule)", async () => {
    const { things, stored } = setup();
    const t1 = nextTs();
    const t2 = nextTs();

    await inTx(t1, "PATCH", () => things().findOne({ _id: "x" }));
    await inTx(t2, "PATCH", () => things().findOne({ _id: "x" }));
    expect(stored().readTs).toBe(t2);

    const late = await inTx(t1, "PATCH", () =>
      things().updateOne({ _id: "x" }, { $set: { v: 1 } }),
    ).catch((error: unknown) => error);
    expect(abortCode(late)).toBe(TS_ABORTED);
    expect(stored().v).toBe(0);

    await inTx(t2, "PATCH", () =>
      things().updateOne({ _id: "x" }, { $set: { v: 2 } }),
    );
    expect(stored()).toMatchObject({ v: 2, writeTs: t2 });
  });

  it("aborts a read older than the last write (read rule)", async () => {
    const { things } = setup();
    const t1 = nextTs();
    const t2 = nextTs();
    await inTx(t2, "PATCH", () =>
      things().updateOne({ _id: "x" }, { $set: { v: 2 } }),
    );
    const read = await inTx(t1, "PATCH", () =>
      things().find({}).toArray(),
    ).catch((error: unknown) => error);
    expect(abortCode(read)).toBe(TS_ABORTED);
  });

  it("aborts when a newer write races the read stamp", async () => {
    const { db, store } = fakeDb({ things: [{ _id: "x", writeTs: 1 }] });
    const raw = db.collection("things");
    const update = raw.updateMany;
    const ts = nextTs();
    vi.spyOn(db, "collection").mockImplementation(() => ({
      ...raw,
      updateMany: async (...args: Parameters<typeof update>) => {
        store.things[0].writeTs = ts + 1;
        return update(...args);
      },
    }));
    const guarded = guardDb(db as unknown as Db);
    await expect(
      inTx(ts, "GET", () => {
        stampWriterReads();
        return guarded.collection("things").findOne({ _id: "x" } as never);
      }),
    ).rejects.toMatchObject({ data: { code: TS_ABORTED } });
    expect(store.things[0].readTs).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("stamps reads only for writer surfaces on GET", async () => {
    const { things, stored } = setup();
    await inTx(undefined, "GET", () => things().findOne({ _id: "x" }));
    expect(stored().readTs).toBeUndefined();
    await inTx(undefined, "GET", async () => {
      stampWriterReads();
      return things().findOne({ _id: "x" });
    });
    expect(stored().readTs).toEqual(expect.any(Number));
  });

  it("leaves documents untouched outside a request transaction", async () => {
    const { things, stored } = setup({ _id: "x", v: 0, readTs: 9e15 });
    await things().updateOne({ _id: "x" }, { $set: { v: 1 } });
    expect(stored()).toMatchObject({ v: 1 });
    expect(stored().writeTs).toBeUndefined();
  });

  it("restarts an aborted server-anchored transaction with a newer TS", async () => {
    const { things, stored } = setup();
    let calls = 0;
    await inTx(
      undefined,
      "POST",
      () =>
        new Promise<void>((resolve, reject) => {
          const handler = catchAsync(async () => {
            calls += 1;
            // A younger transaction reads X between our start and our write.
            if (calls === 1) stored().readTs = nextTs();
            await things().updateOne({ _id: "x" }, { $set: { v: 1 } });
            resolve();
          });
          handler({} as Request, { headersSent: false } as Response, reject);
        }),
    );
    expect(calls).toBe(2);
    expect(stored().v).toBe(1);
  });

  it("gives up with 409 TS_ABORTED after three restarts", async () => {
    const { things } = setup({ _id: "x", v: 0, readTs: 9e15 });
    let calls = 0;
    const error = await inTx(
      undefined,
      "POST",
      () =>
        new Promise((resolve) => {
          const handler = catchAsync(async () => {
            calls += 1;
            await things().updateOne({ _id: "x" }, { $set: { v: 1 } });
          });
          handler({} as Request, { headersSent: false } as Response, resolve);
        }),
    );
    expect(calls).toBe(4);
    expect(error).toMatchObject({ status: 409, data: { code: TS_ABORTED } });
  });

  it("rejects a client ts the server never issued and strips ts from the body", () => {
    const outcomes: unknown[] = [];
    const future = { body: { ts: Date.now() + 60_000, name: "a" } };
    timestampOrdering(future as Request, {} as Response, (e) =>
      outcomes.push(e),
    );
    expect(outcomes[0]).toMatchObject({ status: 400 });

    const issued = { body: { ts: nextTs(), name: "a" } };
    timestampOrdering(issued as Request, {} as Response, (e) =>
      outcomes.push(e),
    );
    expect(outcomes[1]).toBeUndefined();
    expect(issued.body).toEqual({ name: "a" });
  });
});
