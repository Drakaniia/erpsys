import { summarize, type ScheduleSummary } from "../../config/schedule.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";

export class ScheduleViewService {
  static async forDepartment(
    departmentId: string,
    academicYearId: string,
    now: number = Date.now(),
  ): Promise<ScheduleSummary> {
    const rows = await AvailabilityWindowModel.listByDepartment(
      departmentId,
      academicYearId,
    );
    return summarize(rows, now);
  }
}
