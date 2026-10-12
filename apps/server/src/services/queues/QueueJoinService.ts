import { ApiError } from "../../config/errors.js";
import { PRE_ENROLLMENT_STEP_CODES } from "../../config/constants.js";
import {
  assertLeavable,
  assertLevelServed,
  isDuplicateKeyError,
  levelsCoveredByDepartment,
  missingPreEnrollmentCodes,
  openByDepartment,
} from "../../config/queue.js";
import { genId } from "../../lib/db/ids.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { StudentProfileService } from "../students/StudentProfileService.js";
import { pingDepartmentAdvisers } from "./QueueNotifications.js";
import { QueueStatusService } from "./QueueStatusService.js";

export type JoinResult = {
  entryId: string;
  departmentName: string;
  position: number;
};

export class QueueJoinService {
  static async join(
    user: { id: string; email: string },
    departmentId: string,
  ): Promise<JoinResult> {
    const { profile, year } = await StudentProfileService.requireContext(user);
    const yearId = String(year._id);

    const enrollment = await StudentEnrollmentModel.findByProfileYear(
      profile._id,
      yearId,
    );
    if (!enrollment) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "Set your course and year level before joining a queue.",
      });
    }
    if (departmentId !== String(enrollment.departmentId)) {
      throw new ApiError("CONFLICT", {
        message:
          "That queue is not the one on your enrollment record — update your course first.",
      });
    }

    const department = await DepartmentModel.findById(departmentId);
    if (!department || !department.isActive) {
      throw new ApiError("NOT_FOUND", { message: "Department not found." });
    }

    const [verifications, stepRows] = await Promise.all([
      StepVerificationModel.listByProfileYear(profile._id, yearId),
      StepModel.listByCodes([...PRE_ENROLLMENT_STEP_CODES]),
    ]);
    const missing = missingPreEnrollmentCodes(
      verifications,
      new Map(stepRows.map((s) => [String(s._id), s.code] as const)),
      PRE_ENROLLMENT_STEP_CODES,
    );
    if (missing.length > 0) {
      throw new ApiError("CONFLICT", {
        message: `Complete steps 1–5 first — missing: ${missing.join(", ")}.`,
      });
    }

    const [availabilities, serving] = await Promise.all([
      AdviserAvailabilityModel.listOpenByDepartment(departmentId, yearId),
      EnrollmentQueueModel.listInProgress(departmentId, yearId),
    ]);
    if (!openByDepartment({ availabilities, serving }).has(departmentId)) {
      throw new ApiError("CONFLICT", {
        message: "Queue closed — the adviser is not yet accepting students.",
      });
    }

    const assignments =
      await AdviserDepartmentModel.listByDepartment(departmentId);
    assertLevelServed({
      departmentName: department.name,
      yearLevel: enrollment.yearLevel,
      coveredLevels:
        levelsCoveredByDepartment({ availabilities, serving, assignments }).get(
          departmentId,
        ) ?? [],
    });

    const entryId = genId("queue");
    const joinedAt = new Date();
    try {
      await EnrollmentQueueModel.insert({
        _id: entryId,
        departmentId,
        studentProfileId: profile._id,
        academicYearId: yearId,
        status: "WAITING",
        joinedAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw new ApiError("INTERNAL_SERVER_ERROR", {
          message: "Could not join the queue — please try again.",
          cause: error,
        });
      }
      throw new ApiError("CONFLICT", {
        message: "You already have a queue entry this year.",
      });
    }

    const position = await QueueStatusService.position({
      _id: entryId,
      departmentId,
      academicYearId: yearId,
      joinedAt,
    });
    await NotificationModel.insert({
      _id: genId("notification"),
      userId: user.id,
      type: "QUEUE_JOINED",
      title: "You joined the queue",
      body: `${department.name} — position #${position}.`,
      createdAt: new Date(),
    });
    publishToUser(user.id, "queue");
    for (const link of assignments) publishToUser(link.adviserId, "queue");
    return { entryId, departmentName: department.name, position };
  }

  static async leave(user: { id: string }): Promise<{ left: true }> {
    const profile = await StudentProfileModel.findByUserId(user.id);
    if (!profile) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No student profile found.",
      });
    }
    const year = await AcademicYearModel.findActive();
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year.",
      });
    }

    const entry = await EnrollmentQueueModel.findByProfileYear(
      profile._id,
      String(year._id),
    );
    if (!entry) return { left: true };

    assertLeavable(entry.status ?? "");
    if (await EnrollmentQueueModel.deleteIfWaiting(entry._id)) {
      publishToUser(user.id, "queue");
      await pingDepartmentAdvisers(entry.departmentId);
      return { left: true };
    }

    const current = await EnrollmentQueueModel.findById(entry._id);
    if (!current) return { left: true };
    assertLeavable(current.status ?? "");
    throw new ApiError("CONFLICT", {
      message:
        "Your queue entry changed while you were leaving — please try again.",
    });
  }
}
