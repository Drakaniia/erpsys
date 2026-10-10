import {
  PRE_ENROLLMENT_STEP_CODES,
  deriveDepartmentCode,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";

const RECENT_LIMIT = 5;
const OFFICER_RECENT_LIMIT = 8;
const TREND_DAYS = 14;
const AWAITING_REVIEW = new Set(["APPLIED", "SUBMITTED"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const CAMPUS_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function campusDay(date: Date): string {
  return new Date(date.getTime() + CAMPUS_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function queueTrend(
  rows: Array<{
    status?: string | null;
    joinedAt?: Date | null;
    completedAt?: Date | null;
  }>,
  now: Date,
): Array<{ day: string; joined: number; completed: number }> {
  const joinedBy = countBy(
    rows.flatMap((row) => (row.joinedAt ? [campusDay(new Date(row.joinedAt))] : [])),
  );
  const completedBy = countBy(
    rows.flatMap((row) =>
      row.status === "COMPLETED" && row.completedAt
        ? [campusDay(new Date(row.completedAt))]
        : [],
    ),
  );
  return trendDays(now).map((day) => ({
    day,
    joined: joinedBy.get(day) ?? 0,
    completed: completedBy.get(day) ?? 0,
  }));
}

function trendDays(now: Date): string[] {
  return Array.from({ length: TREND_DAYS }, (_, index) =>
    campusDay(new Date(now.getTime() - (TREND_DAYS - 1 - index) * DAY_MS)),
  );
}

type TimelineRow = {
  studentProfileId: string;
  stepId: string;
  status?: string | null;
  appliedAt?: Date | null;
  createdAt?: Date | null;
  verifiedAt?: Date | null;
  respondedAt?: Date | null;
};

function submittedAtOf(row: TimelineRow): Date | null {
  const at = row.appliedAt ?? row.createdAt;
  return at ? new Date(at) : null;
}

function reviewTrend(
  rows: TimelineRow[],
  now: Date,
): Array<{ day: string; submitted: number; verified: number; returned: number }> {
  const submittedBy = countBy(
    rows.flatMap((row) => {
      const at = submittedAtOf(row);
      return at ? [campusDay(at)] : [];
    }),
  );
  const verifiedBy = countBy(
    rows.flatMap((row) =>
      row.status === "VERIFIED" && row.verifiedAt
        ? [campusDay(new Date(row.verifiedAt))]
        : [],
    ),
  );
  const returnedBy = countBy(
    rows.flatMap((row) =>
      row.status === "RETURNED" && row.respondedAt
        ? [campusDay(new Date(row.respondedAt))]
        : [],
    ),
  );
  return trendDays(now).map((day) => ({
    day,
    submitted: submittedBy.get(day) ?? 0,
    verified: verifiedBy.get(day) ?? 0,
    returned: returnedBy.get(day) ?? 0,
  }));
}

function displayNameOf(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim() ?? "";
  if (name) return name;
  return user.email?.split("@")[0]?.trim() || "Unknown";
}

function isoOrEmpty(...dates: (Date | null | undefined)[]): string {
  const found = dates.find((date) => date);
  return found ? new Date(found).toISOString() : "";
}

const countBy = (ids: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
};

async function adminOverview() {
  const [users, activeYear, steps, logs] = await Promise.all([
    UserModel.listActiveRoles(),
    AcademicYearModel.findActive(),
    StepModel.listOrdered(),
    AdminActionLogModel.recent(RECENT_LIMIT),
  ]);

  const roleCounts = {
    STUDENT: 0,
    SBO_OFFICER: 0,
    ENROLLMENT_ADVISER: 0,
    ADMIN: 0,
  };
  for (const user of users) {
    const role = user.role as keyof typeof roleCounts | undefined;
    if (role && role in roleCounts) roleCounts[role] += 1;
  }

  const actors = await UserModel.findByIds([
    ...new Set(logs.map((l) => l.actorId)),
  ]);
  const nameById = new Map(actors.map((u) => [String(u._id), u.name ?? ""]));

  let stepTotals: Array<{
    code: string;
    name: string;
    order: number;
    verified: number;
    unverified: number;
  }> = [];
  let departmentTallies: Array<{
    departmentId: string;
    name: string;
    code: string;
    waiting: number;
    serving: number;
    enrolled: number;
  }> = [];
  let trend: Array<{ day: string; joined: number; completed: number }> = [];

  if (activeYear) {
    const yearId = String(activeYear._id);
    const [verified, unverified, departments, queueRows] = await Promise.all([
      StepVerificationModel.listStepIdsByStatus(yearId, "VERIFIED"),
      StepVerificationModel.listStepIdsByStatus(yearId, { $ne: "VERIFIED" }),
      DepartmentModel.listAll(),
      EnrollmentQueueModel.listForYear(yearId),
    ]);
    const verifiedBy = countBy(verified.map((v) => String(v.stepId)));
    const unverifiedBy = countBy(unverified.map((v) => String(v.stepId)));
    stepTotals = steps.map((step) => ({
      code: step.code,
      name: step.name,
      order: step.order,
      verified: verifiedBy.get(String(step._id)) ?? 0,
      unverified: unverifiedBy.get(String(step._id)) ?? 0,
    }));

    const waitingBy = countBy(
      queueRows
        .filter((row) => row.status === "WAITING")
        .map((row) => String(row.departmentId)),
    );
    const servingBy = countBy(
      queueRows
        .filter((row) => row.status === "IN_PROGRESS")
        .map((row) => String(row.departmentId)),
    );
    const enrolledBy = countBy(
      queueRows
        .filter((row) => row.status === "COMPLETED")
        .map((row) => String(row.departmentId)),
    );
    trend = queueTrend(queueRows, new Date());
    departmentTallies = departments.map((department) => ({
      departmentId: String(department._id),
      name: department.name,
      code: deriveDepartmentCode(department.name),
      waiting: waitingBy.get(String(department._id)) ?? 0,
      serving: servingBy.get(String(department._id)) ?? 0,
      enrolled: enrolledBy.get(String(department._id)) ?? 0,
    }));
  }

  return {
    roleCounts,
    activeYear: activeYear
      ? {
          id: String(activeYear._id),
          label: activeYear.label,
          semesterLabel: activeYear.semesterLabel,
        }
      : null,
    stepTotals,
    recentActivity: logs.map((log) => ({
      id: String(log._id),
      action: log.action,
      targetRef: log.targetRef,
      actorName: nameById.get(String(log.actorId)) ?? "Unknown",
      at: new Date(log.at).toISOString(),
    })),
    departmentTallies,
    queueTrend: trend,
  };
}

async function officerOverview() {
  const [steps, year] = await Promise.all([
    StepModel.listByCodes([...PRE_ENROLLMENT_STEP_CODES]),
    AcademicYearModel.findActive(),
  ]);

  if (!year) {
    return {
      steps: steps.map((step) => ({
        code: step.code,
        name: step.name,
        order: step.order,
        unverified: 0,
        verified: 0,
        awaitingReview: 0,
        returned: 0,
        oldestAwaitingAt: null,
      })),
      recentActivity: [],
      reviewTrend: [],
      students: { started: 0, cleared: 0 },
      hasActiveYear: false as const,
      yearLabel: null,
    };
  }

  const yearId = String(year._id);
  const stepIds = steps.map((step) => String(step._id));
  const [timeline, recentVerified, recentReturned] = await Promise.all([
    StepVerificationModel.listTimelineForYear(yearId, stepIds),
    StepVerificationModel.search(
      { academicYearId: yearId, status: "VERIFIED" },
      { verifiedAt: -1 },
      0,
      OFFICER_RECENT_LIMIT,
    ),
    StepVerificationModel.search(
      { academicYearId: yearId, status: "RETURNED" },
      { respondedAt: -1 },
      0,
      OFFICER_RECENT_LIMIT,
    ),
  ]);
  const rows = timeline as TimelineRow[];
  const ofStatus = (keep: (status: string) => boolean) =>
    countBy(
      rows
        .filter((row) => keep(row.status ?? ""))
        .map((row) => String(row.stepId)),
    );
  const verifiedBy = ofStatus((status) => status === "VERIFIED");
  const unverifiedBy = ofStatus((status) => status !== "VERIFIED");
  const awaitingBy = ofStatus((status) => AWAITING_REVIEW.has(status));
  const returnedBy = ofStatus((status) => status === "RETURNED");
  const oldestAwaitingBy = new Map<string, number>();
  for (const row of rows) {
    if (!AWAITING_REVIEW.has(row.status ?? "")) continue;
    const at = submittedAtOf(row)?.getTime();
    if (at === undefined) continue;
    const key = String(row.stepId);
    const current = oldestAwaitingBy.get(key);
    if (current === undefined || at < current) oldestAwaitingBy.set(key, at);
  }
  const verifiedStepsByStudent = countBy(
    rows
      .filter((row) => row.status === "VERIFIED")
      .map((row) => String(row.studentProfileId)),
  );
  const students = {
    started: new Set(rows.map((row) => String(row.studentProfileId))).size,
    cleared: [...verifiedStepsByStudent.values()].filter(
      (count) => count >= steps.length,
    ).length,
  };
  const stepById = new Map(steps.map((step) => [String(step._id), step]));

  const recent = [...recentVerified, ...recentReturned]
    .filter((row) => stepById.has(String(row.stepId)))
    .sort(
      (a, b) =>
        new Date(
          b.status === "VERIFIED" ? (b.verifiedAt ?? 0) : (b.respondedAt ?? 0),
        ).getTime() -
        new Date(
          a.status === "VERIFIED" ? (a.verifiedAt ?? 0) : (a.respondedAt ?? 0),
        ).getTime(),
    )
    .slice(0, OFFICER_RECENT_LIMIT);

  const profiles = await StudentProfileModel.findByIds([
    ...new Set(recent.map((row) => String(row.studentProfileId))),
  ]);
  const users = await UserModel.findByIds(
    profiles.map((p) => String(p.userId)),
  );
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const nameByProfile = new Map(
    profiles.map((p) => [
      String(p._id),
      displayNameOf(userById.get(String(p.userId)) ?? {}),
    ]),
  );

  return {
    steps: steps.map((step) => ({
      code: step.code,
      name: step.name,
      order: step.order,
      unverified: unverifiedBy.get(String(step._id)) ?? 0,
      verified: verifiedBy.get(String(step._id)) ?? 0,
      awaitingReview: awaitingBy.get(String(step._id)) ?? 0,
      returned: returnedBy.get(String(step._id)) ?? 0,
      oldestAwaitingAt: oldestAwaitingBy.has(String(step._id))
        ? new Date(oldestAwaitingBy.get(String(step._id))!).toISOString()
        : null,
    })),
    reviewTrend: reviewTrend(rows, new Date()),
    students,
    recentActivity: recent.map((row) => ({
      id: String(row._id),
      studentName: nameByProfile.get(String(row.studentProfileId)) ?? "Unknown",
      stepCode: stepById.get(String(row.stepId))!.code,
      stepName: stepById.get(String(row.stepId))!.name,
      action: row.status === "VERIFIED" ? "Verified" : "Returned",
      at:
        row.status === "VERIFIED"
          ? isoOrEmpty(row.verifiedAt, row.createdAt)
          : isoOrEmpty(row.respondedAt, row.createdAt),
    })),
    hasActiveYear: true as const,
    yearLabel: `${year.label} · ${year.semesterLabel}`,
  };
}

export type StampView = {
  name: string | null;
  graphicUrl: string | null;
  signatureUrl: string | null;
};

export class OverviewService {
  static async load(role: string | undefined) {
    if (role === "ADMIN") return adminOverview();
    if (role === "SBO_OFFICER") return officerOverview();
    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }

  static async stamp(userId: string): Promise<StampView> {
    const [user] = await UserModel.findByIds([userId]);
    return {
      name: user?.stampName ?? user?.name ?? null,
      graphicUrl: user?.stampGraphicUrl ?? null,
      signatureUrl: user?.stampSignatureUrl ?? null,
    };
  }

  static async saveStamp(
    userId: string,
    input: {
      name?: string;
      graphicUrl?: string | null;
      signatureUrl?: string | null;
    },
  ): Promise<StampView> {
    const patch: Record<string, string | null> = {};
    if (input.name !== undefined) patch["stampName"] = input.name;
    if (input.graphicUrl !== undefined)
      patch["stampGraphicUrl"] = input.graphicUrl;
    if (input.signatureUrl !== undefined) {
      patch["stampSignatureUrl"] = input.signatureUrl;
    }
    if (Object.keys(patch).length > 0) {
      const updated = await UserModel.patchById(userId, patch);
      if (!updated)
        throw new ApiError("NOT_FOUND", { message: "User not found." });
    }
    return OverviewService.stamp(userId);
  }
}
