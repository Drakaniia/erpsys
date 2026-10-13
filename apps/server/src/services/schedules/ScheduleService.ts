import { ApiError } from "../../config/errors.js";
import {
  manilaDate,
  validateWindows,
  type ScheduleWindow,
} from "../../config/schedule.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { CalendarConnectionModel } from "../../models/CalendarConnectionModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import {
  CalendarSyncService,
  type SyncState,
} from "../calendar/CalendarSyncService.js";

export type ScheduleView = {
  departmentId: string;
  windows: ScheduleWindow[];
  sync: SyncState;
};

function pick(row: ScheduleWindow): ScheduleWindow {
  return {
    kind: row.kind,
    ...(row.weekday !== undefined && { weekday: row.weekday }),
    ...(row.date !== undefined && { date: row.date }),
    ...(row.startMinute !== undefined && { startMinute: row.startMinute }),
    ...(row.endMinute !== undefined && { endMinute: row.endMinute }),
  };
}

function current(rows: ScheduleWindow[]): ScheduleWindow[] {
  const today = manilaDate(Date.now());
  return rows.filter((row) => row.kind === "WEEKLY" || row.date! >= today);
}

export class ScheduleService {
  static async get(
    adviserId: string,
    departmentId: string,
  ): Promise<ScheduleView> {
    const year = await AcademicYearService.activeOrThrow();
    const rows = await AvailabilityWindowModel.listForAdviserDepartment(
      adviserId,
      departmentId,
      String(year._id),
    );
    return {
      departmentId,
      windows: current(rows.map(pick)),
      sync: CalendarSyncService.stateOf(
        await CalendarConnectionModel.findByUser(adviserId),
      ),
    };
  }

  static async save(
    adviserId: string,
    input: { departmentId: string; windows: ScheduleWindow[] },
  ): Promise<ScheduleView> {
    const year = await AcademicYearService.activeOrThrow();
    const link = await AdviserDepartmentModel.findLink(
      adviserId,
      input.departmentId,
    );
    if (!link) {
      throw new ApiError("FORBIDDEN", {
        message: "Department not assigned to you.",
      });
    }
    const windows = current(input.windows.map(pick));
    validateWindows(windows);
    await AvailabilityWindowModel.replace(
      adviserId,
      input.departmentId,
      String(year._id),
      windows,
    );
    return {
      departmentId: input.departmentId,
      windows,
      sync: await CalendarSyncService.afterScheduleChange(adviserId),
    };
  }
}
