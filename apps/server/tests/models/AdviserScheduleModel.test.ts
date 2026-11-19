import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../src/lib/db/db.js";
import { AdviserScheduleModel as Model } from "../../src/models/AdviserScheduleModel.js";
import { fakeDb } from "../helpers/fakeDb.js";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../src/lib/db/db.js", async (original) => ({
  ...(await original<typeof import("../../src/lib/db/db.js")>()),
  getDbSync: () => holder.db,
}));

const now = new Date("2026-01-01T00:00:00Z");
const scope = { adviserId: "a", departmentId: "d", academicYearId: "y" };
let context: ReturnType<typeof fakeDb>;
const rows = () => context.store[COLLECTIONS.adviserSchedule];
beforeEach(() => {
  context = fakeDb({
    [COLLECTIONS.adviserSchedule]: [
      { _id: "presence", ...scope, kind: "presence", isOpen: true, lastActiveAt: now },
      // Matching presence fields make a missing discriminator visible even on heartbeat queries.
      { _id: "window", ...scope, kind: "window", windowKind: "WEEKLY", weekday: 1, startMinute: 480, endMinute: 540, isOpen: true, lastActiveAt: now, createdAt: now, updatedAt: now },
    ],
  });
  holder.db = context.db;
});

describe("adviser schedule kind isolation", () => {
  it("filters every presence read and preserves the window API subtype and ID", async () => {
    expect(await Model.findOpenFor("a", "d", "y")).toMatchObject({ _id: "presence" });
    for (const list of [
      await Model.listOpenByYear("y"),
      await Model.listOpenByDepartment("d", "y"),
      await Model.listOpenByDepartments(["d", "d"], "y"),
      await Model.listMineByDepartments("a", ["d"], "y"),
    ]) expect(list.map((row) => (row as unknown as { _id: string })._id)).toEqual(["presence"]);
    for (const list of [
      await Model.listWindowsForAdviser("a", "y"),
      await Model.listWindowsForAdviserDepartment("a", "d", "y"),
      await Model.listWindowsByDepartment("d", "y"),
    ]) {
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ _id: "window", kind: "WEEKLY" });
      expect(list[0]).not.toHaveProperty("windowKind");
    }
    await Model.deleteByDepartment("d");
    expect(await Model.isActive("a", "y", now, 60_000)).toBe(false);
    expect(await Model.findOpenFor("a", "d", "y")).toBeNull();
  });

  it("heartbeats, close operations and presence deletion never write windows", async () => {
    const window = { ...rows()[1] };
    expect(await Model.touchOpen("a", new Date(now.getTime() + 1000))).toBe(1);
    await Model.closeForDepartment("a", "d", now);
    await Model.setOpen({ ...scope, isOpen: true, now });
    await Model.closeOpenForAdviser("a");
    await Model.deleteByDepartment("d");
    expect(rows()).toEqual([window]);
  });

  it("upserts only the presence tuple and preserves an existing ID", async () => {
    const window = { ...rows()[1] };
    await Model.setOpen({ ...scope, isOpen: false, now });
    await Model.setOpen({ ...scope, isOpen: true, now });
    expect(rows().filter((row) => row.kind === "presence")).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ _id: "presence", ...scope, isOpen: true });
    await Model.setOpen({ ...scope, departmentId: "other", isOpen: true, now });
    await Model.setOpen({ ...scope, academicYearId: "next", isOpen: true, now });
    expect(rows().filter((row) => row.kind === "presence")).toHaveLength(3);
    expect(rows().find((row) => row._id === "window")).toEqual(window);
  });

  it("window replacement and adviser cleanup never write presence", async () => {
    const presence = { ...rows()[0] };
    await Model.replaceWindows("a", "d", "y", [{ kind: "EXTRA", date: "2026-01-02", startMinute: 600, endMinute: 660 }]);
    expect(rows().find((row) => row.kind === "presence")).toEqual(presence);
    expect(rows().find((row) => row.kind === "window")).toMatchObject({ kind: "window", windowKind: "EXTRA", ...scope });
    expect(await Model.deleteWindowsForAdviser("a", ["d"])).toBe(0);
    expect(await Model.deleteWindowsForAdviser("a")).toBe(1);
    expect(rows()).toEqual([presence]);
    await Model.replaceWindows("a", "d", "y", []);
    expect(rows()).toEqual([presence]);
  });

  it("stale-year and department window cleanup only deletes windows", async () => {
    const presence = { ...rows()[0] };
    expect(await Model.deleteStaleWindowYears("next")).toEqual(["a"]);
    expect(rows()).toEqual([presence]);
    await Model.replaceWindows("a", "d", "y", [{ kind: "CANCEL", date: "2026-01-02" }]);
    expect(await Model.deleteWindowsByDepartment("d")).toEqual(["a"]);
    expect(rows()).toEqual([presence]);
    expect(await Model.deleteStaleWindowYears("next")).toEqual([]);
  });
});
