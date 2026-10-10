import { COLLECTIONS, getDbSync, refIn } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

export type AvailabilityRow = {
  adviserId: string;
  departmentId: string;
  isOpen: boolean;
  lastActiveAt?: Date | null;
};

export class AdviserAvailabilityModel {
  static async findOpenFor(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityRow | null> {
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserAvailability)
      .findOne({
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
      .collection<AvailabilityRow>(COLLECTIONS.adviserAvailability)
      .find({ academicYearId, isOpen: true } as never)
      .toArray();
  }

  static async listOpenByDepartment(
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityRow[]> {
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserAvailability)
      .find({ departmentId, academicYearId, isOpen: true } as never)
      .toArray();
  }

  static async listOpenByDepartments(
    departmentIds: string[],
    academicYearId: string,
  ): Promise<AvailabilityRow[]> {
    if (departmentIds.length === 0) return [];
    return getDbSync()
      .collection<AvailabilityRow>(COLLECTIONS.adviserAvailability)
      .find({
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
        COLLECTIONS.adviserAvailability,
      )
      .find({
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
      .collection(COLLECTIONS.adviserAvailability)
      .updateMany(
        { adviserId, departmentId, isOpen: true } as never,
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
      .collection(COLLECTIONS.adviserAvailability)
      .findOne(
        {
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
      .collection(COLLECTIONS.adviserAvailability)
      .updateOne(
        { adviserId, departmentId, academicYearId } as never,
        {
          $set: {
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
      .collection(COLLECTIONS.adviserAvailability)
      .updateMany(
        { adviserId, isOpen: true } as never,
        { $set: { lastActiveAt: now } } as never,
      );
    return result.modifiedCount ?? 0;
  }

  static async deleteByDepartment(departmentId: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserAvailability)
      .deleteMany({ departmentId } as never);
  }

  static async closeOpenForAdviser(
    adviserId: string,
    keepDepartmentIds: string[] = [],
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserAvailability)
      .updateMany(
        {
          adviserId: refIn([adviserId]),
          isOpen: true,
          departmentId: { $nin: keepDepartmentIds },
        } as never,
        {
          $set: { isOpen: false, closedAt: new Date(), autoClosedAt: null },
        } as never,
      );
  }
}
