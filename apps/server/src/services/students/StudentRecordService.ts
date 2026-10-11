import { ApiError } from "../../config/errors.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import {
  buildStudentRecord,
  type StudentRecord,
} from "../../views/StudentRecordView.js";

export class StudentRecordService {
  static async loadForStudent(userId: string): Promise<StudentRecord | null> {
    const year = await AcademicYearService.findActive();
    if (!year) return null;
    const profile = await StudentProfileModel.findByUserId(userId);
    if (!profile) return null;

    const record = await StudentRecordService.load({
      studentProfileId: profile._id,
      academicYearId: String(year._id),
    });
    if (!record) return null;
    const enrollmentStep = record.steps.find(
      (step) => step.code === "ENROLLMENT",
    );
    return enrollmentStep?.status === "VERIFIED" ? record : null;
  }

  static async load(input: {
    studentProfileId: string;
    academicYearId?: string | null;
  }): Promise<StudentRecord | null> {
    const year = await AcademicYearService.resolve(
      input.academicYearId ?? undefined,
    );
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message:
          "No academic year is configured — ask an admin to add one first.",
      });
    }
    const yearId = String(year._id);

    const profile = await StudentProfileModel.findById(input.studentProfileId);
    if (!profile) return null;
    const profileId = String(profile._id);

    const [enrollment, verifications, queue, stepRows] = await Promise.all([
      StudentEnrollmentModel.findByProfileYear(profileId, yearId),
      StepVerificationModel.listByProfileYear(profileId, yearId),
      EnrollmentQueueModel.findByProfileYear(profileId, yearId),
      StepModel.listCodeMap(),
    ]);

    const actorIds = [
      profile.userId,
      queue?.servedById,
      ...verifications.flatMap((v) => [v.verifiedById, v.respondedById]),
    ].filter((id): id is string => typeof id === "string" && id.length > 0);

    const [users, department] = await Promise.all([
      UserModel.findByIds([...new Set(actorIds)]),
      enrollment
        ? DepartmentModel.findById(enrollment.departmentId)
        : Promise.resolve(null),
    ]);

    return buildStudentRecord({
      year: {
        id: yearId,
        label: year.label,
        semesterLabel: year.semesterLabel,
      },
      profile,
      owner: users.find((u) => String(u._id) === String(profile.userId)),
      enrollment,
      departmentName: department?.name ?? "",
      verifications,
      codeByStepId: new Map(
        stepRows.map((s) => [String(s._id), s.code] as const),
      ),
      queue,
      users: new Map(users.map((u) => [String(u._id), u] as const)),
    });
  }
}
