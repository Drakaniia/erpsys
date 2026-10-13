import { COLLECTIONS, getDbSync } from "../lib/db/db.js";

export type ProfilingFormRow = {
  _id: string;
  academicYearId: string;
  formId?: string | null;
  title?: string | null;
  responderUri?: string | null;
  updatedById?: string;
  updatedAt?: Date | null;
};

export class ProfilingFormModel {
  static async findByYear(
    academicYearId: string,
  ): Promise<ProfilingFormRow | null> {
    return getDbSync()
      .collection<ProfilingFormRow>(COLLECTIONS.profilingForm)
      .findOne({ academicYearId } as never);
  }
}
