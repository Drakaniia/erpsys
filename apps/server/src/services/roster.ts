import {
  PRE_ENROLLMENT_STEP_CODES,
  STEP_CODES,
  YEAR_LEVELS,
  deriveDepartmentCode,
  listStepCodeMap,
  type YearLevel,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { escapeQueryRegex } from "../config/queue.js";
import type { SessionUser } from "../middleware/auth.js";
import type { AcademicYearRow } from "../models/AcademicYearModel.js";

import { DepartmentModel } from "../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";

import { StepVerificationModel } from "../models/StepVerificationModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";

import { UserModel } from "../models/UserModel.js";
import { resolveYear } from "./academic-years.js";
import { displayName } from "./submissions.js";
import { userDirectoryPage } from "./users.js";

const ROSTER_STEP_STATES = [
  "MISSING",
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
  "RETURNED",
] as const;
type RosterStepState = (typeof ROSTER_STEP_STATES)[number];

const ROSTER_BUCKETS = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "READY_FOR_QUEUE",
  "ENROLLED",
] as const;
type RosterBucket = (typeof ROSTER_BUCKETS)[number];

export const ROSTER_SORTS = [
  "name",
  "studentNumber",
  "stepsVerified",
  "yearLevel",
  "enrolledAt",
] as const;
export type RosterSort = (typeof ROSTER_SORTS)[number];

type RosterFilter = {
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
};

type RosterRow = RosterStudent & {
  stepsVerified: number;
  stepsTotal: number;
  stepStates: { code: string; status: RosterStepState }[];
  queueStatus: "NONE" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
  enrolled: boolean;
  enrolledAt: string | null;
  pendingReview: number;
  bucket: RosterBucket;
};

type CourseCount = {
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  count: number;
};

type CourseGrid = {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  counts: Record<string, number>;
  total: number;
};

const ROSTER_KEYS = [
  "scope",
  "cursor",
  "departmentIds",
  "yearLevels",
  "buckets",
  "steps",
  "unassigned",
  "enrolled",
];

function strArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const list = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string",
  );
  return list.length > 0 ? list : undefined;
}

function optBool(value: unknown): boolean | undefined {
  return value === "true" ? true : value === "false" ? false : undefined;
}

export function rosterFilter(
  input: {
    academicYearId?: string;
    scope: "mine" | "all";
    q?: string;
    stepState?: string;
    enrolled?: string;
    unassigned?: string;
  },
  query: Record<string, unknown>,
): RosterFilter {
  return {
    academicYearId: input.academicYearId,
    departmentIds: strArray(query.departmentIds),
    yearLevels: strArray(query.yearLevels) as RosterFilter["yearLevels"],
    buckets: strArray(query.buckets) as RosterFilter["buckets"],
    steps: strArray(query.steps),
    stepState: (input.stepState || undefined) as RosterFilter["stepState"],
    enrolled: optBool(input.enrolled),
    unassigned: input.unassigned === "true" ? true : undefined,
    q: input.q,
    scope: input.scope,
  };
}

export const yearLabel = (year: {
  _id: unknown;
  label: string;
  semesterLabel: string;
}) => ({
  id: String(year._id),
  label: year.label,
  semesterLabel: year.semesterLabel,
});

function classify(
  student: RosterStudent,
  statusOf: Map<string, string>,
  queue: { status: string; completedAt: Date | null } | undefined,
): RosterRow {
  const stepStates = STEP_CODES.map((code) => ({
    code,
    status: (statusOf.get(code) ?? "MISSING") as RosterStepState,
  }));
  const count = (...states: RosterStepState[]) =>
    stepStates.filter((s) => states.includes(s.status)).length;
  const queueStatus = (queue?.status ?? "NONE") as RosterRow["queueStatus"];
  const enrolled =
    queueStatus === "COMPLETED" || statusOf.get("ENROLLMENT") === "VERIFIED";
  const preDone = PRE_ENROLLMENT_STEP_CODES.every(
    (code) => statusOf.get(code) === "VERIFIED",
  );
  return {
    ...student,
    stepsVerified: count("VERIFIED"),
    stepsTotal: STEP_CODES.length,
    stepStates,
    queueStatus,
    enrolled,
    enrolledAt: queue?.completedAt?.toISOString() ?? null,
    pendingReview: count("SUBMITTED", "RETURNED"),
    bucket: enrolled
      ? "ENROLLED"
      : preDone && !queue
        ? "READY_FOR_QUEUE"
        : count("VERIFIED", "SUBMITTED", "RETURNED") > 0 || queue
          ? "IN_PROGRESS"
          : "NOT_STARTED",
  };
}

async function searchProfileIds(q?: string): Promise<string[] | null> {
  const term = q?.trim();
  if (!term) return null;
  const contains = { $regex: escapeQueryRegex(term), $options: "i" };
  const [byNumber, byName] = await Promise.all([
    UserModel.searchProfilesByStudentNumber(contains),
    UserModel.searchByName(contains),
  ]);
  const viaUser = await UserModel.listProfilesByUserIds(
    byName.map((user) => String(user._id)),
  );
  return [...new Set([...byNumber, ...viaUser].map((p) => String(p._id)))];
}

async function profileInfo(profileIds: string[]) {
  const profiles = await UserModel.findProfilesByIds(profileIds);
  const users = await UserModel.findByIds(
    profiles.map((profile) => String(profile.userId)),
  );
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return new Map(
    profiles.map((profile) => {
      const user = userById.get(String(profile.userId));
      const name =
        user?.name?.trim() || user?.email?.trim().split("@")[0]?.trim() || "";
      return [
        String(profile._id),
        { studentNumber: profile.studentNumber ?? null, name },
      ] as const;
    }),
  );
}

async function loadStudents(
  input: RosterFilter,
  adviserId: string,
  yearId: string,
  enrolledIds: string[],
): Promise<RosterStudent[]> {
  const qProfileIds = await searchProfileIds(input.q);
  if (input.unassigned) {
    const profiles = await UserModel.listUnenrolledProfiles(
      enrolledIds,
      qProfileIds,
    );
    const info = await profileInfo(profiles.map((p) => String(p._id)));
    return profiles.map((profile) => {
      const found = info.get(String(profile._id));
      return {
        studentProfileId: String(profile._id),
        studentName: found?.name ?? "",
        studentNumber: found?.studentNumber ?? null,
        departmentId: null,
        departmentName: null,
        departmentCode: null,
        yearLevel: null,
      };
    });
  }

  const owned =
    input.scope === "all"
      ? (await DepartmentModel.listIds()).map((dept) => String(dept._id))
      : (await DepartmentModel.listAssignmentsForAdviser(adviserId)).map(
          (link) => link.departmentId,
        );
  const wanted = new Set(input.departmentIds);
  const enrollments = await StudentEnrollmentModel.listForDepartments(
    yearId,
    input.departmentIds?.length ? owned.filter((id) => wanted.has(id)) : owned,
    input.yearLevels,
    qProfileIds,
  );
  const [info, departments] = await Promise.all([
    profileInfo(enrollments.map((row) => row.studentProfileId)),
    DepartmentModel.findByIds(
      enrollments.map((row) => String(row.departmentId ?? "")),
    ),
  ]);
  const deptNameById = new Map(
    departments.map((dept) => [String(dept._id), dept.name]),
  );
  return enrollments.map((enrollment) => {
    const found = info.get(enrollment.studentProfileId);
    const deptName = deptNameById.get(String(enrollment.departmentId)) ?? null;
    return {
      studentProfileId: enrollment.studentProfileId,
      studentName: found?.name ?? "",
      studentNumber: found?.studentNumber ?? null,
      departmentId: String(enrollment.departmentId ?? ""),
      departmentName: deptName,
      departmentCode: deptName ? deriveDepartmentCode(deptName) : null,
      yearLevel: enrollment.yearLevel ?? null,
    };
  });
}

export async function loadRoster(
  input: RosterFilter,
  adviserId: string,
): Promise<{
  year: AcademicYearRow | null;
  rows: RosterRow[];
  unassignedTotal: number;
}> {
  const year = await resolveYear(input.academicYearId);
  if (!year) return { year: null, rows: [], unassignedTotal: 0 };
  const yearId = String(year._id);
  const enrolledIds = (await StudentEnrollmentModel.listAllForYear(yearId)).map(
    (row) => row.studentProfileId,
  );
  const unassignedTotal = await UserModel.countUnenrolledProfiles(enrolledIds);
  const students = await loadStudents(input, adviserId, yearId, enrolledIds);

  const profileIds = students.map((student) => student.studentProfileId);
  const [verifications, queues, codeMap] = await Promise.all([
    StepVerificationModel.listByProfiles(profileIds, yearId),
    EnrollmentQueueModel.listByProfiles(profileIds, yearId),
    listStepCodeMap(),
  ]);
  const stepCodeById = new Map(
    codeMap.map((step) => [String(step._id), step.code]),
  );
  const statusesByProfile = new Map<string, Map<string, string>>();
  for (const verification of verifications) {
    const code = stepCodeById.get(String(verification.stepId));
    if (!code) continue;
    const statuses =
      statusesByProfile.get(verification.studentProfileId) ?? new Map();
    statusesByProfile.set(
      verification.studentProfileId,
      statuses.set(code, verification.status),
    );
  }
  const queueByProfile = new Map(
    queues.map((queue) => [
      queue.studentProfileId,
      { status: String(queue.status), completedAt: queue.completedAt ?? null },
    ]),
  );

  const rows = students
    .map((student) =>
      classify(
        student,
        statusesByProfile.get(student.studentProfileId) ?? new Map(),
        queueByProfile.get(student.studentProfileId),
      ),
    )
    .filter((row) => {
      if (input.buckets?.length && !input.buckets.includes(row.bucket)) {
        return false;
      }
      if (input.enrolled !== undefined && row.enrolled !== input.enrolled) {
        return false;
      }
      if (!input.steps?.length && !input.stepState) return true;
      const candidates = input.steps?.length
        ? row.stepStates.filter((state) => input.steps!.includes(state.code))
        : row.stepStates;
      return input.stepState
        ? candidates.some((state) => state.status === input.stepState)
        : candidates.some((state) => state.status !== "MISSING");
    });

  return { year, rows, unassignedTotal };
}

export function sortRoster(
  rows: RosterRow[],
  sort: RosterSort,
  dir: "asc" | "desc",
) {
  const factor = dir === "desc" ? -1 : 1;
  const byName = (a: RosterRow, b: RosterRow) =>
    a.studentName.localeCompare(b.studentName);
  const nullsLast = <T>(
    a: RosterRow,
    b: RosterRow,
    av: T | null,
    bv: T | null,
    cmp: (x: T, y: T) => number,
  ) => {
    if (av === null && bv === null) return byName(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    const result = cmp(av, bv);
    return result !== 0 ? factor * result : byName(a, b);
  };
  return rows.slice().sort((a, b) => {
    if (sort === "name") return factor * byName(a, b);
    if (sort === "studentNumber") {
      return nullsLast(a, b, a.studentNumber, b.studentNumber, (x, y) =>
        /^\d+$/.test(x) && /^\d+$/.test(y)
          ? Number(x) - Number(y)
          : x.localeCompare(y),
      );
    }
    if (sort === "enrolledAt") {
      const at = (row: RosterRow) =>
        row.enrolledAt ? new Date(row.enrolledAt).getTime() : null;
      return nullsLast(a, b, at(a), at(b), (x, y) => x - y);
    }
    const value = (row: RosterRow) =>
      sort === "stepsVerified"
        ? row.stepsVerified
        : row.yearLevel
          ? (YEAR_LEVELS as readonly string[]).indexOf(row.yearLevel)
          : -1;
    const av = value(a);
    const bv = value(b);
    return av !== bv ? factor * (av - bv) : byName(a, b);
  });
}

export function summarizeRoster(rows: RosterRow[], unassignedTotal: number) {
  const byCourse = new Map<string, CourseCount>();
  const byCourseYearLevel = new Map<string, CourseGrid>();
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

export async function rosterStats(adviserId: string, filter: RosterFilter) {
  const { year, rows, unassignedTotal } = await loadRoster(
    { ...filter, buckets: undefined },
    adviserId,
  );
  return {
    year: year ? yearLabel(year) : null,
    stats: summarizeRoster(rows, unassignedTotal),
  };
}

type StudentListQuery = {
  q: string;
  page: number;
  pageSize: number;
  limit: number;
  cursor?: string;
  sort: string;
  dir: "asc" | "desc";
  role: string;
  outside: string;
  academicYearId?: string;
  departmentId?: string;
  yearLevel?: string;
  scope: "mine" | "all";
  unassigned?: string;
  enrolled?: string;
  stepState?: string;
};

export async function listStudents(
  user: SessionUser,
  input: StudentListQuery,
  query: Record<string, unknown>,
) {
  const role = user.role;
  if (role === "STUDENT") {
    throw new ApiError("FORBIDDEN", { message: "Forbidden." });
  }
  const isRosterRequest = ROSTER_KEYS.some((key) => key in query);

  if (role === "ADMIN" && !isRosterRequest) {
    return userDirectoryPage({
      q: input.q,
      role:
        (
          [
            "ALL",
            "STUDENT",
            "SBO_OFFICER",
            "ENROLLMENT_ADVISER",
            "ADMIN",
          ] as const
        ).find((r) => r === input.role) ?? "ALL",
      outside:
        input.outside === "INSIDE" || input.outside === "OUTSIDE"
          ? input.outside
          : "ALL",
      academicYearId: input.academicYearId,
      departmentId: input.departmentId,
      yearLevel: input.yearLevel as never,
      sort:
        input.sort === "name" || input.sort === "studentNumber"
          ? input.sort
          : "joined",
      dir: input.dir,
      page: input.page,
      pageSize: input.pageSize,
    });
  }

  if (role === "ENROLLMENT_ADVISER" || role === "ADMIN") {
    const filter: RosterFilter = {
      academicYearId: input.academicYearId,
      departmentIds: strArray(query.departmentIds),
      yearLevels: strArray(query.yearLevels) as RosterFilter["yearLevels"],
      buckets: strArray(query.buckets) as RosterFilter["buckets"],
      steps: strArray(query.steps),
      stepState: (ROSTER_STEP_STATES as readonly string[]).includes(
        input.stepState ?? "",
      )
        ? (input.stepState as RosterStepState)
        : undefined,
      enrolled: optBool(input.enrolled),
      unassigned: input.unassigned === "true" ? true : undefined,
      q: input.q || undefined,
      scope: role === "ADMIN" ? "all" : input.scope,
    };
    const { rows } = await loadRoster(filter, user.id);
    const sorted = sortRoster(
      rows,
      (ROSTER_SORTS as readonly string[]).includes(input.sort)
        ? (input.sort as RosterSort)
        : "name",
      input.dir,
    );
    const start =
      (input.cursor
        ? sorted.findIndex((row) => row.studentProfileId === input.cursor)
        : -1) + 1;
    return {
      items: sorted.slice(start, start + input.limit),
      total: sorted.length,
    };
  }

  const q = input.q.trim();
  if (!q) return { items: [], total: 0 };
  const rx = { $regex: escapeQueryRegex(q), $options: "i" };
  const [byNumber, byName] = await Promise.all([
    UserModel.searchProfilesByStudentNumber(rx, input.limit),
    UserModel.searchByName(rx, input.limit),
  ]);
  const viaUser = await UserModel.listProfilesByUserIds(
    byName.map((row) => String(row._id)),
    input.limit,
  );
  const found = await UserModel.findProfilesByIds(
    [...byNumber, ...viaUser].map((row) => String(row._id)),
  );
  const profiles = [
    ...new Map(found.map((profile) => [String(profile._id), profile])).values(),
  ];
  const users = await UserModel.findByIds(
    profiles.map((profile) => String(profile.userId)),
  );
  const userById = new Map(users.map((row) => [String(row._id), row]));
  const items = profiles.slice(0, input.limit).map((profile) => ({
    studentProfileId: String(profile._id),
    name: displayName(userById.get(String(profile.userId))),
    studentNumber: profile.studentNumber,
  }));
  return { items, total: items.length };
}
