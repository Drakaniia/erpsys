import { COLLECTIONS, getDbSync } from "../lib/db/db.js";
import type { YearLevel } from "../config/constants.js";

export type StudentEnrollmentRow = {
  _id: string;
  studentProfileId: string;
  academicYearId: string;
  departmentId: string;
  yearLevel: YearLevel;
};

export class StudentEnrollmentModel {
  static async listByProfile(
    studentProfileId: string,
  ): Promise<StudentEnrollmentRow[]> {
    return getDbSync()
      .collection<StudentEnrollmentRow>(COLLECTIONS.studentEnrollment)
      .find({ studentProfileId } as never)
      .toArray();
  }

  static async listAllForYear(
    academicYearId: string,
  ): Promise<StudentEnrollmentRow[]> {
    return getDbSync()
      .collection<StudentEnrollmentRow>(COLLECTIONS.studentEnrollment)
      .find({ academicYearId } as never, {
        projection: { studentProfileId: 1 },
      })
      .toArray();
  }

  static async listForDepartments(
    academicYearId: string,
    departmentIds: string[],
    yearLevels?: readonly YearLevel[],
    studentProfileIds?: string[] | null,
  ): Promise<StudentEnrollmentRow[]> {
    if (departmentIds.length === 0) return [];
    return getDbSync()
      .collection<StudentEnrollmentRow>(COLLECTIONS.studentEnrollment)
      .find({
        academicYearId,
        departmentId: { $in: [...new Set(departmentIds)] },
        ...(yearLevels?.length ? { yearLevel: { $in: [...yearLevels] } } : {}),
        ...(studentProfileIds
          ? { studentProfileId: { $in: studentProfileIds } }
          : {}),
      } as never)
      .toArray();
  }

  static async listForYearFilter(input: {
    academicYearId: string;
    departmentId?: string;
    yearLevel?: YearLevel;
  }): Promise<StudentEnrollmentRow[]> {
    return getDbSync()
      .collection<StudentEnrollmentRow>(COLLECTIONS.studentEnrollment)
      .find(
        {
          academicYearId: input.academicYearId,
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
          ...(input.yearLevel ? { yearLevel: input.yearLevel } : {}),
        } as never,
        { projection: { studentProfileId: 1 } },
      )
      .limit(1000)
      .toArray();
  }

  static async listByProfiles(
    studentProfileIds: string[],
    academicYearId: string,
  ): Promise<
    Array<{
      studentProfileId: string;
      yearLevel?: YearLevel;
      departmentId?: string;
    }>
  > {
    if (studentProfileIds.length === 0) return [];
    return getDbSync()
      .collection<StudentEnrollmentRow>(COLLECTIONS.studentEnrollment)
      .find(
        {
          academicYearId,
          studentProfileId: { $in: [...new Set(studentProfileIds)] },
        } as never,
        { projection: { studentProfileId: 1, yearLevel: 1, departmentId: 1 } },
      )
      .toArray();
  }

  static async findByProfileYear(
    studentProfileId: string,
    academicYearId: string,
  ): Promise<StudentEnrollmentRow | null> {
    return getDbSync()
      .collection<StudentEnrollmentRow>(COLLECTIONS.studentEnrollment)
      .findOne({ studentProfileId, academicYearId } as never);
  }

  static async upsert(input: {
    studentProfileId: string;
    academicYearId: string;
    departmentId: string;
    yearLevel: YearLevel;
  }): Promise<void> {
    const id = `enrollment-${crypto.randomUUID()}`;
    await getDbSync()
      .collection(COLLECTIONS.studentEnrollment)
      .updateOne(
        {
          studentProfileId: input.studentProfileId,
          academicYearId: input.academicYearId,
        } as never,
        { $set: { _id: id, ...input } } as never,
        { upsert: true } as never,
      );
  }

  static async insert(row: StudentEnrollmentRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.studentEnrollment)
      .insertOne(row as never);
  }
}
