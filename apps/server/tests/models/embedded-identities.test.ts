import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../helpers/fakeDb.js";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../src/lib/db/db.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/db/db.js")>(),
  getDbSync: () => state.db,
}));

import { UserModel } from "../../src/models/UserModel.js";
import { DepartmentModel } from "../../src/models/DepartmentModel.js";
import { ensureProfileForYear } from "../../src/services/students.js";
import { purgeUserById } from "../../src/lib/db/user-purge.js";
import { guardDb, beginTransaction } from "../../src/lib/db/timestamp-ordering.js";

let memory: ReturnType<typeof fakeDb> & {
  set(name: string, rows: Record<string, unknown>[]): void;
  rows(name: string): Record<string, unknown>[];
};
beforeEach(() => {
  const base = fakeDb({});
  memory = { ...base, set: (name, rows) => { base.store[name] = rows; }, rows: name => base.store[name] ?? [] };
  state.db = memory.db;
});

const profile = { _id: "profile-stable", studentNumber: "123456", academicYearId: "year-old" };
const department = { _id: "department", name: "Engineering", isActive: true };

describe("embedded student identity", () => {
  it("attaches to an existing user, stamps the profile explicitly, and keeps auth lookup identity-free", async () => {
    memory.set("user", [{ _id: "student", name: "Student", updatedAt: new Date(0) }]);
    await UserModel.insertProfile({ ...profile, userId: "student" });
    const result = await UserModel.findProfileById(profile._id);
    expect(result).toMatchObject({ ...profile, userId: "student", createdAt: expect.any(Date), updatedAt: expect.any(Date) });
    expect(memory.rows("user")[0].updatedAt).toEqual(new Date(0));
    expect((memory.rows("user")[0].studentProfile as Record<string, unknown>).userId).toBeUndefined();
    expect(await UserModel.findById("student")).not.toHaveProperty("studentProfile");
  });

  it("enforces parent timestamp ordering when attaching a profile to a stamp-free user", async () => {
    memory.set("user", [{ _id: "student", readTs: 200, writeTs: 180, updatedAt: new Date(0) }]);
    state.db = guardDb(memory.db as unknown as import("mongodb").Db);
    await expect(beginTransaction(100, "PATCH", () => UserModel.insertProfile({ ...profile, userId: "student" }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(memory.rows("user")[0].studentProfile).toBeUndefined();
    await beginTransaction(201, "PATCH", () => UserModel.insertProfile({ ...profile, userId: "student" }));
    expect(memory.rows("user")[0].writeTs).toBe(201);
    expect(memory.rows("user")[0].updatedAt).toEqual(new Date(0));
    expect((memory.rows("user")[0].studentProfile as Record<string, unknown>).updatedAt).toBeInstanceOf(Date);
  });

  it("concurrent attachment cannot overwrite an already claimed stable profile", async () => {
    memory.set("user", [{ _id: "student" }]);
    const results = await Promise.allSettled([
      UserModel.insertProfile({ ...profile, userId: "student" }),
      UserModel.insertProfile({ ...profile, _id: "competing-profile", userId: "student" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await UserModel.findProfileByUserId("student")).toMatchObject({ _id: profile._id });
  });

  it("finds historical BSON profile IDs while returning string DTO IDs", async () => {
    const id = new ObjectId();
    memory.set("user", [{ _id: "student", studentProfile: { ...profile, _id: id } }]);
    expect(await UserModel.findProfileById(String(id))).toMatchObject({ _id: String(id), userId: "student" });
    expect(await UserModel.findProfilesByIds([String(id)])).toHaveLength(1);
  });

  it("lists and counts only unenrolled identities using historical BSON references", async () => {
    const historicalId = new ObjectId();
    memory.set("user", [
      { _id: "historical", studentProfile: { ...profile, _id: historicalId } },
      { _id: "available", studentProfile: { ...profile, _id: "available-profile", studentNumber: "222222" } },
      { _id: "staff" },
    ]);
    expect(await UserModel.countUnenrolledProfiles([String(historicalId)])).toBe(1);
    expect(await UserModel.listUnenrolledProfiles([String(historicalId)], ["available-profile"])).toEqual([expect.objectContaining({ _id: "available-profile", userId: "available" })]);
    expect(await UserModel.listProfilesByUserIds(["historical", "staff"])).toEqual([expect.objectContaining({ _id: String(historicalId) })]);
  });

  it("fails closed for concurrent cross-owner institutional claims without changing history", async () => {
    const old = new Date(1234);
    memory.set("user", [
      { _id: "owner", email: "personal@example.com", studentProfile: { ...profile, updatedAt: old, writeTs: 90 } },
      { _id: "claimant" },
    ]);
    memory.set("student_enrollment", [{ _id: "history", studentProfileId: profile._id, academicYearId: "year-old" }]);
    const results = await Promise.allSettled(["FIRST", "SECOND"].map(() => ensureProfileForYear({
      userId: "claimant", email: "123456@student.buksu.edu.ph", academicYearId: "year-new",
    })));
    expect(results.every(result => result.status === "rejected")).toBe(true);
    expect(await UserModel.findProfileByUserId("owner")).toMatchObject({ _id: profile._id, updatedAt: old, writeTs: 90 });
    expect(await UserModel.findProfileByUserId("claimant")).toBeNull();
    expect(memory.rows("student_enrollment")).toHaveLength(1);
  });

  it("permanent purge erases profile history and removes only the owner's department assignments", async () => {
    memory.set("user", [{ _id: "student", studentProfile: profile }]);
    memory.set("student_enrollment", [{ _id: "history", studentProfileId: profile._id }]);
    memory.set("department", [{ ...department, advisers: [{ adviserId: "student", yearLevels: ["FIRST"] }, { adviserId: "other", yearLevels: ["SECOND"] }] }]);
    memory.set("adviser_schedule", [{ _id: "presence", adviserId: "student", kind: "presence" }, { _id: "window", adviserId: "student", kind: "window" }]);
    await purgeUserById(memory.db as unknown as import("mongodb").Db, "student");
    expect(memory.rows("user")).toEqual([]);
    expect(memory.rows("student_enrollment")).toEqual([]);
    expect(memory.rows("adviser_schedule")).toEqual([]);
    expect(memory.rows("department")[0].advisers).toEqual([{ adviserId: "other", yearLevels: ["SECOND"] }]);
  });
});

describe("embedded adviser assignments", () => {
  it("preserves metadata when updating levels and rejects overlapping or all-level assignments", async () => {
    const createdAt = new Date(1234);
    memory.set("department", [{ ...department, advisers: [{ _id: "stable-link", adviserId: "one", yearLevels: ["FIRST"], createdAt, readTs: 4 }] }]);
    await DepartmentModel.setAdviserLevels("one", "department", ["SECOND"]);
    expect((await DepartmentModel.findAdviserLink("one", "department"))).toMatchObject({ _id: "stable-link", yearLevels: ["SECOND"], createdAt, readTs: 4, updatedAt: expect.any(Date) });
    await expect(DepartmentModel.insertAdviser({ adviserId: "two", departmentId: "department", yearLevels: ["SECOND"] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(DepartmentModel.insertAdviser({ adviserId: "two", departmentId: "department", yearLevels: [] })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("concurrent overlapping claims leave exactly one holder", async () => {
    memory.set("department", [department]);
    const result = await Promise.allSettled(["one", "two"].map(adviserId => DepartmentModel.insertAdviser({ adviserId, departmentId: "department", yearLevels: ["FIRST"] })));
    expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(await DepartmentModel.listAdvisersByDepartment("department")).toHaveLength(1);
  });

  it("transfers levels atomically, preserves both identities, and rejects a changed owner", async () => {
    memory.set("department", [{ ...department, advisers: [{ _id: "original", adviserId: "one", yearLevels: ["FIRST", "SECOND"] }, { _id: "destination", adviserId: "two", yearLevels: ["THIRD"] }] }]);
    await DepartmentModel.transferAdviserLevels("department", { adviserId: "two" }, ["FIRST"], "one");
    expect(await DepartmentModel.listAdvisersByDepartment("department")).toEqual(expect.arrayContaining([
      expect.objectContaining({ _id: "original", adviserId: "one", yearLevels: ["SECOND"] }),
      expect.objectContaining({ _id: "destination", adviserId: "two", yearLevels: ["FIRST", "THIRD"] }),
    ]));
    await expect(DepartmentModel.transferAdviserLevels("department", { adviserId: "three" }, ["SECOND"], null)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await DepartmentModel.listAdvisersByDepartment("department")).toHaveLength(2);
  });

  it("preserves untransferred levels from an all-level holder", async () => {
    memory.set("department", [{ ...department, advisers: [{ adviserId: "one", yearLevels: [] }] }]);
    await DepartmentModel.transferAdviserLevels("department", { adviserId: "two" }, ["FIRST"], "one");
    expect(await DepartmentModel.findAdviserLink("one", "department")).toMatchObject({ yearLevels: ["SECOND", "THIRD", "FOURTH", "FIFTH"] });
    expect(await DepartmentModel.findAdviserLink("two", "department")).toMatchObject({ yearLevels: ["FIRST"] });
  });

  it("removes an explicit-level holder when transferring all levels", async () => {
    memory.set("department", [{ ...department, advisers: [{ adviserId: "one", yearLevels: ["FIRST", "SECOND"] }] }]);
    await DepartmentModel.transferAdviserLevels("department", { adviserId: "two" }, [], "one");
    expect(await DepartmentModel.findAdviserLink("one", "department")).toBeNull();
    expect(await DepartmentModel.findAdviserLink("two", "department")).toMatchObject({ yearLevels: [] });
  });

  it("does not skip a stale unchanged assignment request", async () => {
    memory.set("department", [{ ...department, advisers: [{ adviserId: "one", yearLevels: ["FIRST"] }] }]);
    const snapshot = await DepartmentModel.listForAdviserChanges("one", ["department"]);
    await DepartmentModel.deleteAdviser("one", "department");
    await DepartmentModel.replaceAdviserAssignments("one", [{ departmentId: "department", yearLevels: ["FIRST"] }], snapshot);
    expect(await DepartmentModel.findAdviserLink("one", "department")).toMatchObject({ yearLevels: ["FIRST"] });
  });

  it("normalizes historical BSON adviser IDs and can remove their assignments", async () => {
    const adviserId = new ObjectId();
    memory.set("department", [{ ...department, advisers: [{ adviserId, yearLevels: [] }] }]);
    expect(await DepartmentModel.listAssignmentsForAdviser(String(adviserId))).toEqual([expect.objectContaining({ adviserId: String(adviserId) })]);
    await DepartmentModel.deleteAdviser(String(adviserId), "department");
    expect(await DepartmentModel.listAdvisersByDepartment("department")).toEqual([]);
  });

  it("rechecks conflicts after a stale prefetched assignment snapshot loses its CAS", async () => {
    memory.set("department", [{ ...department, advisers: [{ adviserId: "one", yearLevels: ["FIRST"] }] }]);
    const snapshot = await DepartmentModel.listForAdviserChanges("two", ["department"]);
    await DepartmentModel.setAdviserLevels("one", "department", ["SECOND"]);
    await expect(DepartmentModel.replaceAdviserAssignments("two", [{ departmentId: "department", yearLevels: ["SECOND"] }], snapshot)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await DepartmentModel.listAdvisersByDepartment("department")).toEqual([expect.objectContaining({ adviserId: "one", yearLevels: ["SECOND"] })]);
  });

  it("does not silently accept assignment writes for a missing department", async () => {
    await expect(DepartmentModel.insertAdviser({ adviserId: "one", departmentId: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
