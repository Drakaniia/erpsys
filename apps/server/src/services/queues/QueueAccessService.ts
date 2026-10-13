import { ApiError } from "../../config/errors.js";
import {
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  normalizeYearLevels,
  type YearLevel,
} from "../../config/constants.js";
import { isAvailabilityLive } from "../../config/availability.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import type { QueueEntryRow } from "../../models/EnrollmentQueueModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { UserModel } from "../../models/UserModel.js";

export class QueueAccessService {
  static async assertDepartmentAssigned(
    adviserId: string,
    departmentId: string,
  ): Promise<void> {
    if (!(await AdviserDepartmentModel.findLink(adviserId, departmentId))) {
      throw new ApiError("FORBIDDEN", {
        message: "Department not assigned to you.",
      });
    }
  }

  static async requireOpenQueue(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<void> {
    const availability = await AdviserAvailabilityModel.findOpenFor(
      adviserId,
      departmentId,
      academicYearId,
    );
    if (!availability || !isAvailabilityLive(availability)) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "Open the queue to serve students.",
        cause: { code: "QUEUE_CLOSED" },
      });
    }
  }

  static async entryOrThrow(
    entryId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<QueueEntryRow> {
    const entry = await EnrollmentQueueModel.findById(entryId);
    if (!entry || entry.departmentId !== departmentId) {
      throw new ApiError("NOT_FOUND", {
        message: "Queue entry not found in this department.",
      });
    }
    if (String(entry.academicYearId) !== academicYearId) {
      throw new ApiError("CONFLICT", {
        message: "This entry belongs to a different academic year.",
      });
    }
    return entry;
  }

  static async assertStudentLevelInScope(args: {
    adviserId: string;
    departmentId: string;
    studentProfileId: string;
    academicYearId: string;
  }): Promise<void> {
    const link = await AdviserDepartmentModel.findLink(
      args.adviserId,
      args.departmentId,
    );
    if (!link) {
      throw new ApiError("FORBIDDEN", {
        message: "Department not assigned to you.",
      });
    }
    const levels = normalizeYearLevels(
      (await AdviserDepartmentModel.listByDepartment(args.departmentId)).find(
        (row) => row.adviserId === args.adviserId,
      )?.yearLevels ?? [],
    );
    const enrollment = await StudentEnrollmentModel.findByProfileYear(
      args.studentProfileId,
      args.academicYearId,
    );
    const level = (enrollment?.yearLevel ?? null) as YearLevel | null;
    if (level === null || !departmentAcceptsLevel(levels, level)) {
      throw new ApiError("FORBIDDEN", {
        message: level
          ? `${YEAR_LEVEL_LABELS[level]} is outside the year levels assigned to you in this department.`
          : "This student has no year level on file — ask an admin to set their course.",
        cause: { code: "OUT_OF_LEVEL_SCOPE" },
      });
    }
  }

  /** First WAITING entry whose year level this adviser covers — FIFO within scope. */
  static async firstServable(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<QueueEntryRow | null> {
    const levels = normalizeYearLevels(
      (await AdviserDepartmentModel.findLink(adviserId, departmentId))
        ?.yearLevels ?? [],
    );
    // ponytail: scans up to 1000 waiting per department; page it if lines get longer.
    const waiting = await EnrollmentQueueModel.listByStatus(
      [departmentId],
      academicYearId,
      "WAITING",
      1000,
    );
    const levelByProfile = new Map(
      (
        await StudentEnrollmentModel.listByProfiles(
          waiting.map((row) => String(row.studentProfileId)),
          academicYearId,
        )
      ).map((row) => [String(row.studentProfileId), row.yearLevel ?? null]),
    );
    return (
      waiting.find((row) => {
        const level = levelByProfile.get(String(row.studentProfileId));
        return level != null && departmentAcceptsLevel(levels, level);
      }) ?? null
    );
  }

  static async servedByName(servedById: unknown): Promise<string> {
    if (!servedById) return "another adviser";
    const user = await UserModel.findById(String(servedById));
    return user?.name ?? "another adviser";
  }

  static async servingHolderName(
    departmentId: string,
    academicYearId: string,
  ): Promise<string> {
    const holder = await EnrollmentQueueModel.findInProgress(
      departmentId,
      academicYearId,
    );
    return QueueAccessService.servedByName(holder?.servedById);
  }
}
