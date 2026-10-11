import { ApiError } from "../../config/errors.js";
import { STEP_CODES, deriveDepartmentCode } from "../../config/constants.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { StudentRecordService } from "./StudentRecordService.js";
import { UserModel } from "../../models/UserModel.js";
import { ROSTER_STEP_STATES } from "./RosterService.js";

async function yearOrThrow(academicYearId?: string) {
  const year = await AcademicYearService.resolve(academicYearId);
  if (!year) {
    throw new ApiError("PRECONDITION_FAILED", {
      message:
        "No academic year is configured — ask an admin to add one first.",
    });
  }
  return year;
}

async function assertInScope(
  adviserId: string,
  departmentId: string | null | undefined,
): Promise<void> {
  if (!departmentId) return;
  if (!(await AdviserDepartmentModel.findLink(adviserId, departmentId))) {
    throw new ApiError("FORBIDDEN", {
      message: "This student belongs to another department.",
    });
  }
}

export class OfficerStudentService {
  static async detail(
    actor: { id: string; role?: string },
    studentProfileId: string,
    academicYearId: string | undefined,
    requestedScope: "mine" | "all",
  ) {
    if (actor.role === "STUDENT") {
      throw new ApiError("FORBIDDEN", { message: "Forbidden." });
    }
    const scope = actor.role === "ENROLLMENT_ADVISER" ? requestedScope : "all";
    const year = await yearOrThrow(academicYearId);
    const yearId = String(year._id);
    const profile = await StudentProfileModel.findById(studentProfileId);
    if (!profile) {
      throw new ApiError("NOT_FOUND", { message: "Student not found." });
    }
    const pid = String(profile._id);
    const [enrollment, steps, verifications, queue, owner] = await Promise.all([
      StudentEnrollmentModel.findByProfileYear(pid, yearId),
      StepModel.listOrdered(),
      StepVerificationModel.listByProfileYear(pid, yearId),
      EnrollmentQueueModel.findByProfileYear(pid, yearId),
      UserModel.findById(String(profile.userId)),
    ]);
    if (enrollment && scope !== "all") {
      await assertInScope(actor.id, String(enrollment.departmentId));
    }

    const actorIds = [
      ...new Set(
        verifications.flatMap((verification) =>
          [verification.verifiedById, verification.respondedById].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const actors = await UserModel.findByIds(actorIds);
    const nameById = new Map(
      actors.map((user) => [String(user._id), user.name ?? ""]),
    );
    const verificationByStepId = new Map(
      verifications.map((verification) => [
        String(verification.stepId),
        verification,
      ]),
    );

    const stepRows = steps.map((step) => {
      const verification = verificationByStepId.get(String(step._id));
      return {
        code: step.code,
        name: step.name,
        order: step.order,
        status: (verification?.status ??
          "MISSING") as (typeof ROSTER_STEP_STATES)[number],
        submittedAt: verification?.appliedAt
          ? new Date(verification.appliedAt).toISOString()
          : null,
        verifiedAt: verification?.verifiedAt
          ? new Date(verification.verifiedAt).toISOString()
          : null,
        verifiedByName: verification?.verifiedById
          ? (nameById.get(String(verification.verifiedById)) ?? null)
          : null,
        respondedAt: verification?.respondedAt
          ? new Date(verification.respondedAt).toISOString()
          : null,
        respondedByName: verification?.respondedById
          ? (nameById.get(String(verification.respondedById)) ?? null)
          : null,
        replyNote: verification?.replyNote ?? null,
      };
    });

    const [department, queueDepartment] = await Promise.all([
      enrollment
        ? DepartmentModel.findById(String(enrollment.departmentId))
        : null,
      queue ? DepartmentModel.findById(String(queue.departmentId)) : null,
    ]);

    return {
      student: {
        studentProfileId: pid,
        studentName: owner?.name ?? "",
        studentNumber: profile.studentNumber ?? null,
      },
      year: {
        id: yearId,
        label: year.label,
        semesterLabel: year.semesterLabel,
      },
      enrollment:
        enrollment && department
          ? {
              academicYearId: yearId,
              academicYearLabel: year.label,
              semesterLabel: year.semesterLabel,
              departmentId: String(enrollment.departmentId),
              departmentName: department.name,
              departmentCode: deriveDepartmentCode(department.name),
              yearLevel: enrollment.yearLevel,
            }
          : null,
      steps: stepRows,
      queue: queue
        ? {
            status: queue.status,
            departmentId: String(queue.departmentId),
            departmentName: queueDepartment?.name ?? "",
            departmentCode: queueDepartment
              ? deriveDepartmentCode(queueDepartment.name)
              : "",
            joinedAt: queue.joinedAt
              ? new Date(queue.joinedAt).toISOString()
              : null,
            servedAt: queue.servedAt
              ? new Date(queue.servedAt).toISOString()
              : null,
            completedAt: queue.completedAt
              ? new Date(queue.completedAt).toISOString()
              : null,
          }
        : null,
      pendingRequirements: STEP_CODES.filter(
        (code) =>
          stepRows.find((row) => row.code === code)?.status !== "VERIFIED",
      ).length,
    };
  }

  static async record(
    actor: { id: string; role?: string },
    studentProfileId: string,
    academicYearId: string | undefined,
    requestedScope: "mine" | "all",
  ) {
    if (actor.role === "STUDENT") {
      throw new ApiError("FORBIDDEN", { message: "Forbidden." });
    }
    const year = await yearOrThrow(academicYearId);
    const yearId = String(year._id);
    if (actor.role === "ENROLLMENT_ADVISER" && requestedScope !== "all") {
      const enrollment = await StudentEnrollmentModel.findByProfileYear(
        studentProfileId,
        yearId,
      );
      if (enrollment) {
        await assertInScope(actor.id, String(enrollment.departmentId));
      }
    }
    const record = await StudentRecordService.load({
      studentProfileId,
      academicYearId: yearId,
    });
    if (!record) {
      throw new ApiError("NOT_FOUND", { message: "Student not found." });
    }
    return record;
  }
}
