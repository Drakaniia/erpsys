import { ApiError } from "../../config/errors.js";
import {
  deriveDepartmentCode,
  deriveStudentNumberFromEmail,
  type YearLevel,
} from "../../config/constants.js";
import { genId } from "../../lib/db/ids.js";
import { getDbSync } from "../../lib/db/db.js";
import { purgeUserById } from "../../lib/db/user-purge.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import type { AcademicYearRow } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import {
  StudentProfileModel,
  type StudentProfileRow,
} from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import {
  NUMBER_IN_USE_MESSAGE,
  decideStudentNumberClaim,
} from "../auth/StudentNumberClaim.js";

export type StudentContext = {
  profile: StudentProfileRow;
  year: AcademicYearRow;
};

export type EnrollmentSummary = {
  academicYearId: string;
  academicYearLabel: string;
  semesterLabel: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  yearLevel: YearLevel;
};

export class StudentProfileService {
  static async requireContext(user: { id: string }): Promise<StudentContext> {
    const [profile, year] = await Promise.all([
      StudentProfileModel.findByUserId(user.id),
      AcademicYearModel.findActive(),
    ]);
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year yet.",
      });
    }
    if (!profile) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "Save your student number first.",
      });
    }
    return { profile, year };
  }

  static async find(userId: string): Promise<StudentProfileRow | null> {
    return StudentProfileModel.findByUserId(userId);
  }

  static async status(userId: string): Promise<{
    hasProfile: boolean;
    studentNumber: string | null;
  }> {
    const profile = await StudentProfileModel.findByUserId(userId);
    return {
      hasProfile: profile !== null,
      studentNumber: profile?.studentNumber ?? null,
    };
  }

  static async saveStudentNumber(
    user: { id: string; email: string },
    studentNumber: string,
  ): Promise<{ studentNumber: string }> {
    const year = await AcademicYearModel.findActive();
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year yet.",
      });
    }
    const profile = await StudentProfileService.ensureForYear({
      userId: user.id,
      email: user.email,
      studentNumber,
      academicYearId: year._id,
    });
    if (!profile) {
      throw new ApiError("BAD_REQUEST", {
        message: "Student number is required.",
      });
    }
    return { studentNumber: profile.studentNumber };
  }

  static async ensureForYear(params: {
    userId: string;
    email: string;
    studentNumber?: string | null;
    academicYearId: string;
  }): Promise<StudentProfileRow | null> {
    const { userId, email, academicYearId } = params;

    const existing = await StudentProfileModel.findByUserId(userId);
    if (existing) return existing;

    const studentNumber =
      params.studentNumber?.trim() || deriveStudentNumberFromEmail(email);
    if (!studentNumber) return null;

    const createFresh = async (): Promise<StudentProfileRow> => {
      const doc: StudentProfileRow = {
        _id: genId("profile"),
        userId,
        studentNumber,
        academicYearId,
      };
      await StudentProfileModel.insert(doc);
      return doc;
    };

    const colliding =
      await StudentProfileModel.findByStudentNumber(studentNumber);
    if (!colliding) {
      try {
        return await createFresh();
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const retry =
          await StudentProfileModel.findByStudentNumber(studentNumber);
        if (!retry) throw error;
        if (retry.userId === userId) return retry;
        throw new ApiError("CONFLICT", { message: NUMBER_IN_USE_MESSAGE });
      }
    }

    if (colliding.userId === userId) return colliding;

    const owner = await UserModel.findById(colliding.userId);
    const decision = decideStudentNumberClaim({
      claimedByUserId: userId,
      claimedByEmail: email,
      claimedNumber: studentNumber,
      existing: owner
        ? {
            userId: colliding.userId,
            email: owner.email,
            blockedAt: owner.blockedAt,
          }
        : { userId: colliding.userId },
    });

    switch (decision.kind) {
      case "claim":
        return createFresh();

      case "purge-blocked-owner": {
        if (!owner) {
          throw new ApiError("CONFLICT", { message: NUMBER_IN_USE_MESSAGE });
        }
        await purgeUserById(getDbSync(), String(owner._id));
        return createFresh();
      }

      case "takeover-institutional": {
        await StudentProfileModel.assignUser(colliding._id, userId);
        await purgeUserById(getDbSync(), colliding.userId);
        return (
          (await StudentProfileModel.findById(colliding._id)) ?? {
            ...colliding,
            userId,
          }
        );
      }

      case "hijack-blocked":
      case "conflict":
        throw new ApiError("CONFLICT", { message: decision.message });
    }
  }

  static async listEnrollments(
    studentProfileId: string,
  ): Promise<EnrollmentSummary[]> {
    const rows = await StudentEnrollmentModel.listByProfile(studentProfileId);
    if (rows.length === 0) return [];

    const [years, departments] = await Promise.all([
      AcademicYearModel.findByIds(rows.map((r) => r.academicYearId)),
      DepartmentModel.findByIds(rows.map((r) => r.departmentId)),
    ]);
    const yearById = new Map(years.map((y) => [String(y._id), y]));
    const departmentById = new Map(
      departments.map((d) => [String(d._id), d] as const),
    );

    return rows
      .map((row) => {
        const year = yearById.get(row.academicYearId);
        const department = departmentById.get(row.departmentId);
        return {
          academicYearId: row.academicYearId,
          academicYearLabel: year?.label ?? "",
          semesterLabel: year?.semesterLabel ?? "",
          departmentId: row.departmentId,
          departmentName: department?.name ?? "",
          departmentCode: department
            ? deriveDepartmentCode(department.name)
            : "",
          yearLevel: row.yearLevel,
        };
      })
      .sort(
        (a, b) =>
          (yearById.get(b.academicYearId)?.createdAt?.getTime() ?? 0) -
          (yearById.get(a.academicYearId)?.createdAt?.getTime() ?? 0),
      );
  }
}
