import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";

export type QueueEntryRow = {
  _id: string;
  studentProfileId: string;
  academicYearId: string;
  departmentId: string;
  status?: string | null;
  joinedAt?: Date | null;
  servedAt?: Date | null;
  completedAt?: Date | null;
  servedById?: string | null;
};

export class EnrollmentQueueModel {
  static async insert(row: QueueEntryRow): Promise<void> {
    await getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .insertOne(row as never);
  }

  static async findById(id: string): Promise<QueueEntryRow | null> {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .findOne(idIn([id]) as never);
  }

  static async listInProgress(
    departmentId: string,
    academicYearId: string,
  ): Promise<QueueEntryRow[]> {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find({
        departmentId,
        academicYearId,
        status: "IN_PROGRESS",
      } as never)
      .toArray();
  }

  static async listInProgressByYear(
    academicYearId: string,
  ): Promise<QueueEntryRow[]> {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find({ academicYearId, status: "IN_PROGRESS" } as never, {
        projection: { departmentId: 1, servedById: 1 },
      })
      .toArray();
  }

  static async findInProgress(
    departmentId: string,
    academicYearId: string,
  ): Promise<QueueEntryRow | null> {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .findOne({
        departmentId,
        academicYearId,
        status: "IN_PROGRESS",
      } as never);
  }

  static async updateById(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async transition(
    id: string,
    from: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .updateOne({ _id: id, status: from } as never, { $set: patch } as never);
    return (result.matchedCount ?? 0) > 0;
  }

  static async listCompleted(
    where: {
      departmentId: string;
      academicYearId: string;
      completedAt?: Record<string, Date>;
      studentProfileIds?: string[];
    },
    limit: number,
  ): Promise<QueueEntryRow[]> {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find(EnrollmentQueueModel.completedFilter(where) as never, {
        projection: {
          _id: 1,
          studentProfileId: 1,
          completedAt: 1,
          servedById: 1,
        },
      })
      .sort({ completedAt: -1, _id: 1 })
      .limit(limit)
      .toArray();
  }

  static async countCompleted(where: {
    departmentId: string;
    academicYearId: string;
    completedAt?: Record<string, Date>;
    studentProfileIds?: string[];
  }): Promise<number> {
    return getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .countDocuments(EnrollmentQueueModel.completedFilter(where) as never);
  }

  private static completedFilter(where: {
    departmentId: string;
    academicYearId: string;
    completedAt?: Record<string, Date>;
    studentProfileIds?: string[];
  }): Record<string, unknown> {
    return {
      departmentId: where.departmentId,
      academicYearId: where.academicYearId,
      status: "COMPLETED",
      ...(where.completedAt ? { completedAt: where.completedAt } : {}),
      ...(where.studentProfileIds
        ? {
            studentProfileId:
              where.studentProfileIds.length > 0
                ? { $in: where.studentProfileIds }
                : "__none__",
          }
        : {}),
    };
  }

  static async countInLine(filter: Record<string, unknown>): Promise<number> {
    return getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .countDocuments(filter as never);
  }

  static async deleteIfWaiting(id: string): Promise<boolean> {
    const result = await getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .deleteOne({ _id: id, status: "WAITING" } as never);
    return result.deletedCount === 1;
  }

  static async listByIds(ids: string[]): Promise<QueueEntryRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find(idIn([...new Set(ids)]) as never)
      .toArray();
  }

  static async deleteById(id: string): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .deleteOne(idIn([id]) as never);
  }

  static async listForYear(
    academicYearId: string,
  ): Promise<
    Array<{
      departmentId: string;
      status?: string | null;
      joinedAt?: Date | null;
      completedAt?: Date | null;
    }>
  > {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find({ academicYearId } as never, {
        projection: { departmentId: 1, status: 1, joinedAt: 1, completedAt: 1 },
      })
      .toArray();
  }

  static async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .deleteMany({ _id: { $in: [...new Set(ids)] } } as never);
  }

  static async listByStatus(
    departmentIds: string[],
    academicYearId: string,
    status: string,
    limit = 200,
  ): Promise<QueueEntryRow[]> {
    if (departmentIds.length === 0) return [];
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find(
        {
          academicYearId,
          departmentId: { $in: [...new Set(departmentIds)] },
          status,
        } as never,
        {
          projection: {
            _id: 1,
            departmentId: 1,
            studentProfileId: 1,
            joinedAt: 1,
            status: 1,
            servedById: 1,
            servedAt: 1,
          },
        },
      )
      .sort({ joinedAt: 1, _id: 1 })
      .limit(limit)
      .toArray();
  }

  static async findEarliestInLine(
    departmentId: string,
    academicYearId: string,
  ): Promise<{ _id: string; joinedAt?: Date | null } | null> {
    const rows = await getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find(
        {
          departmentId,
          academicYearId,
          status: { $in: ["WAITING", "IN_PROGRESS"] },
        } as never,
        { projection: { _id: 1, joinedAt: 1 } },
      )
      .sort({ joinedAt: 1, _id: 1 })
      .limit(1)
      .toArray();
    return rows[0] ?? null;
  }

  /** Return every student this adviser is serving outside `keepDepartmentIds`. */
  static async releaseServingExcept(
    adviserId: string,
    keepDepartmentIds: string[],
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .updateMany(
        {
          status: "IN_PROGRESS",
          servedById: adviserId,
          departmentId: { $nin: keepDepartmentIds },
        } as never,
        {
          $set: { status: "WAITING", servedById: null, servedAt: null },
        } as never,
      );
  }

  static async releaseServingBy(
    departmentId: string,
    adviserId: string,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.enrollmentQueue)
      .updateMany(
        {
          departmentId,
          status: "IN_PROGRESS",
          servedById: adviserId,
        } as never,
        {
          $set: { status: "WAITING", servedById: null, servedAt: null },
        } as never,
      );
  }

  static async listByProfiles(
    studentProfileIds: string[],
    academicYearId: string,
  ): Promise<
    Array<{
      studentProfileId: string;
      status?: string | null;
      completedAt?: Date | null;
    }>
  > {
    if (studentProfileIds.length === 0) return [];
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find(
        {
          academicYearId,
          studentProfileId: { $in: [...new Set(studentProfileIds)] },
        } as never,
        { projection: { studentProfileId: 1, status: 1, completedAt: 1 } },
      )
      .toArray();
  }

  static async listCompletedProfiles(
    studentProfileIds: string[],
    academicYearId: string,
  ): Promise<string[]> {
    if (studentProfileIds.length === 0) return [];
    const rows = await getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .find(
        {
          academicYearId,
          status: "COMPLETED",
          studentProfileId: { $in: [...new Set(studentProfileIds)] },
        } as never,
        { projection: { studentProfileId: 1 } },
      )
      .toArray();
    return rows.map((row) => String(row.studentProfileId));
  }

  static async findByProfileYear(
    studentProfileId: string,
    academicYearId: string,
  ): Promise<QueueEntryRow | null> {
    return getDbSync()
      .collection<QueueEntryRow>(COLLECTIONS.enrollmentQueue)
      .findOne({ studentProfileId, academicYearId } as never);
  }
}
