import { describe, expect, it } from "vitest";
import { fakeDb } from "../../helpers/fakeDb.js";

describe("embedded storage test database semantics", () => {
  it("matches nested profile queries with combined existence and inclusion operators", async () => {
    const { db } = fakeDb({ user: [{ _id: "a", studentProfile: { _id: "p1" } }, { _id: "b" }, { _id: "c", studentProfile: { _id: "p2" } }] });
    const rows = await db.collection("user").find({ "studentProfile._id": { $exists: true, $nin: ["p2"], $in: ["p1"] } }).toArray();
    expect(rows.map(row => row._id)).toEqual(["a"]);
  });
  it("compares full assignment arrays rather than stringified objects", async () => {
    const { db, store } = fakeDb({ department: [{ _id: "d", advisers: [{ adviserId: "a", yearLevels: ["FIRST"] }] }] });
    const result = await db.collection("department").updateOne({ _id: "d", advisers: [{ adviserId: "a", yearLevels: ["SECOND"] }] }, { $set: { advisers: [] } });
    expect(result.matchedCount).toBe(0);
    expect((store.department[0].advisers as unknown[])).toHaveLength(1);
  });
  it("reads embedded values as independent snapshots", async () => {
    const { db, store } = fakeDb({ department: [{ _id: "d", advisers: [{ adviserId: "a" }] }] });
    const row = await db.collection("department").findOne({ _id: "d" });
    ((row!.advisers as Record<string, unknown>[])[0]).adviserId = "changed";
    expect(store.department[0].advisers).toEqual([{ adviserId: "a" }]);
  });
  it("finds a single matching embedded assignment", async () => {
    const { db } = fakeDb({ department: [{ _id: "d", advisers: [{ adviserId: "a" }] }] });
    expect(await db.collection("department").countDocuments({ advisers: { $elemMatch: { adviserId: "a" } } })).toBe(1);
    expect(await db.collection("department").countDocuments({ "advisers.adviserId": "a" })).toBe(1);
  });
});
