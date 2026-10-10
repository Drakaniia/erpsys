import { ApiError } from "../../config/errors.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { UserModel } from "../../models/UserModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import { QueueServingService } from "../queues/QueueServingService.js";

export type AvailabilityView = {
  departmentId: string;
  myOpen: boolean;
  isOpen: boolean;
  openBy: { id: string; name: string } | null;
};

export class AdviserAvailabilityService {
  static async setOpen(
    adviserId: string,
    input: { departmentId: string; isOpen: boolean },
  ): Promise<AvailabilityView> {
    const year = await AcademicYearService.activeOrThrow();
    const academicYearId = String(year._id);

    const link = await AdviserDepartmentModel.findLink(
      adviserId,
      input.departmentId,
    );
    if (!link) {
      throw new ApiError("FORBIDDEN", {
        message: "Department not assigned to you.",
      });
    }

    const now = new Date();
    await AdviserAvailabilityModel.setOpen({
      adviserId,
      departmentId: input.departmentId,
      academicYearId,
      isOpen: input.isOpen,
      now,
    });

    // Closing keeps the waiting line (same as auto-close and sign-out) and
    // hands back the student I was serving.
    if (!input.isOpen) {
      const serving = await EnrollmentQueueModel.findInProgress(
        input.departmentId,
        academicYearId,
      );
      if (serving?.servedById === adviserId) {
        await QueueServingService.release(adviserId, {
          departmentId: input.departmentId,
          entryId: String(serving._id),
        });
      }
    }

    const open = await AdviserAvailabilityModel.listOpenByDepartment(
      input.departmentId,
      academicYearId,
    );
    const holder = open[0] && open[0].adviserId !== adviserId ? open[0] : null;
    const [holderUser] = holder
      ? await UserModel.findByIds([holder.adviserId])
      : [];

    return {
      departmentId: input.departmentId,
      myOpen: input.isOpen,
      isOpen: open.length > 0,
      openBy: holderUser
        ? { id: String(holderUser._id), name: holderUser.name ?? "" }
        : null,
    };
  }


  static async heartbeat(adviserId: string): Promise<{ touched: number }> {
    return {
      touched: await AdviserAvailabilityModel.touchOpen(adviserId, new Date()),
    };
  }
}
