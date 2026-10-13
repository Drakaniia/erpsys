import { ApiError } from "../../config/errors.js";
import { PRE_ENROLLMENT_STEP_CODES } from "../../config/constants.js";
import { genId } from "../../lib/db/ids.js";
import { env } from "../../lib/platform/env.js";
import { sendMail } from "../../lib/platform/mailer.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import type { QueueEntryRow } from "../../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import { QueueAccessService } from "../queues/QueueAccessService.js";

export type CompletionResult = {
  entryId: string;
  studentName: string;
  outcome: "enrolled" | "already";
};

export type RevertResult = {
  enrollmentId: string;
  reverted: true;
  returnedEntryId: string;
};

async function enrollmentStepOrNull(): Promise<string | null> {
  const step = await StepModel.findByCode("ENROLLMENT");
  return step ? String(step._id) : null;
}

async function verifiedCodes(
  studentProfileId: string,
  academicYearId: string,
): Promise<Set<string>> {
  const steps = await StepModel.listByCodes([...PRE_ENROLLMENT_STEP_CODES]);
  const codeById = new Map(steps.map((s) => [String(s._id), s.code]));
  const verified = await StepVerificationModel.listByProfileYear(
    studentProfileId,
    academicYearId,
  );
  return new Set(
    verified
      .filter((v) => v.status === "VERIFIED")
      .map((v) => codeById.get(String(v.stepId)))
      .filter((code): code is string => Boolean(code)),
  );
}

export class EnrollmentCompletionService {
  static async complete(
    adviserId: string,
    entryId: string,
    departmentId: string,
  ): Promise<CompletionResult> {
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);
    await QueueAccessService.assertDepartmentAssigned(adviserId, departmentId);
    const entry = await QueueAccessService.entryOrThrow(
      entryId,
      departmentId,
      yearId,
    );
    const profile = await StudentProfileModel.findById(
      String(entry.studentProfileId),
    );
    const studentName = profile
      ? ((await UserModel.findById(String(profile.userId)))?.name ?? "")
      : "";
    await QueueAccessService.assertStudentLevelInScope({
      adviserId,
      departmentId,
      studentProfileId: String(entry.studentProfileId),
      academicYearId: yearId,
    });

    if (entry.status === "COMPLETED") {
      return { entryId: String(entry._id), studentName, outcome: "already" };
    }
    if (entry.status !== "IN_PROGRESS") {
      throw new ApiError("CONFLICT", {
        message:
          "Student must be in the serving area first — click Serve before enrolling.",
        cause: { code: "NOT_SERVING" },
      });
    }
    if (entry.servedById !== adviserId) {
      throw new ApiError("FORBIDDEN", {
        message: "This student is being served by another adviser.",
        cause: { code: "NOT_YOUR_SERVING" },
      });
    }

    const verified = await verifiedCodes(
      String(entry.studentProfileId),
      yearId,
    );
    const missing = [...PRE_ENROLLMENT_STEP_CODES].filter(
      (code) => !verified.has(code),
    );
    if (missing.length > 0) {
      throw new ApiError("CONFLICT", {
        message: `Steps 1–5 must be verified first — missing: ${missing.join(", ")}.`,
      });
    }

    const now = new Date();
    const ok = await EnrollmentQueueModel.transition(
      String(entry._id),
      "IN_PROGRESS",
      { status: "COMPLETED", servedById: adviserId, completedAt: now },
    );
    if (!ok) {
      throw new ApiError("CONFLICT", {
        message: "This enrollment is no longer in the serving area.",
        cause: { code: "NOT_SERVING" },
      });
    }

    const stepId = await enrollmentStepOrNull();
    if (stepId) {
      await StepVerificationModel.verify(
        String(entry.studentProfileId),
        stepId,
        yearId,
        adviserId,
        now,
      );
    }

    const dept = await DepartmentModel.findById(departmentId);
    if (profile) {
      await NotificationModel.insert({
        _id: genId("notification"),
        userId: String(profile.userId),
        type: "ENROLLED",
        title: "Enrollment complete",
        body: `You are officially enrolled — ${dept?.name ?? "department"}.`,
        action: {
          kind: "enrollment-report",
          label: "Download enrollment report",
        },
        createdAt: now,
      });
      publishToUser(String(profile.userId), "notifications");

      const student = await UserModel.findById(String(profile.userId));
      const email = student?.email?.trim();
      if (email) {
        const origin = env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL;
        // Fire-and-forget: a slow mail provider must not hold the request.
        void sendMail({
          to: email,
          subject: "Enrollment complete — ERPSYS",
          text: `You are officially enrolled — ${dept?.name ?? "department"}.\n\nYour enrollment report is in your ERPSYS notifications: ${origin}`,
        }).catch((error) =>
          console.error("[enrollment] completion email failed", error),
        );
      }
    }
    return { entryId: String(entry._id), studentName, outcome: "enrolled" };
  }

  static async revert(
    adviserId: string,
    enrollmentId: string,
    departmentId: string,
    reason: string,
  ): Promise<RevertResult> {
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);
    await QueueAccessService.assertDepartmentAssigned(adviserId, departmentId);
    const rows = await EnrollmentQueueModel.listByIds([enrollmentId]);
    const entry = rows[0];
    if (!entry || entry.departmentId !== departmentId) {
      throw new ApiError("NOT_FOUND", {
        message: "Enrollment record not found.",
      });
    }
    if (String(entry.academicYearId) !== yearId) {
      throw new ApiError("CONFLICT", {
        message: "This entry belongs to a different academic year.",
      });
    }
    if (entry.status !== "COMPLETED") {
      throw new ApiError("CONFLICT", {
        message:
          "This enrollment has already been reverted or is not completed.",
      });
    }
    await QueueAccessService.assertStudentLevelInScope({
      adviserId,
      departmentId,
      studentProfileId: String(entry.studentProfileId),
      academicYearId: yearId,
    });
    const head = await EnrollmentQueueModel.findEarliestInLine(
      departmentId,
      yearId,
    );
    const joinedAt = head
      ? new Date(new Date(head.joinedAt ?? 0).getTime() - 1)
      : new Date(0);
    const returnedEntryId = await EnrollmentCompletionService.revertOne({
      entry,
      departmentId,
      yearId,
      adviserId,
      reason,
      joinedAt,
      now: new Date(),
    });
    return { enrollmentId, reverted: true, returnedEntryId };
  }

  static async revertMany(
    adviserId: string,
    departmentId: string,
    enrollmentIds: string[],
    reason: string,
  ): Promise<{
    revertedCount: number;
    revertedIds: string[];
    returnedEntryIds: string[];
  }> {
    const year = await AcademicYearService.activeOrThrow();
    const yearId = String(year._id);
    await QueueAccessService.assertDepartmentAssigned(adviserId, departmentId);
    const rowById = new Map(
      (await EnrollmentQueueModel.listByIds(enrollmentIds)).map((row) => [
        String(row._id),
        row,
      ]),
    );
    for (const id of enrollmentIds) {
      const entry = rowById.get(id);
      if (!entry || entry.departmentId !== departmentId) {
        throw new ApiError("NOT_FOUND", {
          message: `Enrollment record not found: ${id}`,
        });
      }
      if (String(entry.academicYearId) !== yearId) {
        throw new ApiError("CONFLICT", {
          message: "This entry belongs to a different academic year.",
        });
      }
      if (entry.status !== "COMPLETED") {
        throw new ApiError("CONFLICT", {
          message:
            "This enrollment has already been reverted or is not completed.",
        });
      }
      await QueueAccessService.assertStudentLevelInScope({
        adviserId,
        departmentId,
        studentProfileId: String(entry.studentProfileId),
        academicYearId: yearId,
      });
    }

    const head = await EnrollmentQueueModel.findEarliestInLine(
      departmentId,
      yearId,
    );
    const baseJoinedAt = head ? new Date(head.joinedAt ?? 0).getTime() : 0;

    const returnedEntryIds: string[] = [];
    const now = new Date();
    for (let index = 0; index < enrollmentIds.length; index++) {
      const id = enrollmentIds[index]!;
      returnedEntryIds.push(
        await EnrollmentCompletionService.revertOne({
          entry: rowById.get(id)!,
          departmentId,
          yearId,
          adviserId,
          reason,
          joinedAt: new Date(baseJoinedAt - (enrollmentIds.length - index)),
          now,
        }),
      );
    }
    return {
      revertedCount: enrollmentIds.length,
      revertedIds: enrollmentIds,
      returnedEntryIds,
    };
  }

  private static async revertOne(args: {
    entry: QueueEntryRow;
    departmentId: string;
    yearId: string;
    adviserId: string;
    reason: string;
    joinedAt: Date;
    now: Date;
  }): Promise<string> {
    const studentProfileId = String(args.entry.studentProfileId);
    // One guarded write: the COMPLETED row goes back to the head of the line,
    // so a double revert or a crash can't lose or duplicate the entry.
    const returnedEntryId = String(args.entry._id);
    const reverted = await EnrollmentQueueModel.transition(
      returnedEntryId,
      "COMPLETED",
      {
        status: "WAITING",
        joinedAt: args.joinedAt,
        completedAt: null,
        servedById: null,
        servedAt: null,
      },
    );
    if (!reverted) {
      throw new ApiError("CONFLICT", {
        message:
          "This enrollment has already been reverted or is not completed.",
      });
    }

    const stepId = await enrollmentStepOrNull();
    if (stepId) {
      await StepVerificationModel.revoke(
        studentProfileId,
        stepId,
        args.yearId,
        args.adviserId,
        args.now,
      );
    }

    const profile = await StudentProfileModel.findById(studentProfileId);
    if (profile) {
      const userId = String(profile.userId);
      const previous = await NotificationModel.findLatestByType(
        userId,
        "ENROLLED",
      );
      if (previous) {
        await NotificationModel.updateById(previous._id, {
          readAt: args.now,
          title: `[Retracted] ${previous.title}`,
          action: null,
        });
      }
      const dept = await DepartmentModel.findById(args.departmentId);
      await NotificationModel.insert({
        _id: genId("notification"),
        userId,
        type: "ENROLLED_REVOKED",
        title: "Enrollment revoked",
        body: `Your enrollment for ${dept?.name ?? "your department"} was reverted — you're back at #1, please wait.`,
        createdAt: args.now,
      });
      publishToUser(userId, "notifications");
      publishToUser(userId, "queue");
    }

    await AdminActionLogModel.log(
      args.adviserId,
      "REVERT_ENROLLMENT",
      `EnrollmentQueue:${args.entry._id}/StudentProfile:${studentProfileId}`,
      args.reason,
    );
    return returnedEntryId;
  }
}
