import { createHmac, timingSafeEqual } from "node:crypto";
import { isAvailabilityLive } from "../config/availability.js";
import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  normalizeYearLevels,
  type YearLevel,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import {
  aheadInLine,
  assertLeavable,
  assertLevelServed,
  isDuplicateKeyError,
  levelsCoveredByDepartment,
  missingPreEnrollmentCodes,
  openByDepartment,
  type ServingRow,
} from "../config/queue.js";
import { genId } from "../lib/db/ids.js";
import { env } from "../lib/platform/env.js";
import { mailUser, siteOrigin } from "../lib/platform/mailer.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";
import { AdviserAvailabilityModel } from "../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import {
  EnrollmentQueueModel,
  type QueueEntryRow,
} from "../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../models/NotificationModel.js";
import { StepModel } from "../models/StepModel.js";
import { StepVerificationModel } from "../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../models/StudentProfileModel.js";
import { UserModel } from "../models/UserModel.js";
import { activeYearOrThrow } from "./academic-years.js";
import { requireStudentContext } from "./students.js";

type ServingInput = { departmentId: string; entryId: string };

type EntryFields = {
  departmentId: string;
  studentProfileId: string;
  academicYearId: string;
  joinedAt: string;
};

const UNDO_WINDOW_MS = 60_000;

async function queuePosition(entry: {
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

export async function myQueueStatus(userId: string) {
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
      entry.status === "WAITING" ? queuePosition(entry) : Promise.resolve(null),
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

async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await NotificationModel.insert({
    _id: genId("notification"),
    userId,
    type,
    title,
    body,
    createdAt: new Date(),
  });
}

function undoSignature(
  adviserId: string,
  entryId: string,
  s: EntryFields,
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

export async function assertDepartmentAssigned(
  adviserId: string,
  departmentId: string,
): Promise<void> {
  if (!(await AdviserDepartmentModel.findLink(adviserId, departmentId))) {
    throw new ApiError("FORBIDDEN", {
      message: "Department not assigned to you.",
    });
  }
}

export async function entryOrThrow(
  entryId: string,
  departmentId: string,
  academicYearId: string,
): Promise<QueueEntryRow> {
  const entry = await EnrollmentQueueModel.findById(entryId);
  if (!entry || entry.departmentId !== departmentId) {
    throw new ApiError("NOT_FOUND", {
      message: "Queue entry not found in this department.",
    });
  }
  if (String(entry.academicYearId) !== academicYearId) {
    throw new ApiError("CONFLICT", {
      message: "This entry belongs to a different academic year.",
    });
  }
  return entry;
}

export async function assertStudentLevelInScope(
  adviserId: string,
  departmentId: string,
  studentProfileId: string,
  academicYearId: string,
): Promise<void> {
  const link = await AdviserDepartmentModel.findLink(adviserId, departmentId);
  if (!link) {
    throw new ApiError("FORBIDDEN", {
      message: "Department not assigned to you.",
    });
  }
  const enrollment = await StudentEnrollmentModel.findByProfileYear(
    studentProfileId,
    academicYearId,
  );
  if (enrollment && String(enrollment.departmentId) !== departmentId) {
    throw new ApiError("CONFLICT", {
      message: "This student's department changed — refresh the queue.",
    });
  }
  const level = (enrollment?.yearLevel ?? null) as YearLevel | null;
  if (
    level === null ||
    !departmentAcceptsLevel(normalizeYearLevels(link.yearLevels ?? []), level)
  ) {
    throw new ApiError("FORBIDDEN", {
      message: level
        ? `${YEAR_LEVEL_LABELS[level]} is outside the year levels assigned to you in this department.`
        : "This student has no year level on file — ask an admin to set their course.",
      cause: { code: "OUT_OF_LEVEL_SCOPE" },
    });
  }
}

async function firstServable(
  adviserId: string,
  departmentId: string,
  academicYearId: string,
): Promise<QueueEntryRow | null> {
  const levels = normalizeYearLevels(
    (await AdviserDepartmentModel.findLink(adviserId, departmentId))
      ?.yearLevels ?? [],
  );
  const waiting = await EnrollmentQueueModel.listByStatus(
    [departmentId],
    academicYearId,
    "WAITING",
    1000,
  );
  const levelByProfile = new Map(
    (
      await StudentEnrollmentModel.listByProfiles(
        waiting.map((row) => String(row.studentProfileId)),
        academicYearId,
      )
    ).map((row) => [String(row.studentProfileId), row.yearLevel ?? null]),
  );
  return (
    waiting.find((row) => {
      const level = levelByProfile.get(String(row.studentProfileId));
      return level != null && departmentAcceptsLevel(levels, level);
    }) ?? null
  );
}

async function servedByName(servedById: unknown): Promise<string> {
  if (!servedById) return "another adviser";
  return (
    (await UserModel.findById(String(servedById)))?.name ?? "another adviser"
  );
}

function tookFirst(holder: string): ApiError {
  return new ApiError("CONFLICT", {
    message: `Another adviser took this student first — ${holder}.`,
    cause: { code: "ALREADY_SERVING", servedByName: holder, lostRace: "ENTRY" },
  });
}

export async function join(
  user: { id: string; email: string },
  departmentId: string,
): Promise<{ entryId: string; departmentName: string; position: number }> {
  const { profile, year } = await requireStudentContext(user);
  const yearId = String(year._id);

  const enrollment = await StudentEnrollmentModel.findByProfileYear(
    profile._id,
    yearId,
  );
  if (!enrollment) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "Set your course and year level before joining a queue.",
    });
  }
  if (departmentId !== String(enrollment.departmentId)) {
    throw new ApiError("CONFLICT", {
      message:
        "That queue is not the one on your enrollment record — update your course first.",
    });
  }

  const department = await DepartmentModel.findById(departmentId);
  if (!department || !department.isActive) {
    throw new ApiError("NOT_FOUND", { message: "Department not found." });
  }

  const [verifications, stepRows] = await Promise.all([
    StepVerificationModel.listByProfileYear(profile._id, yearId),
    StepModel.listByCodes([...PRE_ENROLLMENT_STEP_CODES]),
  ]);
  const missing = missingPreEnrollmentCodes(
    verifications,
    new Map(stepRows.map((s) => [String(s._id), s.code] as const)),
    PRE_ENROLLMENT_STEP_CODES,
  );
  if (missing.length > 0) {
    throw new ApiError("CONFLICT", {
      message: `Complete steps 1–5 first — missing: ${missing.join(", ")}.`,
    });
  }

  const [availabilities, serving] = await Promise.all([
    AdviserAvailabilityModel.listOpenByDepartment(departmentId, yearId),
    EnrollmentQueueModel.listInProgress(departmentId, yearId),
  ]);
  if (!openByDepartment({ availabilities, serving }).has(departmentId)) {
    throw new ApiError("CONFLICT", {
      message: "Queue closed — the adviser is not yet accepting students.",
    });
  }

  const assignments =
    await AdviserDepartmentModel.listByDepartment(departmentId);
  assertLevelServed({
    departmentName: department.name,
    yearLevel: enrollment.yearLevel,
    coveredLevels:
      levelsCoveredByDepartment({ availabilities, serving, assignments }).get(
        departmentId,
      ) ?? [],
  });

  const entryId = genId("queue");
  const joinedAt = new Date();
  try {
    await EnrollmentQueueModel.insert({
      _id: entryId,
      departmentId,
      studentProfileId: profile._id,
      academicYearId: yearId,
      status: "WAITING",
      joinedAt,
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw new ApiError("INTERNAL_SERVER_ERROR", {
        message: "Could not join the queue — please try again.",
        cause: error,
      });
    }
    throw new ApiError("CONFLICT", {
      message: "You already have a queue entry this year.",
    });
  }

  const position = await queuePosition({
    _id: entryId,
    departmentId,
    academicYearId: yearId,
    joinedAt,
  });
  await notify(
    user.id,
    "QUEUE_JOINED",
    "You joined the queue",
    `${department.name} — position #${position}.`,
  );
  return { entryId, departmentName: department.name, position };
}

export async function leave(user: { id: string }): Promise<{ left: true }> {
  const profile = await StudentProfileModel.findByUserId(user.id);
  if (!profile) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "No student profile found.",
    });
  }
  const year = await AcademicYearModel.findActive();
  if (!year) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "No active academic year.",
    });
  }

  const entry = await EnrollmentQueueModel.findByProfileYear(
    profile._id,
    String(year._id),
  );
  if (!entry) return { left: true };

  assertLeavable(entry.status ?? "");
  if (await EnrollmentQueueModel.deleteIfWaiting(entry._id)) {
    return { left: true };
  }

  const current = await EnrollmentQueueModel.findById(entry._id);
  if (!current) return { left: true };
  assertLeavable(current.status ?? "");
  throw new ApiError("CONFLICT", {
    message:
      "Your queue entry changed while you were leaving — please try again.",
  });
}

export async function serve(
  adviserId: string,
  input: ServingInput,
): Promise<{ entryId: string; status: string }> {
  const yearId = String((await activeYearOrThrow())._id);
  await assertDepartmentAssigned(adviserId, input.departmentId);
  const availability = await AdviserAvailabilityModel.findOpenFor(
    adviserId,
    input.departmentId,
    yearId,
  );
  if (!availability || !isAvailabilityLive(availability)) {
    throw new ApiError("PRECONDITION_FAILED", {
      message: "Open the queue to serve students.",
      cause: { code: "QUEUE_CLOSED" },
    });
  }
  if (!(await DepartmentModel.findById(input.departmentId))?.isActive) {
    throw new ApiError("CONFLICT", { message: "This department is inactive." });
  }
  const entry = await entryOrThrow(input.entryId, input.departmentId, yearId);
  if (entry.status === "IN_PROGRESS") {
    if (entry.servedById === adviserId) {
      return { entryId: String(entry._id), status: "IN_PROGRESS" };
    }
    throw tookFirst(await servedByName(entry.servedById));
  }
  if (entry.status !== "WAITING") {
    throw new ApiError("CONFLICT", {
      message: "This student is no longer waiting.",
      cause: { code: "NOT_WAITING" },
    });
  }

  await assertStudentLevelInScope(
    adviserId,
    input.departmentId,
    entry.studentProfileId,
    yearId,
  );

  const first = await firstServable(adviserId, input.departmentId, yearId);
  if (!first || String(first._id) !== input.entryId) {
    throw new ApiError("CONFLICT", {
      message: "Not next in line — strict FIFO.",
      cause: { code: "NOT_NEXT_IN_LINE" },
    });
  }

  const inProgress = await EnrollmentQueueModel.findInProgress(
    input.departmentId,
    yearId,
  );
  if (inProgress) {
    throw new ApiError("CONFLICT", {
      message: "A student is already being served in this department.",
    });
  }
  let transitioned: boolean;
  try {
    transitioned = await EnrollmentQueueModel.transition(entry._id, "WAITING", {
      status: "IN_PROGRESS",
      servedById: adviserId,
      servedAt: new Date(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const holder = await servedByName(
      (await EnrollmentQueueModel.findInProgress(input.departmentId, yearId))
        ?.servedById,
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
    throw tookFirst(await servedByName(latest?.servedById));
  }

  const [profile, department] = await Promise.all([
    StudentProfileModel.findById(entry.studentProfileId),
    DepartmentModel.findById(input.departmentId),
  ]);
  if (profile) {
    await notify(
      profile.userId,
      "QUEUE_SERVING",
      "It's your turn",
      `The adviser is serving you now — ${department?.name ?? "department"}.`,
    );
    mailUser(
      profile.userId,
      "It's your turn — ERPSYS queue",
      `The adviser is serving you now — ${department?.name ?? "department"}.\n\nOpen ERPSYS to see your place in line: ${siteOrigin()}`,
    );
  }
  return { entryId: String(entry._id), status: "IN_PROGRESS" };
}

export async function release(
  adviserId: string,
  input: ServingInput,
): Promise<{ entryId: string; status: string }> {
  const year = await activeYearOrThrow();
  await assertDepartmentAssigned(adviserId, input.departmentId);
  const entry = await entryOrThrow(
    input.entryId,
    input.departmentId,
    String(year._id),
  );

  if (
    entry.status === "IN_PROGRESS" &&
    entry.servedById === adviserId &&
    (await EnrollmentQueueModel.transition(
      entry._id,
      "IN_PROGRESS",
      {
        status: "WAITING",
        servedById: null,
        servedAt: null,
      },
      adviserId,
    ))
  ) {
    return { entryId: String(entry._id), status: "WAITING" };
  }
  const latest = await EnrollmentQueueModel.findById(entry._id);
  if (latest?.status === "WAITING")
    return { entryId: String(entry._id), status: "WAITING" };
  throw new ApiError("CONFLICT", {
    message:
      "This student is no longer being served by you — refresh the queue.",
  });
}

export async function moveToEnd(
  adviserId: string,
  input: ServingInput,
): Promise<{ entryId: string; position: number }> {
  const yearId = String((await activeYearOrThrow())._id);
  await assertDepartmentAssigned(adviserId, input.departmentId);
  const entry = await entryOrThrow(input.entryId, input.departmentId, yearId);

  if (entry.status !== "WAITING" && entry.status !== "IN_PROGRESS") {
    throw new ApiError("CONFLICT", {
      message: "Only waiting or serving students can be moved.",
    });
  }
  if (entry.status === "IN_PROGRESS" && entry.servedById !== adviserId) {
    throw new ApiError("FORBIDDEN", {
      message: "Only the adviser currently serving this student can move them.",
    });
  }
  await assertStudentLevelInScope(
    adviserId,
    input.departmentId,
    entry.studentProfileId,
    yearId,
  );

  if (entry.status === "WAITING") {
    const first = await firstServable(adviserId, input.departmentId, yearId);
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
    entry.status === "IN_PROGRESS" ? adviserId : undefined,
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
    await notify(
      profile.userId,
      "QUEUE_MOVED",
      "Moved to end of queue",
      `The adviser moved you to the back — new position #${position} in ${department?.name ?? "department"}.`,
    );
  }
  return { entryId: String(entry._id), position };
}

export async function removeEntry(adviserId: string, entryId: string) {
  const yearId = String((await activeYearOrThrow())._id);
  const entry = await EnrollmentQueueModel.findById(entryId);
  if (!entry) {
    throw new ApiError("NOT_FOUND", { message: "Queue entry not found." });
  }
  if (String(entry.academicYearId) !== yearId) {
    throw new ApiError("CONFLICT", {
      message: "This entry belongs to a different academic year.",
    });
  }
  await assertStudentLevelInScope(
    adviserId,
    entry.departmentId,
    entry.studentProfileId,
    yearId,
  );

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

  const fields: EntryFields = {
    departmentId: entry.departmentId,
    studentProfileId: entry.studentProfileId,
    academicYearId: String(entry.academicYearId),
    joinedAt: new Date(entry.joinedAt ?? Date.now()).toISOString(),
  };
  const removedAt = String(Date.now());
  const snapshot = {
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
    await notify(
      profile.userId,
      "QUEUE_REMOVED_BY_ADVISER",
      "Removed from queue",
      `You were removed from the ${department?.name ?? "department"} queue by an adviser. You can re-join when the queue is open.`,
    );
  }
  return { removed: true, reason: null, snapshot };
}

export async function restoreEntry(
  adviserId: string,
  entryId: string,
  input: EntryFields & { token: string },
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
  const year = await activeYearOrThrow();
  if (input.academicYearId !== String(year._id)) {
    throw new ApiError("CONFLICT", {
      message: "This entry belongs to a different academic year.",
    });
  }
  await assertDepartmentAssigned(adviserId, input.departmentId);

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
    throw new ApiError("CONFLICT", { message: "Queue entry already exists." });
  }
  const department = await DepartmentModel.findById(input.departmentId);
  if (!department) {
    throw new ApiError("NOT_FOUND", { message: "Department not found." });
  }
  const profile = await StudentProfileModel.findById(input.studentProfileId);
  if (!profile) {
    throw new ApiError("NOT_FOUND", { message: "Student profile not found." });
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
  await notify(
    profile.userId,
    "QUEUE_RESTORED_BY_ADVISER",
    "Returned to queue",
    `You were returned to the ${department.name} queue — your previous position was restored.`,
  );
  return { restored: true, entryId };
}
