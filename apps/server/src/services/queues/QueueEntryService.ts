import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "../../config/errors.js";
import { isDuplicateKeyError } from "../../config/queue.js";
import { env } from "../../lib/platform/env.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import { QueueAccessService } from "./QueueAccessService.js";
import { departmentNameOf, notifyQueue } from "./QueueNotifications.js";

export type EntrySnapshot = {
  entryId: string;
  departmentId: string;
  studentProfileId: string;
  academicYearId: string;
  joinedAt: string;
  studentName: string;
  /** `<removedAtMs>.<hmac>` — proves the snapshot came from this server. */
  token: string;
};

const UNDO_WINDOW_MS = 60_000;

function undoSignature(
  adviserId: string,
  entryId: string,
  s: Omit<EntrySnapshot, "entryId" | "studentName" | "token">,
  removedAt: string,
): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(
      JSON.stringify([
        adviserId,
        entryId,
        s.departmentId,
        s.studentProfileId,
        s.academicYearId,
        s.joinedAt,
        removedAt,
      ]),
    )
    .digest("base64url");
}

export type RemoveResult = {
  removed: boolean;
  reason: string | null;
  snapshot: EntrySnapshot;
};

export class QueueEntryService {
  static async remove(
    adviserId: string,
    entryId: string,
  ): Promise<RemoveResult> {
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);

    const entry = await EnrollmentQueueModel.findById(entryId);
    if (!entry) {
      throw new ApiError("NOT_FOUND", { message: "Queue entry not found." });
    }
    if (String(entry.academicYearId) !== yearId) {
      throw new ApiError("CONFLICT", {
        message: "This entry belongs to a different academic year.",
      });
    }
    await QueueAccessService.assertDepartmentAssigned(
      adviserId,
      entry.departmentId,
    );
    await QueueAccessService.assertStudentLevelInScope({
      adviserId,
      departmentId: entry.departmentId,
      studentProfileId: entry.studentProfileId,
      academicYearId: yearId,
    });

    if (entry.status === "COMPLETED") {
      throw new ApiError("CONFLICT", {
        message: "Student already enrolled — cannot remove from queue.",
      });
    }
    if (entry.status === "IN_PROGRESS") {
      throw new ApiError("CONFLICT", {
        message: "Student is currently being served — wait for them to finish.",
      });
    }
    if (entry.status !== "WAITING") {
      throw new ApiError("CONFLICT", {
        message: "Only waiting students can be removed.",
      });
    }

    const [profile, department] = await Promise.all([
      StudentProfileModel.findById(entry.studentProfileId),
      DepartmentModel.findById(entry.departmentId),
    ]);
    const student = profile ? await UserModel.findById(profile.userId) : null;

    const fields = {
      departmentId: entry.departmentId,
      studentProfileId: entry.studentProfileId,
      academicYearId: String(entry.academicYearId),
      joinedAt: new Date(entry.joinedAt ?? Date.now()).toISOString(),
    };
    const removedAt = String(Date.now());
    const snapshot: EntrySnapshot = {
      entryId: String(entry._id),
      ...fields,
      studentName: student?.name ?? "",
      token: `${removedAt}.${undoSignature(adviserId, String(entry._id), fields, removedAt)}`,
    };

    if (!(await EnrollmentQueueModel.deleteIfWaiting(entry._id))) {
      const current = await EnrollmentQueueModel.findById(entry._id);
      const reason = !current
        ? "ALREADY_REMOVED"
        : current.status === "COMPLETED"
          ? "ALREADY_COMPLETED"
          : current.status === "IN_PROGRESS"
            ? "NOW_IN_PROGRESS"
            : "NO_LONGER_WAITING";
      return { removed: false, reason, snapshot };
    }

    if (profile) {
      await notifyQueue(
        profile.userId,
        "QUEUE_REMOVED_BY_ADVISER",
        "Removed from queue",
        `You were removed from the ${departmentNameOf(department)} queue by an adviser. You can re-join when the queue is open.`,
      );
    }
    return { removed: true, reason: null, snapshot };
  }

  static async restore(
    adviserId: string,
    entryId: string,
    input: {
      departmentId: string;
      studentProfileId: string;
      academicYearId: string;
      joinedAt: string;
      studentName: string;
      token: string;
    },
  ): Promise<{ restored: true; entryId: string }> {
    const [removedAt = "", signature = ""] = input.token.split(".");
    const expected = undoSignature(adviserId, entryId, input, removedAt);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      !(Date.now() - Number(removedAt) <= UNDO_WINDOW_MS)
    ) {
      throw new ApiError("FORBIDDEN", {
        message: "Undo expired — the student can re-join the queue.",
      });
    }
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);
    if (input.academicYearId !== yearId) {
      throw new ApiError("CONFLICT", {
        message: "This entry belongs to a different academic year.",
      });
    }
    await QueueAccessService.assertDepartmentAssigned(
      adviserId,
      input.departmentId,
    );

    if (
      await EnrollmentQueueModel.findByProfileYear(
        input.studentProfileId,
        input.academicYearId,
      )
    ) {
      throw new ApiError("CONFLICT", {
        message: "Student already re-joined — cannot undo.",
      });
    }
    if (await EnrollmentQueueModel.findById(entryId)) {
      throw new ApiError("CONFLICT", {
        message: "Queue entry already exists.",
      });
    }
    const department = await DepartmentModel.findById(input.departmentId);
    if (!department) {
      throw new ApiError("NOT_FOUND", { message: "Department not found." });
    }
    const profile = await StudentProfileModel.findById(input.studentProfileId);
    if (!profile) {
      throw new ApiError("NOT_FOUND", {
        message: "Student profile not found.",
      });
    }

    try {
      await EnrollmentQueueModel.insert({
        _id: entryId,
        departmentId: input.departmentId,
        studentProfileId: input.studentProfileId,
        academicYearId: input.academicYearId,
        joinedAt: new Date(input.joinedAt),
        status: "WAITING",
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      throw new ApiError("CONFLICT", {
        message: "Student already re-joined — cannot undo.",
      });
    }
    await notifyQueue(
      profile.userId,
      "QUEUE_RESTORED_BY_ADVISER",
      "Returned to queue",
      `You were returned to the ${departmentNameOf(department)} queue — your previous position was restored.`,
    );
    return { restored: true, entryId };
  }
}
