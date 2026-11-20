import {
  PRE_ENROLLMENT_STEP_CODES,
  findStepByCode,
  listStepsByCodes,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { genId } from "../lib/db/ids.js";
import { mailUser, siteOrigin } from "../lib/platform/mailer.js";
import { AdminActionLogModel } from "../models/AdminActionLogModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import {
  EnrollmentQueueModel,
  type QueueEntryRow,
} from "../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../models/NotificationModel.js";
import { StepVerificationModel } from "../models/StepVerificationModel.js";
import { UserModel } from "../models/UserModel.js";
import { activeYearOrThrow } from "./academic-years.js";
import {
  assertDepartmentAssigned,
  assertStudentLevelInScope,
  entryOrThrow,
} from "./queues.js";

const ALREADY_REVERTED =
  "This enrollment has already been reverted or is not completed.";

export async function complete(
  adviserId: string,
  entryId: string,
  departmentId: string,
): Promise<{
  entryId: string;
  studentName: string;
  outcome: "enrolled" | "already";
}> {
  const yearId = String((await activeYearOrThrow())._id);
  await assertDepartmentAssigned(adviserId, departmentId);
  const entry = await entryOrThrow(entryId, departmentId, yearId);
  const studentProfileId = String(entry.studentProfileId);
  const profile = await UserModel.findProfileById(studentProfileId);
  const studentName = profile
    ? ((await UserModel.findById(String(profile.userId)))?.name ?? "")
    : "";
  await assertStudentLevelInScope(
    adviserId,
    departmentId,
    studentProfileId,
    yearId,
  );

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

  const steps = listStepsByCodes(PRE_ENROLLMENT_STEP_CODES);
  const codeById = new Map(steps.map((s) => [String(s._id), s.code]));
  const verified = new Set(
    (await StepVerificationModel.listByProfileYear(studentProfileId, yearId))
      .filter((v) => v.status === "VERIFIED")
      .map((v) => codeById.get(String(v.stepId))),
  );
  const missing = PRE_ENROLLMENT_STEP_CODES.filter(
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
    adviserId,
  );
  if (!ok) {
    throw new ApiError("CONFLICT", {
      message: "This enrollment is no longer in the serving area.",
      cause: { code: "NOT_SERVING" },
    });
  }

  const step = findStepByCode("ENROLLMENT");
  if (step) {
    await StepVerificationModel.verify(
      studentProfileId,
      String(step._id),
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
    mailUser(
      String(profile.userId),
      "Enrollment complete — ERPSYS",
      `You are officially enrolled — ${dept?.name ?? "department"}.\n\nYour enrollment report is in your ERPSYS notifications: ${siteOrigin()}`,
    );
  }
  return { entryId: String(entry._id), studentName, outcome: "enrolled" };
}

async function revertable(
  adviserId: string,
  departmentId: string,
  yearId: string,
  entry: QueueEntryRow | undefined,
  notFound: string,
): Promise<QueueEntryRow> {
  if (!entry || entry.departmentId !== departmentId) {
    throw new ApiError("NOT_FOUND", { message: notFound });
  }
  if (String(entry.academicYearId) !== yearId) {
    throw new ApiError("CONFLICT", {
      message: "This entry belongs to a different academic year.",
    });
  }
  if (entry.status !== "COMPLETED") {
    throw new ApiError("CONFLICT", { message: ALREADY_REVERTED });
  }
  await assertStudentLevelInScope(
    adviserId,
    departmentId,
    String(entry.studentProfileId),
    yearId,
  );
  return entry;
}

async function revertOne(
  entry: QueueEntryRow,
  departmentId: string,
  yearId: string,
  adviserId: string,
  reason: string,
  joinedAt: Date,
  now: Date,
): Promise<string> {
  const studentProfileId = String(entry.studentProfileId);
  const returnedEntryId = String(entry._id);
  const reverted = await EnrollmentQueueModel.transition(
    returnedEntryId,
    "COMPLETED",
    {
      status: "WAITING",
      joinedAt,
      completedAt: null,
      servedById: null,
      servedAt: null,
    },
  );
  if (!reverted) {
    throw new ApiError("CONFLICT", { message: ALREADY_REVERTED });
  }

  const step = findStepByCode("ENROLLMENT");
  if (step) {
    await StepVerificationModel.revoke(
      studentProfileId,
      String(step._id),
      yearId,
      adviserId,
      now,
    );
  }

  const profile = await UserModel.findProfileById(studentProfileId);
  if (profile) {
    const userId = String(profile.userId);
    const previous = await NotificationModel.findLatestByType(
      userId,
      "ENROLLED",
    );
    if (previous) {
      await NotificationModel.updateById(previous._id, {
        title: `[Retracted] ${previous.title}`,
        action: null,
      });
    }
    const dept = await DepartmentModel.findById(departmentId);
    await NotificationModel.insert({
      _id: genId("notification"),
      userId,
      type: "ENROLLED_REVOKED",
      title: "Enrollment revoked",
      body: `Your enrollment for ${dept?.name ?? "your department"} was reverted — you're back at #1, please wait.`,
      createdAt: now,
    });
  }

  await AdminActionLogModel.log(
    adviserId,
    "REVERT_ENROLLMENT",
    `EnrollmentQueue:${entry._id}/StudentProfile:${studentProfileId}`,
    reason,
  );
  return returnedEntryId;
}

export async function revert(
  adviserId: string,
  enrollmentId: string,
  departmentId: string,
  reason: string,
): Promise<{ enrollmentId: string; reverted: true; returnedEntryId: string }> {
  const yearId = String((await activeYearOrThrow())._id);
  await assertDepartmentAssigned(adviserId, departmentId);
  const [row] = await EnrollmentQueueModel.listByIds([enrollmentId]);
  const entry = await revertable(
    adviserId,
    departmentId,
    yearId,
    row,
    "Enrollment record not found.",
  );
  const head = await EnrollmentQueueModel.findEarliestInLine(
    departmentId,
    yearId,
  );
  const joinedAt = head
    ? new Date(new Date(head.joinedAt ?? 0).getTime() - 1)
    : new Date(0);
  const returnedEntryId = await revertOne(
    entry,
    departmentId,
    yearId,
    adviserId,
    reason,
    joinedAt,
    new Date(),
  );
  return { enrollmentId, reverted: true, returnedEntryId };
}

export async function revertMany(
  adviserId: string,
  departmentId: string,
  enrollmentIds: string[],
  reason: string,
): Promise<{
  revertedCount: number;
  revertedIds: string[];
  returnedEntryIds: string[];
}> {
  const yearId = String((await activeYearOrThrow())._id);
  await assertDepartmentAssigned(adviserId, departmentId);
  const rowById = new Map(
    (await EnrollmentQueueModel.listByIds(enrollmentIds)).map((row) => [
      String(row._id),
      row,
    ]),
  );
  const entries: QueueEntryRow[] = [];
  for (const id of enrollmentIds) {
    entries.push(
      await revertable(
        adviserId,
        departmentId,
        yearId,
        rowById.get(id),
        `Enrollment record not found: ${id}`,
      ),
    );
  }

  const head = await EnrollmentQueueModel.findEarliestInLine(
    departmentId,
    yearId,
  );
  const baseJoinedAt = head ? new Date(head.joinedAt ?? 0).getTime() : 0;
  const now = new Date();
  const returnedEntryIds: string[] = [];
  for (const [index, entry] of entries.entries()) {
    returnedEntryIds.push(
      await revertOne(
        entry,
        departmentId,
        yearId,
        adviserId,
        reason,
        new Date(baseJoinedAt - (entries.length - index)),
        now,
      ),
    );
  }
  return {
    revertedCount: enrollmentIds.length,
    revertedIds: enrollmentIds,
    returnedEntryIds,
  };
}
