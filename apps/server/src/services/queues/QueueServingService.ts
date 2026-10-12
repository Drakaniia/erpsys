import { ApiError } from "../../config/errors.js";
import { aheadInLine, isDuplicateKeyError } from "../../config/queue.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import { QueueAccessService } from "./QueueAccessService.js";
import {
  departmentNameOf,
  notifyQueue,
  pingDepartmentAdvisers,
  pingStudentQueue,
} from "./QueueNotifications.js";

export class QueueServingService {
  static async serve(
    adviserId: string,
    input: { departmentId: string; entryId: string },
  ): Promise<{ entryId: string; status: string }> {
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);
    await QueueAccessService.assertDepartmentAssigned(
      adviserId,
      input.departmentId,
    );
    await QueueAccessService.requireOpenQueue(
      adviserId,
      input.departmentId,
      yearId,
    );
    const entry = await QueueAccessService.entryOrThrow(
      input.entryId,
      input.departmentId,
      yearId,
    );
    if (entry.status === "IN_PROGRESS" && entry.servedById === adviserId) {
      return { entryId: String(entry._id), status: "IN_PROGRESS" };
    }
    if (entry.status === "IN_PROGRESS") {
      const holder = await QueueAccessService.servedByName(entry.servedById);
      throw new ApiError("CONFLICT", {
        message: `Another adviser took this student first — ${holder}.`,
        cause: {
          code: "ALREADY_SERVING",
          servedByName: holder,
          lostRace: "ENTRY",
        },
      });
    }
    if (entry.status !== "WAITING") {
      throw new ApiError("CONFLICT", {
        message: "This student is no longer waiting.",
        cause: { code: "NOT_WAITING" },
      });
    }

    await QueueAccessService.assertStudentLevelInScope({
      adviserId,
      departmentId: input.departmentId,
      studentProfileId: entry.studentProfileId,
      academicYearId: yearId,
    });

    const first = await QueueAccessService.firstServable(
      adviserId,
      input.departmentId,
      yearId,
    );
    if (!first || String(first._id) !== input.entryId) {
      throw new ApiError("CONFLICT", {
        message: "Not next in line — strict FIFO.",
        cause: { code: "NOT_NEXT_IN_LINE" },
      });
    }

    let transitioned: boolean;
    try {
      transitioned = await EnrollmentQueueModel.transition(
        entry._id,
        "WAITING",
        {
          status: "IN_PROGRESS",
          servedById: adviserId,
          servedAt: new Date(),
        },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const holder = await QueueAccessService.servingHolderName(
        input.departmentId,
        yearId,
      );
      throw new ApiError("CONFLICT", {
        message: `Another adviser is already serving this department — ${holder} holds the only serving slot.`,
        cause: {
          code: "ALREADY_SERVING",
          servedByName: holder,
          lostRace: "DEPARTMENT",
        },
      });
    }
    if (!transitioned) {
      const latest = await EnrollmentQueueModel.findById(entry._id);
      const holder = await QueueAccessService.servedByName(latest?.servedById);
      throw new ApiError("CONFLICT", {
        message: `Another adviser took this student first — ${holder}.`,
        cause: {
          code: "ALREADY_SERVING",
          servedByName: holder,
          lostRace: "ENTRY",
        },
      });
    }

    const [profile, department] = await Promise.all([
      StudentProfileModel.findById(entry.studentProfileId),
      DepartmentModel.findById(input.departmentId),
    ]);
    if (profile) {
      await notifyQueue(
        profile.userId,
        "QUEUE_SERVING",
        "It's your turn",
        `The adviser is serving you now — ${departmentNameOf(department)}.`,
      );
    }
    await pingDepartmentAdvisers(input.departmentId);
    return { entryId: String(entry._id), status: "IN_PROGRESS" };
  }

  static async release(
    adviserId: string,
    input: { departmentId: string; entryId: string },
  ): Promise<{ entryId: string; status: string }> {
    const year = await AcademicYearService.activeOrThrow();
    await QueueAccessService.assertDepartmentAssigned(
      adviserId,
      input.departmentId,
    );
    const entry = await QueueAccessService.entryOrThrow(
      input.entryId,
      input.departmentId,
      String(year._id),
    );

    if (
      entry.status === "IN_PROGRESS" &&
      entry.servedById === adviserId &&
      (await EnrollmentQueueModel.transition(entry._id, "IN_PROGRESS", {
        status: "WAITING",
        servedById: null,
        servedAt: null,
      }))
    ) {
      await pingStudentQueue(entry.studentProfileId);
      await pingDepartmentAdvisers(input.departmentId);
      return { entryId: String(entry._id), status: "WAITING" };
    }
    const latest = await EnrollmentQueueModel.findById(entry._id);
    return { entryId: String(entry._id), status: latest?.status ?? "" };
  }

  static async moveToEnd(
    adviserId: string,
    input: { departmentId: string; entryId: string },
  ): Promise<{ entryId: string; position: number }> {
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);
    await QueueAccessService.assertDepartmentAssigned(
      adviserId,
      input.departmentId,
    );
    const entry = await QueueAccessService.entryOrThrow(
      input.entryId,
      input.departmentId,
      yearId,
    );

    if (entry.status !== "WAITING" && entry.status !== "IN_PROGRESS") {
      throw new ApiError("CONFLICT", {
        message: "Only waiting or serving students can be moved.",
      });
    }
    if (entry.status === "IN_PROGRESS" && entry.servedById !== adviserId) {
      throw new ApiError("FORBIDDEN", {
        message:
          "Only the adviser currently serving this student can move them.",
      });
    }
    await QueueAccessService.assertStudentLevelInScope({
      adviserId,
      departmentId: input.departmentId,
      studentProfileId: entry.studentProfileId,
      academicYearId: yearId,
    });

    // The student I'm serving can always go to the back; a waiting one only
    // when they're first in my scope.
    if (entry.status === "WAITING") {
      const first = await QueueAccessService.firstServable(
        adviserId,
        input.departmentId,
        yearId,
      );
      if (!first || String(first._id) !== input.entryId) {
        throw new ApiError("CONFLICT", {
          message: "Only the first student in line can be moved to end.",
          cause: { code: "NOT_NEXT_IN_LINE" },
        });
      }
    }

    const movedAt = new Date();
    const moved = await EnrollmentQueueModel.transition(
      entry._id,
      entry.status,
      {
        status: "WAITING",
        servedById: null,
        servedAt: null,
        joinedAt: movedAt,
        movedToEndById: adviserId,
        movedToEndAt: movedAt,
      },
    );
    if (!moved) {
      throw new ApiError("CONFLICT", {
        message: "This student's place changed — refresh and try again.",
      });
    }
    const position =
      (await EnrollmentQueueModel.countInLine(
        aheadInLine({
          departmentId: input.departmentId,
          academicYearId: yearId,
          entryId: String(entry._id),
          joinedAt: movedAt,
        }),
      )) + 1;

    const [profile, department] = await Promise.all([
      StudentProfileModel.findById(entry.studentProfileId),
      DepartmentModel.findById(input.departmentId),
    ]);
    if (profile) {
      await notifyQueue(
        profile.userId,
        "QUEUE_MOVED",
        "Moved to end of queue",
        `The adviser moved you to the back — new position #${position} in ${departmentNameOf(department)}.`,
      );
    }
    return { entryId: String(entry._id), position };
  }
}
