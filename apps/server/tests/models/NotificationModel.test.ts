import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { NotificationModel } from "../../src/models/NotificationModel.js";
import { fakeDb } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../src/lib/db/db.js", async (original) => ({
  ...(await original<typeof import("../../src/lib/db/db.js")>()),
  getDbSync: () => holder.db,
}));

let context: ReturnType<typeof fakeDb>;
beforeEach(() => {
  context = fakeDb({ [COLLECTIONS.notification]: [] });
  holder.db = context.db;
});
const notification = (id: string, createdAt: Date) => ({
  _id: id, userId: "user1", type: "REMINDER", title: "Reminder", body: "Check your record.", createdAt,
});

describe("notification insertion timestamps", () => {
  it("initializes updatedAt from createdAt for a single insert", async () => {
    const row = notification("single", new Date("2026-01-01T00:00:00Z"));
    await NotificationModel.insert(row);
    expect(context.store[COLLECTIONS.notification][0]).toMatchObject({
      ...row, updatedAt: row.createdAt,
    });
    expect(row).not.toHaveProperty("updatedAt");
  });

  it("initializes each bulk row without changing the callers' inputs", async () => {
    const rows = [
      notification("first", new Date("2026-01-01T00:00:00Z")),
      notification("second", new Date("2026-01-02T00:00:00Z")),
    ];
    await NotificationModel.insertMany(rows);
    expect(context.store[COLLECTIONS.notification]).toEqual(rows.map((row) => ({
      ...row, updatedAt: row.createdAt,
    })));
    for (const row of rows) expect(row).not.toHaveProperty("updatedAt");
    await NotificationModel.insertMany([]);
    expect(context.store[COLLECTIONS.notification]).toHaveLength(2);
  });
});
