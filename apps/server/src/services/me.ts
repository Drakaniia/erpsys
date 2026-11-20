import {
  NOTIFICATION_PAGE_SIZE,
  PRE_ENROLLMENT_STEP_CODES,
  deriveDepartmentCode,
  listSteps,
  listStepsByCodes,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { landingSurfaceForRole } from "../config/roles.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../models/AdminActionLogModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../models/NotificationModel.js";

import { StepVerificationModel } from "../models/StepVerificationModel.js";

import { UserModel } from "../models/UserModel.js";
import { publicIntegrationPayload } from "../lib/platform/integration-settings.js";
import type { SessionUser } from "../middleware/auth.js";
import { listSocialLinks, readProfilingForm } from "./content.js";
import { departmentListing } from "./departments.js";
import { myQueues } from "./queue-listing.js";
import { myQueueStatus } from "./queues.js";
import { loadStudentSteps, studentProfileStatus } from "./students.js";
import { submissionListQuery, submissionPage } from "./submissions.js";
import { listTransfers, resolveExpiredTransfers } from "./transfers.js";

const RECENT_LIMIT = 5;
const OFFICER_RECENT_LIMIT = 8;
const TREND_DAYS = 14;
const AWAITING_REVIEW = new Set(["APPLIED", "SUBMITTED"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const CAMPUS_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const LINK_PAGE_SIZE = 50;

type DateLike = Date | null | undefined;

const campusDay = (date: Date | string): string =>
  new Date(new Date(date).getTime() + CAMPUS_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

const countBy = (ids: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
};

const daysOf = (dates: DateLike[]) =>
  countBy(dates.flatMap((date) => (date ? [campusDay(date)] : [])));

function trend<K extends string>(series: Record<K, DateLike[]>) {
  const counts = Object.entries(series).map(
    ([key, dates]) => [key, daysOf(dates as DateLike[])] as const,
  );
  const now = Date.now();
  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = campusDay(new Date(now - (TREND_DAYS - 1 - index) * DAY_MS));
    return {
      day,
      ...Object.fromEntries(counts.map(([key, by]) => [key, by.get(day) ?? 0])),
    } as { day: string } & Record<K, number>;
  });
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

const submittedAtOf = (row: TimelineRow): Date | null => {
  const at = row.appliedAt ?? row.createdAt;
  return at ? new Date(at) : null;
};

const isoOrEmpty = (...dates: DateLike[]): string => {
  const found = dates.find((date) => date);
  return found ? new Date(found).toISOString() : "";
};

const page = <T>(data: T[], pageSize: number, total = data.length) => ({
  data,
  page: 1,
  pageSize,
  total,
});

async function adminOverview() {
  const [users, activeYear, steps, logs] = await Promise.all([
    UserModel.listActiveRoles(),
    AcademicYearModel.findActive(),
    listSteps(),
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
  const recentActivity = logs.map((log) => {
    const at =
      log.createdAt instanceof Date || typeof log.createdAt === "string"
        ? new Date(log.createdAt)
        : null;
    return {
      id: String(log._id),
      action: log.action,
      targetRef: log.targetRef,
      actorName: nameById.get(String(log.actorId)) ?? "Unknown",
      at: at && Number.isFinite(at.getTime()) ? at.toISOString() : "",
    };
  });
  if (!activeYear) {
    return {
      roleCounts,
      activeYear: null,
      stepTotals: [],
      recentActivity,
      departmentTallies: [],
      queueTrend: [],
    };
  }

  const yearId = String(activeYear._id);
  const [verified, unverified, departments, queueRows] = await Promise.all([
    StepVerificationModel.listStepIdsByStatus(yearId, "VERIFIED"),
    StepVerificationModel.listStepIdsByStatus(yearId, { $ne: "VERIFIED" }),
    DepartmentModel.listAll(),
    EnrollmentQueueModel.listForYear(yearId),
  ]);
  const verifiedBy = countBy(verified.map((v) => String(v.stepId)));
  const unverifiedBy = countBy(unverified.map((v) => String(v.stepId)));
  const queueBy = (status: string) =>
    countBy(
      queueRows
        .filter((row) => row.status === status)
        .map((row) => String(row.departmentId)),
    );
  const waitingBy = queueBy("WAITING");
  const servingBy = queueBy("IN_PROGRESS");
  const enrolledBy = queueBy("COMPLETED");

  return {
    roleCounts,
    activeYear: {
      id: yearId,
      label: activeYear.label,
      semesterLabel: activeYear.semesterLabel,
    },
    stepTotals: steps.map((step) => ({
      code: step.code,
      name: step.name,
      order: step.order,
      verified: verifiedBy.get(String(step._id)) ?? 0,
      unverified: unverifiedBy.get(String(step._id)) ?? 0,
    })),
    recentActivity,
    departmentTallies: departments.map((department) => ({
      departmentId: String(department._id),
      name: department.name,
      code: deriveDepartmentCode(department.name),
      waiting: waitingBy.get(String(department._id)) ?? 0,
      serving: servingBy.get(String(department._id)) ?? 0,
      enrolled: enrolledBy.get(String(department._id)) ?? 0,
    })),
    queueTrend: trend({
      joined: queueRows.map((row) => row.joinedAt),
      completed: queueRows.map((row) =>
        row.status === "COMPLETED" ? row.completedAt : null,
      ),
    }),
  };
}

async function officerOverview() {
  const [steps, year] = await Promise.all([
    listStepsByCodes(PRE_ENROLLMENT_STEP_CODES),
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
  const recentOf = (status: string, sortKey: string) =>
    StepVerificationModel.search(
      { academicYearId: yearId, status },
      { [sortKey]: -1 },
      0,
      OFFICER_RECENT_LIMIT,
    );
  const [timeline, recentVerified, recentReturned] = await Promise.all([
    StepVerificationModel.listTimelineForYear(
      yearId,
      steps.map((step) => String(step._id)),
    ),
    recentOf("VERIFIED", "verifiedAt"),
    recentOf("RETURNED", "respondedAt"),
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
  const isAwaiting = (row: TimelineRow) =>
    AWAITING_REVIEW.has(row.status ?? "") ||
    (row.status === "PENDING" && Boolean(row.appliedAt));
  const awaitingBy = countBy(
    rows.filter(isAwaiting).map((row) => String(row.stepId)),
  );
  const returnedBy = ofStatus((status) => status === "RETURNED");
  const oldestAwaitingBy = new Map<string, number>();
  for (const row of rows) {
    if (!isAwaiting(row)) continue;
    const at = submittedAtOf(row)?.getTime();
    if (at === undefined) continue;
    const current = oldestAwaitingBy.get(String(row.stepId));
    if (current === undefined || at < current) {
      oldestAwaitingBy.set(String(row.stepId), at);
    }
  }
  const verifiedStepsByStudent = countBy(
    rows
      .filter((row) => row.status === "VERIFIED")
      .map((row) => String(row.studentProfileId)),
  );
  const stepById = new Map(steps.map((step) => [String(step._id), step]));
  const doneAt = (row: {
    status?: string | null;
    verifiedAt?: DateLike;
    respondedAt?: DateLike;
  }) => (row.status === "VERIFIED" ? row.verifiedAt : row.respondedAt);

  const recent = [...recentVerified, ...recentReturned]
    .filter((row) => stepById.has(String(row.stepId)))
    .sort(
      (a, b) =>
        new Date(doneAt(b) ?? 0).getTime() - new Date(doneAt(a) ?? 0).getTime(),
    )
    .slice(0, OFFICER_RECENT_LIMIT);

  const profiles = await UserModel.findProfilesByIds([
    ...new Set(recent.map((row) => String(row.studentProfileId))),
  ]);
  const users = await UserModel.findByIds(
    profiles.map((p) => String(p.userId)),
  );
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const nameByProfile = new Map(
    profiles.map((p) => {
      const user = userById.get(String(p.userId));
      const name =
        user?.name?.trim() || user?.email?.split("@")[0]?.trim() || "Unknown";
      return [String(p._id), name];
    }),
  );

  return {
    steps: steps.map((step) => {
      const id = String(step._id);
      const oldest = oldestAwaitingBy.get(id);
      return {
        code: step.code,
        name: step.name,
        order: step.order,
        unverified: unverifiedBy.get(id) ?? 0,
        verified: verifiedBy.get(id) ?? 0,
        awaitingReview: awaitingBy.get(id) ?? 0,
        returned: returnedBy.get(id) ?? 0,
        oldestAwaitingAt:
          oldest === undefined ? null : new Date(oldest).toISOString(),
      };
    }),
    reviewTrend: trend({
      submitted: rows.map(submittedAtOf),
      verified: rows.map((row) =>
        row.status === "VERIFIED" ? row.verifiedAt : null,
      ),
      returned: rows.map((row) =>
        row.status === "RETURNED" ? row.respondedAt : null,
      ),
    }),
    students: {
      started: new Set(rows.map((row) => String(row.studentProfileId))).size,
      cleared: [...verifiedStepsByStudent.values()].filter(
        (count) => count >= steps.length,
      ).length,
    },
    recentActivity: recent.map((row) => ({
      id: String(row._id),
      studentName: nameByProfile.get(String(row.studentProfileId)) ?? "Unknown",
      stepCode: stepById.get(String(row.stepId))!.code,
      stepName: stepById.get(String(row.stepId))!.name,
      action: row.status === "VERIFIED" ? "Verified" : "Returned",
      at: isoOrEmpty(doneAt(row), row.createdAt),
    })),
    hasActiveYear: true as const,
    yearLabel: `${year.label} · ${year.semesterLabel}`,
  };
}

export async function overview(role: string | undefined) {
  if (role === "ADMIN") return adminOverview();
  if (role === "SBO_OFFICER") return officerOverview();
  throw new ApiError("FORBIDDEN", { message: "Forbidden." });
}

export async function stamp(userId: string) {
  const [user] = await UserModel.findByIds([userId]);
  return {
    name: user?.stampName ?? user?.name ?? null,
    graphicUrl: user?.stampGraphicUrl ?? null,
    signatureUrl: user?.stampSignatureUrl ?? null,
  };
}

export async function listNotifications(userId: string) {
  const rows = await NotificationModel.listRecent(
    userId,
    NOTIFICATION_PAGE_SIZE,
  );
  return rows.map((row) => {
    const { kind, label } = (row.action ?? {}) as {
      kind?: unknown;
      label?: unknown;
    };
    return {
      id: String(row._id),
      type: row.type,
      title: row.title,
      body: row.body,
      action:
        typeof kind === "string" && typeof label === "string"
          ? { kind, label }
          : null,
      readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  });
}

async function launchData(user: SessionUser) {
  switch (landingSurfaceForRole(user.role)) {
    case "student": {
      const [
        getMySteps,
        getMyQueueStatus,
        notifications,
        profileStatus,
        integrations,
      ] = await Promise.all([
        loadStudentSteps(user),
        myQueueStatus(user.id),
        listNotifications(user.id),
        studentProfileStatus(user.id),
        publicIntegrationPayload(),
      ]);
      return {
        getMySteps,
        getMyQueueStatus,
        notifications: page(notifications, NOTIFICATION_PAGE_SIZE),
        profileStatus,
        integrations: { data: integrations.flags },
      };
    }
    case "officer": {
      const [getOverview, getBell, getProfilingForm, links] = await Promise.all(
        [
          overview(user.role),
          submissionPage(
            submissionListQuery.parse({
              status: "PENDING",
              dir: "desc",
              pageSize: 20,
            }),
          ),
          readProfilingForm(),
          listSocialLinks(),
        ],
      );
      return {
        getOverview,
        getBell,
        getProfilingForm,
        listSocialMediaLinks: page(links, LINK_PAGE_SIZE),
      };
    }
    case "instructor": {
      await resolveExpiredTransfers();
      const [getMyQueues, departments, listMyTransferRequests, notifications] =
        await Promise.all([
          myQueues(user.id),
          departmentListing(user.id, user.role === "ADMIN"),
          listTransfers(user.id),
          listNotifications(user.id),
        ]);
      return {
        getMyQueues,
        listDepartments: page(
          departments.slice(0, LINK_PAGE_SIZE),
          LINK_PAGE_SIZE,
          departments.length,
        ),
        listMyTransferRequests,
        notifications: page(notifications, NOTIFICATION_PAGE_SIZE),
      };
    }

    case "admin": {
      const [getOverview, getProfilingForm] = await Promise.all([
        overview(user.role),
        readProfilingForm(),
      ]);
      return { getOverview, getProfilingForm };
    }
  }
}

export async function launch(user: SessionUser) {
  return {
    surface: landingSurfaceForRole(user.role),
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    data: await launchData(user),
  };
}
