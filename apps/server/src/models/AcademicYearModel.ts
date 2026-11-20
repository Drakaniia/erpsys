import { COLLECTIONS, getDbSync, idIn, refIn } from "../lib/db/db.js";
import { ApiError } from "../config/errors.js";
import { atomic, fenceAcademicYears } from "../lib/db/timestamp-ordering.js";

export type ProfilingForm = {
  formId?: string | null;
  title?: string | null;
  responderUri?: string | null;
  updatedById?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export type AcademicYearRow = {
  _id: string;
  label: string;
  semesterLabel: string;
  isActive: boolean;
  profilingForm?: ProfilingForm | null;
  createdAt: Date;
  updatedAt: Date;
};

type AcademicYearOption = Pick<
  AcademicYearRow,
  "_id" | "label" | "semesterLabel" | "isActive"
>;

export class AcademicYearModel {
  static async profilingForm(
    academicYearId: string,
  ): Promise<ProfilingForm | null> {
    return (await this.findById(academicYearId))?.profilingForm ?? null;
  }

  static async setProfilingForm(
    academicYearId: string,
    form: ProfilingForm | null,
  ): Promise<void> {
    await getDbSync()
      .collection<AcademicYearRow>(COLLECTIONS.academicYear)
      .updateOne(idIn([academicYearId]) as never, {
        $set: { profilingForm: form },
      });
  }

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
    const db = getDbSync();
    await atomic(db, async () => {
      await fenceAcademicYears(db);
      const year = await this.findById(id);
      if (!year) throw new ApiError("NOT_FOUND", { message: "Academic year not found." });
      if (year.isActive) throw new ApiError("CONFLICT", { message: "Cannot delete the active academic year." });
      if (year.profilingForm) throw new ApiError("CONFLICT", { message: "Cannot delete — contains records." });
      for (const name of [COLLECTIONS.studentEnrollment, COLLECTIONS.stepVerification, COLLECTIONS.enrollmentQueue, COLLECTIONS.adviserSchedule, COLLECTIONS.departmentTransferRequest]) {
        if (await db.collection(name).findOne({ academicYearId: refIn([id]) } as never)) throw new ApiError("CONFLICT", { message: "Cannot delete — contains retained records." });
      }
      if (await db.collection(COLLECTIONS.user).findOne({ "studentProfile.academicYearId": refIn([id]) } as never)) throw new ApiError("CONFLICT", { message: "Cannot delete — contains retained profiles." });
      await db.collection(COLLECTIONS.academicYear).deleteOne(idIn([id]) as never);
    });
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
    const db = getDbSync();
    await atomic(db, async () => {
      await fenceAcademicYears(db);
      if (!(await this.findById(id))) throw new ApiError("NOT_FOUND", { message: "Academic year not found." });
      await this.deactivateAllExcept(id);
      await db.collection(COLLECTIONS.academicYear).updateOne(idIn([id]) as never, { $set: { isActive: true } } as never);
    });
  }
}
