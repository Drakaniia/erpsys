import { ApiError } from "../../config/errors.js";
import {
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  deriveDepartmentCode,
  type YearLevel,
} from "../../config/constants.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import type { EnrollmentSummary } from "../students/StudentProfileService.js";
import { StudentProfileService } from "../students/StudentProfileService.js";

export type MyEnrollment = EnrollmentSummary & { isActiveYear: boolean };

export type SaveEnrollmentInput = {
  academicYearId: string;
  departmentId: string;
  yearLevel: YearLevel;
  studentNumber?: string;
};

export class EnrollmentService {
  static async listMine(user: {
    id: string;
  }): Promise<{ rows: MyEnrollment[] }> {
    const [profile, year] = await Promise.all([
      StudentProfileService.find(user.id),
      AcademicYearModel.findActive(),
    ]);
    const summaries = profile
      ? await StudentProfileService.listEnrollments(profile._id)
      : [];
    const activeId = year ? String(year._id) : null;
    return {
      rows: summaries.map((summary) => ({
        ...summary,
        isActiveYear: summary.academicYearId === activeId,
      })),
    };
  }

  static async save(
    user: { id: string; email: string },
    input: SaveEnrollmentInput,
  ): Promise<{
    enrollment: EnrollmentSummary;
    studentNumber: string;
  }> {
    const year = await AcademicYearModel.findById(input.academicYearId);
    if (!year) {
      throw new ApiError("BAD_REQUEST", {
        message: "Pick an academic year from the list.",
      });
    }

    const department = await DepartmentModel.findById(input.departmentId);
    if (!department || !department.isActive) {
      throw new ApiError("BAD_REQUEST", {
        message: "Pick a course from the list.",
      });
    }

    const profile = await StudentProfileService.ensureForYear({
      userId: user.id,
      email: user.email,
      studentNumber: input.studentNumber,
      academicYearId: year._id,
    });
    if (!profile) {
      throw new ApiError("BAD_REQUEST", {
        message: "Student number is required.",
      });
    }

    const current = await StudentEnrollmentModel.findByProfileYear(
      profile._id,
      year._id,
    );
    const unchanged =
      current?.departmentId === input.departmentId &&
      current.yearLevel === input.yearLevel;
    if (
      !unchanged &&
      !departmentAcceptsLevel(department.yearLevels ?? [], input.yearLevel)
    ) {
      throw new ApiError("BAD_REQUEST", {
        message: `${department.name} doesn't offer ${YEAR_LEVEL_LABELS[input.yearLevel]}.`,
      });
    }

    if (!unchanged && current) {
      const entry = await EnrollmentQueueModel.findByProfileYear(
        profile._id,
        year._id,
      );
      if (entry) {
        throw new ApiError("CONFLICT", {
          message:
            entry.status === "COMPLETED"
              ? "You're already enrolled this year — ask an admin to change your course."
              : "Leave the queue before changing your course or year level.",
        });
      }
    }

    await StudentEnrollmentModel.upsert({
      studentProfileId: profile._id,
      academicYearId: year._id,
      departmentId: input.departmentId,
      yearLevel: input.yearLevel,
    });

    return {
      enrollment: {
        academicYearId: year._id,
        academicYearLabel: year.label,
        semesterLabel: year.semesterLabel,
        departmentId: String(department._id),
        departmentName: department.name,
        departmentCode: deriveDepartmentCode(department.name),
        yearLevel: input.yearLevel,
      },
      studentNumber: profile.studentNumber,
    };
  }
}
