import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type StudentProfileRow = {
  _id: string;
  userId: string;
  studentNumber: string;
  academicYearId: string;
  createdAt?: Date | null;
};

export class StudentProfileModel {
  static async findById(id: string): Promise<StudentProfileRow | null> {
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .findOne(idIn([id]) as never);
  }

  static async findByUserId(userId: string): Promise<StudentProfileRow | null> {
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .findOne({ userId } as never);
  }

  static async findByStudentNumber(
    studentNumber: string,
  ): Promise<StudentProfileRow | null> {
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .findOne({ studentNumber } as never);
  }

  static async searchByStudentNumber(
    pattern: { $regex: string; $options: string },
    limit = 500,
  ): Promise<Array<{ _id: string }>> {
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .find({ studentNumber: pattern } as never, { projection: { _id: 1 } })
      .limit(limit)
      .toArray();
  }

  static async listByUserIds(
    userIds: string[],
    limit = 500,
  ): Promise<Array<{ _id: string; userId: string }>> {
    if (userIds.length === 0) return [];
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .find({ userId: { $in: userIds } } as never, {
        projection: { _id: 1, userId: 1 },
      })
      .limit(limit)
      .toArray();
  }

  static async findByIds(
    ids: string[],
  ): Promise<
    Array<Pick<StudentProfileRow, "_id" | "studentNumber" | "userId">>
  > {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .find(idIn([...new Set(ids)]) as never, {
        projection: { _id: 1, studentNumber: 1, userId: 1 },
      })
      .toArray();
  }

  static async listUnenrolled(
    enrolledIds: string[],
    qProfileIds?: string[] | null,
  ): Promise<StudentProfileRow[]> {
    const where: Record<string, unknown> = { _id: { $nin: enrolledIds } };
    if (qProfileIds) where._id = { $in: qProfileIds, $nin: enrolledIds };
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .find(where as never)
      .toArray();
  }

  static async countUnenrolled(enrolledIds: string[]): Promise<number> {
    return getDbSync()
      .collection<StudentProfileRow>(COLLECTIONS.studentProfile)
      .countDocuments({ _id: { $nin: enrolledIds } } as never);
  }

  static async assignUser(id: string, userId: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.studentProfile)
      .updateOne(idIn([id]) as never, { $set: { userId } } as never);
  }

  static async insert(row: StudentProfileRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.studentProfile)
      .insertOne(row as never);
  }
}
