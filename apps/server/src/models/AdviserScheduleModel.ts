import type { WindowKind } from "../config/schedule.js";
import { COLLECTIONS, getDbSync, refIn } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

export type AvailabilityRow = {
  adviserId: string;
  departmentId: string;
  isOpen: boolean;
  lastActiveAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export type AvailabilityWindowRow = {
  _id: string;
  adviserId: string;
  departmentId: string;
  academicYearId: string;
  kind: WindowKind;
  weekday?: number;
  date?: string;
  startMinute?: number;
  endMinute?: number;
  createdAt: Date;
  updatedAt: Date;
};

type StoredWindow = Omit<AvailabilityWindowRow, "kind"> & {
  kind: "window";
  windowKind: WindowKind;
};

type WindowInput = Pick<
  AvailabilityWindowRow,
  "kind" | "weekday" | "date" | "startMinute" | "endMinute"
>;

const windowView = ({
  kind: _kind,
  windowKind,
  ...row
}: StoredWindow): AvailabilityWindowRow => ({
  ...row,
  kind: windowKind,
});

export class AdviserScheduleModel {
  static async findOpenFor(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityRow | null> {
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserSchedule)
      .findOne({
        kind: "presence",
        adviserId,
        departmentId,
        academicYearId,
        isOpen: true,
      } as never);
  }

  static async listOpenByYear(
    academicYearId: string,
  ): Promise<AvailabilityRow[]> {
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserSchedule)
      .find({ kind: "presence", academicYearId, isOpen: true } as never)
      .toArray();
  }

  static async listOpenByDepartment(
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityRow[]> {
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserSchedule)
      .find({
        kind: "presence",
        departmentId,
        academicYearId,
        isOpen: true,
      } as never)
      .toArray();
  }

  static async listOpenByDepartments(
    departmentIds: string[],
    academicYearId: string,
  ): Promise<AvailabilityRow[]> {
    if (departmentIds.length === 0) return [];
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserSchedule)
      .find({
        kind: "presence",
        academicYearId,
        departmentId: { $in: [...new Set(departmentIds)] },
        isOpen: true,
      } as never)
      .toArray();
  }

  static async listMineByDepartments(
    adviserId: string,
    departmentIds: string[],
    academicYearId: string,
  ): Promise<(AvailabilityRow & { autoClosedAt?: Date | null })[]> {
    if (departmentIds.length === 0) return [];
    return getDbSync()
      .collection<AvailabilityRow & { autoClosedAt?: Date | null }>(
        COLLECTIONS.adviserSchedule,
      )
      .find({
        kind: "presence",
        adviserId,
        academicYearId,
        departmentId: { $in: [...new Set(departmentIds)] },
      } as never)
      .toArray();
  }

  static async closeForDepartment(
    adviserId: string,
    departmentId: string,
    now: Date,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .updateMany(
        { kind: "presence", adviserId, departmentId, isOpen: true } as never,
        { $set: { isOpen: false, closedAt: now } } as never,
      );
  }

  static async isActive(
    adviserId: string,
    academicYearId: string,
    now: Date,
    staleMs: number,
  ): Promise<boolean> {
    const row = await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .findOne(
        {
          kind: "presence",
          adviserId,
          academicYearId,
          isOpen: true,
          lastActiveAt: { $gte: new Date(now.getTime() - staleMs) },
        } as never,
        { projection: { _id: 1 } },
      );
    return row !== null;
  }

  static async setOpen(input: {
    adviserId: string;
    departmentId: string;
    academicYearId: string;
    isOpen: boolean;
    now: Date;
  }): Promise<void> {
    const { adviserId, departmentId, academicYearId, isOpen, now } = input;
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .updateOne(
        { kind: "presence", adviserId, departmentId, academicYearId } as never,
        {
          $set: {
            kind: "presence",
            adviserId,
            departmentId,
            academicYearId,
            isOpen,
            openedAt: isOpen ? now : null,
            closedAt: isOpen ? null : now,
            lastActiveAt: now,
            autoClosedAt: null,
          },
          $setOnInsert: { _id: genId("availability") },
        } as never,
        { upsert: true } as never,
      );
  }

  static async touchOpen(adviserId: string, now: Date): Promise<number> {
    const result = await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .updateMany(
        { kind: "presence", adviserId, isOpen: true } as never,
        { $set: { lastActiveAt: now } } as never,
      );
    return result.modifiedCount ?? 0;
  }

  static async deleteByDepartment(departmentId: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .deleteMany({ kind: "presence", departmentId } as never);
  }

  static async closeOpenForAdviser(
    adviserId: string,
    keepDepartmentIds: string[] = [],
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .updateMany(
        {
          kind: "presence",
          adviserId: refIn([adviserId]),
          isOpen: true,
          departmentId: { $nin: keepDepartmentIds },
        } as never,
        {
          $set: { isOpen: false, closedAt: new Date(), autoClosedAt: null },
        } as never,
      );
  }

  static async listWindowsForAdviser(
    adviserId: string,
    academicYearId: string,
  ): Promise<AvailabilityWindowRow[]> {
    const rows = await getDbSync()
      .collection<StoredWindow>(COLLECTIONS.adviserSchedule)
      .find({ kind: "window", adviserId, academicYearId } as never)
      .toArray();
    return rows.map(windowView);
  }

  static async listWindowsForAdviserDepartment(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityWindowRow[]> {
    const rows = await getDbSync()
      .collection<StoredWindow>(COLLECTIONS.adviserSchedule)
      .find({
        kind: "window",
        adviserId,
        departmentId,
        academicYearId,
      } as never)
      .toArray();
    return rows.map(windowView);
  }

  static async listWindowsByDepartment(
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityWindowRow[]> {
    const rows = await getDbSync()
      .collection<StoredWindow>(COLLECTIONS.adviserSchedule)
      .find({ kind: "window", departmentId, academicYearId } as never)
      .toArray();
    return rows.map(windowView);
  }

  static async replaceWindows(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
    rows: WindowInput[],
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .deleteMany({
        kind: "window",
        adviserId,
        departmentId,
        academicYearId,
      } as never);
    if (rows.length === 0) return;
    const now = new Date();
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .insertMany(
        rows.map(({ kind, ...row }) => ({
          ...row,
          kind: "window",
          windowKind: kind,
          _id: genId("window"),
          adviserId,
          departmentId,
          academicYearId,
          createdAt: now,
          updatedAt: now,
        })) as never,
      );
  }

  static async deleteWindowsForAdviser(
    adviserId: string,
    keepDepartmentIds: string[] = [],
  ): Promise<number> {
    const result = await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .deleteMany({
        kind: "window",
        adviserId: refIn([adviserId]),
        departmentId: { $nin: keepDepartmentIds },
      } as never);
    return result.deletedCount ?? 0;
  }

  static async deleteStaleWindowYears(activeYearId: string): Promise<string[]> {
    const rows = await getDbSync()
      .collection<StoredWindow>(COLLECTIONS.adviserSchedule)
      .find({ kind: "window", academicYearId: { $ne: activeYearId } } as never)
      .toArray();
    if (rows.length === 0) return [];
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .deleteMany({
        kind: "window",
        academicYearId: { $ne: activeYearId },
      } as never);
    return [...new Set(rows.map((row) => row.adviserId))];
  }

  static async deleteWindowsByDepartment(
    departmentId: string,
  ): Promise<string[]> {
    const rows = await getDbSync()
      .collection<StoredWindow>(COLLECTIONS.adviserSchedule)
      .find({ kind: "window", departmentId } as never)
      .toArray();
    await getDbSync()
      .collection(COLLECTIONS.adviserSchedule)
      .deleteMany({ kind: "window", departmentId } as never);
    return [...new Set(rows.map((row) => row.adviserId))];
  }
}
