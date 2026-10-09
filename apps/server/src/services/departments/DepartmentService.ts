import {
  deriveDepartmentCode,
  normalizeYearLevels,
  type YearLevel,
} from "../../config/constants.js";
import {
  availabilityKey,
  levelsCoveredByDepartment,
  liveAvailabilityPairs,
} from "../../config/queue.js";
import type { DepartmentRow } from "../../models/DepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import type { ScheduleSummary } from "../../config/schedule.js";
import { ScheduleViewService } from "../schedules/ScheduleViewService.js";

export type DepartmentView = {
  id: string;
  name: string;
  code: string;
  yearLevels: YearLevel[];
  isActive: boolean;
};

export type MyDepartmentView = {
  departmentId: string;
  departmentName: string;
  code: string;
  isOpen: boolean;
  openBy: { id: string; name: string } | null;
  waitingCount: number;
  servesMyLevel: boolean;
  myYearLevel: YearLevel;
  openLevels: YearLevel[];
  schedule: ScheduleSummary;
};

export class DepartmentService {
  static toView(row: DepartmentRow): DepartmentView {
    return {
      id: String(row._id),
      name: row.name,
      code: deriveDepartmentCode(row.name),
      yearLevels: normalizeYearLevels(row.yearLevels ?? []),
      isActive: row.isActive,
    };
  }

  static async listActive(): Promise<DepartmentView[]> {
    return (await DepartmentModel.listActive()).map(DepartmentService.toView);
  }

  static async myDepartment(userId: string): Promise<MyDepartmentView | null> {
    const [profile, year] = await Promise.all([
      StudentProfileModel.findByUserId(userId),
      AcademicYearModel.findActive(),
    ]);
    if (!profile || !year) return null;
    const yearId = String(year._id);

    const enrollment = await StudentEnrollmentModel.findByProfileYear(
      profile._id,
      yearId,
    );
    if (!enrollment) return null;
    const departmentId = String(enrollment.departmentId);

    const [department, availabilities, serving, waitingCount, schedule] =
      await Promise.all([
        DepartmentModel.findById(departmentId),
        AdviserAvailabilityModel.listOpenByDepartment(departmentId, yearId),
        EnrollmentQueueModel.listInProgress(departmentId, yearId),
        EnrollmentQueueModel.countInLine({
          departmentId,
          academicYearId: yearId,
          status: { $in: ["WAITING", "IN_PROGRESS"] },
        }),
        ScheduleViewService.forDepartment(departmentId, yearId),
      ]);
    if (!department || !department.isActive) return null;

    const livePairs = liveAvailabilityPairs({ availabilities, serving });
    const adviserIds = [...new Set(availabilities.map((a) => a.adviserId))];
    const [advisers, assignments] =
      adviserIds.length > 0
        ? await Promise.all([
            UserModel.findByIds(adviserIds),
            AdviserDepartmentModel.listByDepartment(departmentId),
          ])
        : [[], []];

    const coveredLevels =
      levelsCoveredByDepartment({ availabilities, serving, assignments }).get(
        departmentId,
      ) ?? [];
    const nameById = new Map(
      advisers.map((u) => [String(u._id), u.name ?? "Adviser"] as const),
    );
    const firstLive = availabilities.find((a) =>
      livePairs.has(availabilityKey(a.adviserId, departmentId)),
    );

    return {
      departmentId,
      departmentName: department.name,
      code: deriveDepartmentCode(department.name),
      isOpen: Boolean(firstLive),
      openBy: firstLive
        ? {
            id: firstLive.adviserId,
            name: nameById.get(firstLive.adviserId) ?? "Adviser",
          }
        : null,
      waitingCount,
      servesMyLevel: coveredLevels.includes(enrollment.yearLevel),
      myYearLevel: enrollment.yearLevel,
      openLevels: coveredLevels,
      schedule,
    };
  }
}
