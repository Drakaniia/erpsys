import { ApiError } from "../../config/errors.js";
import {
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  type YearLevel,
} from "../../config/constants.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { purgeUserById } from "../../lib/db/user-purge.js";
import { getDbSync } from "../../lib/db/db.js";
import { NUMBER_IN_USE_MESSAGE } from "./StudentNumberClaim.js";

const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === DUPLICATE_KEY) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type PlacementInput = {
  userId: string;
  studentNumber: string;
  academicYearId: string;
  departmentId: string;
  yearLevel: YearLevel;
};

export class StudentPlacementService {
  static async create(input: PlacementInput): Promise<void> {
    const db = getDbSync();

    const rollback = async (
      message: string,
      code: string = "BAD_REQUEST",
    ): Promise<never> => {
      await purgeUserById(db, input.userId);
      throw new ApiError(code, { message });
    };

    const year = await AcademicYearModel.findById(input.academicYearId);
    if (!year) return rollback("Pick an academic year from the list.");

    const department = await DepartmentModel.findById(input.departmentId);
    if (!department || !department.isActive)
      return rollback("Pick a course from the list.");

    if (!departmentAcceptsLevel(department.yearLevels ?? [], input.yearLevel)) {
      return rollback(
        `${department.name} doesn't offer ${YEAR_LEVEL_LABELS[input.yearLevel]}.`,
      );
    }

    const profileId = crypto.randomUUID();
    try {
      await StudentProfileModel.insert({
        _id: profileId,
        userId: input.userId,
        studentNumber: input.studentNumber,
        academicYearId: year._id,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) return rollback(NUMBER_IN_USE_MESSAGE);
      return rollback(
        "Could not save your student number — please try again.",
        "INTERNAL_SERVER_ERROR",
      );
    }

    try {
      await StudentEnrollmentModel.insert({
        _id: crypto.randomUUID(),
        studentProfileId: profileId,
        academicYearId: year._id,
        departmentId: department._id,
        yearLevel: input.yearLevel,
      });
    } catch {
      return rollback("Could not save your enrollment — please try again.");
    }
  }
}
