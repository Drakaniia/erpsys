import {
  PRE_ENROLLMENT_STEP_CODES,
  STEP_CODES,
  YEAR_LEVELS,
  deriveDepartmentCode,
  type YearLevel,
} from "../../config/constants.js";
import { escapeQueryRegex } from "../../config/queue.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import type { AcademicYearRow } from "../../models/AcademicYearModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StepModel } from "../../models/StepModel.js";
import { StepVerificationModel } from "../../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";

export const ROSTER_STEP_STATES = [
  "MISSING",
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
  "RETURNED",
] as const;
export type RosterStepState = (typeof ROSTER_STEP_STATES)[number];

export const ROSTER_BUCKETS = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "READY_FOR_QUEUE",
  "ENROLLED",
] as const;
export type RosterBucket = (typeof ROSTER_BUCKETS)[number];

export const ROSTER_SORTS = [
  "name",
  "studentNumber",
  "stepsVerified",
  "yearLevel",
  "enrolledAt",
] as const;
export type RosterSort = (typeof ROSTER_SORTS)[number];

export type RosterFilter = {
  academicYearId?: string;
  departmentIds?: string[];
  yearLevels?: YearLevel[];
  buckets?: RosterBucket[];
  steps?: string[];
  stepState?: RosterStepState;
  enrolled?: boolean;
  unassigned?: boolean;
  q?: string;
  scope: "mine" | "all";
};

type RosterStudent = {
  studentProfileId: string;
  studentName: string;
  studentNumber: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  yearLevel: string | null;
  steps: { code: string; status: RosterStepState }[];
  queue: { status: string; completedAt: Date | null } | null;
};

export type RosterRow = {
  studentProfileId: string;
  studentName: string;
  studentNumber: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  yearLevel: string | null;
  stepsVerified: number;
  stepsTotal: number;
  stepStates: { code: string; status: RosterStepState }[];
  queueStatus: "NONE" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
  enrolled: boolean;
  enrolledAt: string | null;
  pendingReview: number;
  bucket: RosterBucket;
};

export type RosterStats = {
  byCourse: {
    departmentId: string | null;
    departmentName: string | null;
    departmentCode: string | null;
    count: number;
  }[];
  byCourseYearLevel: {
    departmentId: string;
    departmentName: string;
    departmentCode: string;
    counts: Record<string, number>;
    total: number;
  }[];
  distribution: Record<RosterBucket, number>;
  unassignedTotal: number;
  total: number;
};

function classifyStudent(student: RosterStudent): RosterRow {
  const statusOf = new Map(student.steps.map((s) => [s.code, s.status]));
  const stepStates = STEP_CODES.map((code) => ({
    code,
    status: (statusOf.get(code) ?? "MISSING") as RosterStepState,
  }));
  const stepsVerified = stepStates.filter(
    (s) => s.status === "VERIFIED",
  ).length;
  const pendingReview = stepStates.filter(
    (s) => s.status === "SUBMITTED" || s.status === "RETURNED",
  ).length;
  const verifiedPre = PRE_ENROLLMENT_STEP_CODES.filter(
    (code) => statusOf.get(code) === "VERIFIED",
  ).length;
  const touched = stepStates.some(
    (s) =>
      s.status === "VERIFIED" ||
      s.status === "SUBMITTED" ||
      s.status === "RETURNED",
  );
  const queueStatus = (student.queue?.status ??
    "NONE") as RosterRow["queueStatus"];
  const enrolled =
    queueStatus === "COMPLETED" || statusOf.get("ENROLLMENT") === "VERIFIED";
  const bucket: RosterBucket = enrolled
    ? "ENROLLED"
    : verifiedPre === PRE_ENROLLMENT_STEP_CODES.length && !student.queue
      ? "READY_FOR_QUEUE"
      : touched || Boolean(student.queue)
        ? "IN_PROGRESS"
        : "NOT_STARTED";
  return {
    studentProfileId: student.studentProfileId,
    studentName: student.studentName,
    studentNumber: student.studentNumber,
    departmentId: student.departmentId,
    departmentName: student.departmentName,
    departmentCode: student.departmentCode,
    yearLevel: student.yearLevel,
    stepsVerified,
    stepsTotal: STEP_CODES.length,
    stepStates,
    queueStatus,
    enrolled,
    enrolledAt: student.queue?.completedAt?.toISOString() ?? null,
    pendingReview,
    bucket,
  };
}

export class RosterService {
  static async load(
    input: RosterFilter,
    adviserId: string,
  ): Promise<{
    year: AcademicYearRow | null;
    rows: RosterRow[];
    unassignedTotal: number;
  }> {
    const year = await AcademicYearService.resolve(input.academicYearId);
    if (!year) return { year: null, rows: [], unassignedTotal: 0 };
    const yearId = String(year._id);

    const enrolledIds = (
      await StudentEnrollmentModel.listAllForYear(yearId)
    ).map((row) => row.studentProfileId);
    const unassignedTotal =
      await StudentProfileModel.countUnenrolled(enrolledIds);
    const qProfileIds = await RosterService.searchProfileIds(input.q);

    let students: RosterStudent[];
    if (input.unassigned) {
      const profiles = await StudentProfileModel.listUnenrolled(
        enrolledIds,
        qProfileIds,
      );
      const info = await RosterService.profileInfo(
        profiles.map((profile) => String(profile._id)),
      );
      students = profiles.map((profile) => {
        const id = String(profile._id);
        const found = info.get(id);
        return {
          studentProfileId: id,
          studentName: found?.name ?? "",
          studentNumber: found?.studentNumber ?? null,
          departmentId: null,
          departmentName: null,
          departmentCode: null,
          yearLevel: null,
          steps: [],
          queue: null,
        };
      });
    } else {
      const departmentIds = await RosterService.scopeDepartmentIds(
        input,
        adviserId,
      );
      const enrollments = await StudentEnrollmentModel.listForDepartments(
        yearId,
        departmentIds,
        input.yearLevels,
        qProfileIds,
      );
      const [info, departments] = await Promise.all([
        RosterService.profileInfo(
          enrollments.map((row) => row.studentProfileId),
        ),
        DepartmentModel.findByIds(
          enrollments.map((row) => String(row.departmentId ?? "")),
        ),
      ]);
      const deptNameById = new Map(
        departments.map((dept) => [String(dept._id), dept.name]),
      );
      students = enrollments.map((enrollment) => {
        const found = info.get(enrollment.studentProfileId);
        const deptName =
          deptNameById.get(String(enrollment.departmentId)) ?? null;
        return {
          studentProfileId: enrollment.studentProfileId,
          studentName: found?.name ?? "",
          studentNumber: found?.studentNumber ?? null,
          departmentId: String(enrollment.departmentId ?? ""),
          departmentName: deptName,
          departmentCode: deptName ? deriveDepartmentCode(deptName) : null,
          yearLevel: enrollment.yearLevel ?? null,
          steps: [],
          queue: null,
        };
      });
    }

    const profileIds = students.map((student) => student.studentProfileId);
    const [verifications, queues, codeMap] = await Promise.all([
      StepVerificationModel.listByProfiles(profileIds, yearId),
      EnrollmentQueueModel.listByProfiles(profileIds, yearId),
      StepModel.listCodeMap(),
    ]);
    const stepCodeById = new Map(
      codeMap.map((step) => [String(step._id), step.code]),
    );
    const stepsByProfile = new Map<string, RosterStudent["steps"]>();
    for (const verification of verifications) {
      const code = stepCodeById.get(String(verification.stepId));
      if (!code) continue;
      const list = stepsByProfile.get(verification.studentProfileId) ?? [];
      list.push({ code, status: verification.status as RosterStepState });
      stepsByProfile.set(verification.studentProfileId, list);
    }
    const queueByProfile = new Map(
      queues.map((queue) => [
        queue.studentProfileId,
        {
          status: String(queue.status),
          completedAt: queue.completedAt ?? null,
        },
      ]),
    );

    const rows = students
      .map((student) =>
        classifyStudent({
          ...student,
          steps: stepsByProfile.get(student.studentProfileId) ?? [],
          queue: queueByProfile.get(student.studentProfileId) ?? null,
        }),
      )
      .filter((row) => {
        if (!input.buckets?.length) return true;
        return input.buckets.includes(row.bucket);
      })
      .filter((row) => {
        if (!input.steps?.length && !input.stepState) return true;
        const candidates = input.steps?.length
          ? row.stepStates.filter((state) => input.steps!.includes(state.code))
          : row.stepStates;
        return input.stepState
          ? candidates.some((state) => state.status === input.stepState)
          : candidates.some((state) => state.status !== "MISSING");
      })
      .filter((row) =>
        input.enrolled === undefined ? true : row.enrolled === input.enrolled,
      );

    return { year, rows, unassignedTotal };
  }

  private static async scopeDepartmentIds(
    input: RosterFilter,
    adviserId: string,
  ): Promise<string[]> {
    const owned =
      input.scope === "all"
        ? (await DepartmentModel.listIds()).map((dept) => String(dept._id))
        : (await AdviserDepartmentModel.listForAdviser(adviserId)).map(
            (link) => link.departmentId,
          );
    if (!input.departmentIds?.length) return owned;
    const wanted = new Set(input.departmentIds);
    return owned.filter((id) => wanted.has(id));
  }

  private static async searchProfileIds(q?: string): Promise<string[] | null> {
    const term = q?.trim();
    if (!term) return null;
    const contains = { $regex: escapeQueryRegex(term), $options: "i" };
    const [byNumber, byName] = await Promise.all([
      StudentProfileModel.searchByStudentNumber(contains),
      UserModel.searchByName(contains),
    ]);
    const viaUser = await StudentProfileModel.listByUserIds(
      byName.map((user) => String(user._id)),
    );
    return [
      ...new Set([
        ...byNumber.map((profile) => String(profile._id)),
        ...viaUser.map((profile) => String(profile._id)),
      ]),
    ];
  }

  private static async profileInfo(profileIds: string[]) {
    const profiles = await StudentProfileModel.findByIds(profileIds);
    const users = await UserModel.findByIds(
      profiles.map((profile) => String(profile.userId)),
    );
    const userById = new Map(users.map((user) => [String(user._id), user]));
    return new Map(
      profiles.map((profile) => {
        const user = userById.get(String(profile.userId));
        const name = user?.name?.trim() ?? "";
        const email = user?.email?.trim() ?? "";
        return [
          String(profile._id),
          {
            studentNumber: profile.studentNumber ?? null,
            name: name || (email.split("@")[0]?.trim() ?? ""),
          },
        ] as const;
      }),
    );
  }

  static sortRows(rows: RosterRow[], sort: RosterSort, dir: "asc" | "desc") {
    const factor = dir === "desc" ? -1 : 1;
    const byName = (a: RosterRow, b: RosterRow) =>
      a.studentName.localeCompare(b.studentName);
    return rows.slice().sort((a, b) => {
      if (sort === "name") return factor * byName(a, b);
      if (sort === "studentNumber") {
        const an = a.studentNumber;
        const bn = b.studentNumber;
        if (an === null && bn === null) return byName(a, b);
        if (an === null) return 1;
        if (bn === null) return -1;
        const numeric = /^\d+$/.test(an) && /^\d+$/.test(bn);
        const cmp = numeric ? Number(an) - Number(bn) : an.localeCompare(bn);
        return cmp !== 0 ? factor * cmp : byName(a, b);
      }
      const value = (row: RosterRow): number | null => {
        if (sort === "stepsVerified") return row.stepsVerified;
        if (sort === "yearLevel")
          return row.yearLevel
            ? (YEAR_LEVELS as readonly string[]).indexOf(row.yearLevel)
            : null;
        return row.enrolledAt ? new Date(row.enrolledAt).getTime() : null;
      };
      if (sort === "enrolledAt") {
        const av = value(a);
        const bv = value(b);
        if (av === null && bv === null) return byName(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        return av !== bv ? factor * (av - bv) : byName(a, b);
      }
      const av = value(a) ?? -1;
      const bv = value(b) ?? -1;
      return av !== bv ? factor * (av - bv) : byName(a, b);
    });
  }

  static paginate(
    rows: RosterRow[],
    cursor: string | undefined,
    limit: number,
  ) {
    const found = cursor
      ? rows.findIndex((row) => row.studentProfileId === cursor)
      : -1;
    const start = found >= 0 ? found + 1 : 0;
    const entries = rows.slice(start, start + limit);
    const hasMore = start + entries.length < rows.length;
    const last = entries.at(-1);
    return {
      entries,
      nextCursor: hasMore && last ? last.studentProfileId : null,
    };
  }

  static stats(rows: RosterRow[], unassignedTotal: number): RosterStats {
    const byCourse = new Map<string, RosterStats["byCourse"][number]>();
    const byCourseYearLevel = new Map<
      string,
      RosterStats["byCourseYearLevel"][number]
    >();
    const distribution = Object.fromEntries(
      ROSTER_BUCKETS.map((bucket) => [bucket, 0]),
    ) as Record<RosterBucket, number>;
    for (const row of rows) {
      distribution[row.bucket] += 1;
      const courseKey = row.departmentId ?? "__unassigned__";
      const course = byCourse.get(courseKey) ?? {
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        departmentCode: row.departmentCode,
        count: 0,
      };
      course.count += 1;
      byCourse.set(courseKey, course);
      if (row.departmentId && row.yearLevel) {
        const gridKey = `${row.departmentId}:${row.departmentCode}`;
        const grid = byCourseYearLevel.get(gridKey) ?? {
          departmentId: row.departmentId,
          departmentName: row.departmentName ?? "",
          departmentCode: row.departmentCode ?? "",
          counts: Object.fromEntries(YEAR_LEVELS.map((level) => [level, 0])),
          total: 0,
        };
        grid.counts[row.yearLevel] = (grid.counts[row.yearLevel] ?? 0) + 1;
        grid.total += 1;
        byCourseYearLevel.set(gridKey, grid);
      }
    }
    return {
      byCourse: [...byCourse.values()].sort((a, b) => {
        if (!a.departmentId) return 1;
        if (!b.departmentId) return -1;
        return (a.departmentName ?? "").localeCompare(b.departmentName ?? "");
      }),
      byCourseYearLevel: [...byCourseYearLevel.values()].sort((a, b) =>
        a.departmentName.localeCompare(b.departmentName),
      ),
      distribution,
      unassignedTotal,
      total: rows.length,
    };
  }
}
