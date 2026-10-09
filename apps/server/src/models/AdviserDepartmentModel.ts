import { COLLECTIONS, getDbSync, refIn } from "../lib/db/db.js";
import type { YearLevel } from "../config/constants.js";

export type AdviserDepartmentRow = {
  adviserId: string;
  departmentId: string;
  yearLevels?: YearLevel[];
};

export class AdviserDepartmentModel {
  static async listByDepartment(
    departmentId: string,
  ): Promise<AdviserDepartmentRow[]> {
    return getDbSync()
      .collection<AdviserDepartmentRow>(COLLECTIONS.adviserDepartment)
      .find({ departmentId } as never, {
        projection: { adviserId: 1, departmentId: 1, yearLevels: 1 },
      })
      .toArray();
  }

  static async findLink(
    adviserId: string,
    departmentId: string,
  ): Promise<AdviserDepartmentRow | null> {
    return getDbSync()
      .collection<AdviserDepartmentRow>(COLLECTIONS.adviserDepartment)
      .findOne({ adviserId, departmentId } as never);
  }

  static async listOtherHolders(
    departmentId: string,
    adviserId: string,
  ): Promise<AdviserDepartmentRow[]> {
    return getDbSync()
      .collection<AdviserDepartmentRow>(COLLECTIONS.adviserDepartment)
      .find({ departmentId, adviserId: { $ne: adviserId } } as never)
      .toArray();
  }

  static async insert(
    row: AdviserDepartmentRow & { _id: string },
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .insertOne(row as never);
  }

  static async setLevels(
    adviserId: string,
    departmentId: string,
    yearLevels: YearLevel[],
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .updateOne(
        { adviserId, departmentId } as never,
        { $set: { yearLevels } } as never,
      );
  }

  static async deleteOne(
    adviserId: string,
    departmentId: string,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .deleteMany({ adviserId, departmentId } as never);
  }

  static async deleteOthers(
    adviserId: string,
    keepDepartmentId: string,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .deleteMany({
        adviserId,
        departmentId: { $ne: keepDepartmentId },
      } as never);
  }

  static async listForAdviser(
    adviserId: string,
  ): Promise<AdviserDepartmentRow[]> {
    return getDbSync()
      .collection<AdviserDepartmentRow>(COLLECTIONS.adviserDepartment)
      .find({ adviserId } as never, {
        projection: { adviserId: 1, departmentId: 1, yearLevels: 1 },
      })
      .toArray();
  }

  static async deleteForAdviser(adviserId: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .deleteMany({ adviserId: refIn([adviserId]) } as never);
  }

  static async listAll(): Promise<AdviserDepartmentRow[]> {
    return getDbSync()
      .collection<AdviserDepartmentRow>(COLLECTIONS.adviserDepartment)
      .find({} as never)
      .toArray();
  }

  static async insertMany(
    rows: Array<AdviserDepartmentRow & { _id: string }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .insertMany(rows as never);
  }

  static async deleteByDepartment(departmentId: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adviserDepartment)
      .deleteMany({ departmentId } as never);
  }
}
