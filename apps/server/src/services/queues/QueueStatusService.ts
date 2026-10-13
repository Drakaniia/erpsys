import {
  aheadInLine,
  levelsCoveredByDepartment,
  openByDepartment,
  type ServingRow,
} from "../../config/queue.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";

export type MyQueueStatus = {
  entryId: string;
  departmentId: string;
  departmentName: string;
  status: string;
  position: number | null;
  joinedAt: string;
  servedByName: string | null;
  completedAt: string | null;
  deptOpen: boolean;
  servesMyLevel: boolean;
};

export class QueueStatusService {
  static async load(userId: string): Promise<MyQueueStatus | null> {
    const [profile, year] = await Promise.all([
      StudentProfileModel.findByUserId(userId),
      AcademicYearModel.findActive(),
    ]);
    if (!profile || !year) return null;

    const entry = await EnrollmentQueueModel.findByProfileYear(
      profile._id,
      String(year._id),
    );
    if (!entry) return null;

    const [department, availabilities, servingAdviser, position, enrollment] =
      await Promise.all([
        DepartmentModel.findById(entry.departmentId),
        AdviserAvailabilityModel.listOpenByDepartment(
          entry.departmentId,
          String(year._id),
        ),
        entry.servedById
          ? UserModel.findById(entry.servedById)
          : Promise.resolve(null),
        entry.status === "WAITING"
          ? QueueStatusService.position(entry)
          : Promise.resolve(null),
        StudentEnrollmentModel.findByProfileYear(profile._id, String(year._id)),
      ]);

    const assignments =
      availabilities.length === 0
        ? []
        : await AdviserDepartmentModel.listByDepartment(entry.departmentId);

    const servedLevels =
      levelsCoveredByDepartment({
        availabilities,
        serving: [] as ServingRow[],
        assignments,
      }).get(entry.departmentId) ?? [];

    return {
      entryId: String(entry._id),
      departmentId: String(entry.departmentId),
      departmentName: department?.name ?? "Department",
      status: entry.status ?? "",
      position,
      joinedAt: new Date(entry.joinedAt ?? Date.now()).toISOString(),
      servedByName: servingAdviser?.name ?? null,
      completedAt: entry.completedAt
        ? new Date(entry.completedAt).toISOString()
        : null,
      deptOpen: openByDepartment({
        availabilities,
        serving: [] as ServingRow[],
      }).has(entry.departmentId),
      servesMyLevel:
        entry.status === "IN_PROGRESS" ||
        (enrollment?.yearLevel
          ? servedLevels.includes(enrollment.yearLevel)
          : false),
    };
  }

  static async position(entry: {
    _id: string;
    departmentId: string;
    academicYearId: string;
    joinedAt?: Date | null;
  }): Promise<number> {
    const ahead = await EnrollmentQueueModel.countInLine(
      aheadInLine({
        departmentId: entry.departmentId,
        academicYearId: entry.academicYearId,
        entryId: String(entry._id),
        joinedAt: entry.joinedAt ?? new Date(),
      }),
    );
    return ahead + 1;
  }
}
