import { startSweeps } from "../../lib/db/sweeps.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { CalendarConnectionModel } from "../../models/CalendarConnectionModel.js";
import { CalendarSyncService } from "./CalendarSyncService.js";

const DUE_BATCH = 20;

export class CalendarSweepService {
  static async run(now: Date = new Date()): Promise<void> {
    const year = await AcademicYearModel.findActive();
    if (year) {
      const advisers = await AvailabilityWindowModel.deleteStaleYears(
        String(year._id),
      );
      for (const adviserId of advisers) {
        await CalendarConnectionModel.markDirty(adviserId, now);
      }
    }
    for (const row of await CalendarConnectionModel.listDue(now, DUE_BATCH)) {
      await CalendarSyncService.run(row.userId);
    }
  }
}

export function startCalendarSweeps(): () => void {
  return startSweeps({
    runSweep: () => CalendarSweepService.run(),
    label: "calendar-sweep",
  });
}
