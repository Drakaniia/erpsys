import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type AcademicYearRow = {
  _id: string;
  label: string;
  semesterLabel: string;
  isActive: boolean;
  createdAt: Date;
};

export type AcademicYearOption = Pick<
  AcademicYearRow,
  "_id" | "label" | "semesterLabel" | "isActive"
>;

export class AcademicYearModel {
  static async findActive(): Promise<AcademicYearRow | null> {
    return getDbSync()
      .collection<AcademicYearRow>(COLLECTIONS.academicYear)
      .findOne({ isActive: true } as never);
  }

  static async findById(id: string): Promise<AcademicYearRow | null> {
    return getDbSync()
      .collection<AcademicYearRow>(COLLECTIONS.academicYear)
      .findOne(idIn([id]) as never);
  }

  static async findByIds(ids: string[]): Promise<AcademicYearRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<AcademicYearRow>(COLLECTIONS.academicYear)
      .find(idIn([...new Set(ids)]) as never)
      .toArray();
  }

  static async list(): Promise<AcademicYearRow[]> {
    return getDbSync()
      .collection<AcademicYearRow>(COLLECTIONS.academicYear)
      .find({} as never)
      .sort({ createdAt: -1 })
      .toArray();
  }

  static async newest(): Promise<AcademicYearRow | null> {
    const rows = await getDbSync()
      .collection<AcademicYearRow>(COLLECTIONS.academicYear)
      .find({} as never)
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    return rows[0] ?? null;
  }

  static async options(): Promise<AcademicYearOption[]> {
    return getDbSync()
      .collection<AcademicYearOption>(COLLECTIONS.academicYear)
      .find({} as never)
      .sort({ createdAt: -1 })
      .project<AcademicYearOption>({
        _id: 1,
        label: 1,
        semesterLabel: 1,
        isActive: 1,
      })
      .toArray();
  }

  static async insert(row: AcademicYearRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.academicYear)
      .insertOne(row as never);
  }

  static async update(
    id: string,
    patch: { label: string; semesterLabel: string },
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.academicYear)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async remove(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.academicYear)
      .deleteOne(idIn([id]) as never);
  }

  static async deactivateAllExcept(keepId: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.academicYear)
      .updateMany(
        { isActive: true, _id: { $ne: keepId } } as never,
        {
          $set: { isActive: false },
        } as never,
      );
  }

  static async activate(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.academicYear)
      .updateOne(idIn([id]) as never, { $set: { isActive: true } } as never);
  }
}
