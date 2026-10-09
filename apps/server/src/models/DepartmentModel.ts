import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";
import type { YearLevel } from "../config/constants.js";

export type DepartmentRow = {
  _id: string;
  name: string;
  isActive: boolean;
  yearLevels?: YearLevel[];
};

export class DepartmentModel {
  static async findById(id: string): Promise<DepartmentRow | null> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .findOne(idIn([id]) as never);
  }

  static async findByIds(ids: string[]): Promise<DepartmentRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find(idIn([...new Set(ids)]) as never)
      .toArray();
  }

  static async listIds(): Promise<Array<{ _id: string }>> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({} as never, { projection: { _id: 1 } })
      .toArray();
  }

  static async listActive(): Promise<DepartmentRow[]> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({ isActive: true } as never)
      .sort({ name: 1 })
      .toArray();
  }

  static async listAll(): Promise<DepartmentRow[]> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({} as never)
      .sort({ name: 1 })
      .toArray();
  }

  static async listNames(
    excludeId?: string,
  ): Promise<Array<{ _id: string; name: string }>> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find((excludeId ? { _id: { $ne: excludeId } } : {}) as never, {
        projection: { _id: 1, name: 1 },
      })
      .toArray();
  }

  static async insert(row: DepartmentRow): Promise<void> {
    await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .insertOne(row as never);
  }

  static async update(
    id: string,
    patch: Partial<Pick<DepartmentRow, "name" | "isActive" | "yearLevels">>,
  ): Promise<void> {
    await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async remove(id: string): Promise<void> {
    await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .deleteOne(idIn([id]) as never);
  }
}
