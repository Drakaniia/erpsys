import {
  deriveDepartmentCode,
  normalizeYearLevels,
  type YearLevel,
} from "../config/constants.js";
import {
  availabilityKey,
  escapeQueryRegex,
  levelsCoveredByDepartment,
  liveAvailabilityPairs,
} from "../config/queue.js";
import { summarize } from "../config/schedule.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";
import { AdviserAvailabilityModel } from "../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { AvailabilityWindowModel } from "../models/AvailabilityWindowModel.js";
import {
  DepartmentModel,
  type DepartmentRow,
} from "../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../models/StudentProfileModel.js";
import { UserModel } from "../models/UserModel.js";
import { assertDepartmentAssigned } from "./queues.js";

export function departmentView(row: DepartmentRow) {
  return {
    id: String(row._id),
    name: row.name,
    code: deriveDepartmentCode(row.name),
    yearLevels: normalizeYearLevels(row.yearLevels ?? []),
    isActive: row.isActive,
  };
}

type OwnerEntry = {
  adviserId: string;
  adviserName: string;
  yearLevels: YearLevel[];
};

export async function departmentListing(callerId: string, isAdmin: boolean) {
  const [links, rows] = await Promise.all([
    AdviserDepartmentModel.listAll(),
    DepartmentModel.listAll(),
  ]);
  const users = await UserModel.findByIds(links.map((l) => l.adviserId));
  const nameById = new Map(users.map((u) => [String(u._id), u.name ?? ""]));

  const ownership = new Map<string, OwnerEntry[]>();
  for (const link of links) {
    const list = ownership.get(link.departmentId) ?? [];
    list.push({
      adviserId: link.adviserId,
      adviserName: nameById.get(link.adviserId) || "Instructor",
      yearLevels: normalizeYearLevels(link.yearLevels ?? []),
    });
    ownership.set(link.departmentId, list);
  }

  return rows.map((row) => {
    const owners = ownership.get(String(row._id)) ?? [];
    const mine = owners.find((o) => o.adviserId === callerId) ?? null;
    return {
      ...departmentView(row),
      ...(isAdmin ? { mappingCount: owners.length } : {}),
      assigned: mine !== null,
      assignedToName: owners[0]?.adviserName ?? null,
      assignedToId: owners[0]?.adviserId ?? null,
      myYearLevels: mine?.yearLevels ?? [],
      owners: owners.map((o) => ({
        adviserId: o.adviserId,
        name: o.adviserName,
        yearLevels: o.yearLevels,
      })),
    };
  });
}

export async function myDepartment(userId: string) {
  const [profile, year] = await Promise.all([
    StudentProfileModel.findByUserId(userId),
    AcademicYearModel.findActive(),
  ]);
  if (!profile || !year) return null;
  const yearId = String(year._id);

  const enrollment = await StudentEnrollmentModel.findByProfileYear(
    profile._id,
    yearId,
  );
  if (!enrollment) return null;
  const departmentId = String(enrollment.departmentId);

  const [department, availabilities, serving, waitingCount, windows] =
    await Promise.all([
      DepartmentModel.findById(departmentId),
      AdviserAvailabilityModel.listOpenByDepartment(departmentId, yearId),
      EnrollmentQueueModel.listInProgress(departmentId, yearId),
      EnrollmentQueueModel.countInLine({
        departmentId,
        academicYearId: yearId,
        status: { $in: ["WAITING", "IN_PROGRESS"] },
      }),
      AvailabilityWindowModel.listByDepartment(departmentId, yearId),
    ]);
  if (!department || !department.isActive) return null;

  const livePairs = liveAvailabilityPairs({ availabilities, serving });
  const adviserIds = [...new Set(availabilities.map((a) => a.adviserId))];
  const [advisers, assignments] =
    adviserIds.length > 0
      ? await Promise.all([
          UserModel.findByIds(adviserIds),
          AdviserDepartmentModel.listByDepartment(departmentId),
        ])
      : [[], []];

  const coveredLevels =
    levelsCoveredByDepartment({ availabilities, serving, assignments }).get(
      departmentId,
    ) ?? [];
  const firstLive = availabilities.find((a) =>
    livePairs.has(availabilityKey(a.adviserId, departmentId)),
  );

  return {
    departmentId,
    departmentName: department.name,
    code: deriveDepartmentCode(department.name),
    isOpen: Boolean(firstLive),
    openBy: firstLive
      ? {
          id: firstLive.adviserId,
          name:
            advisers.find((u) => String(u._id) === firstLive.adviserId)?.name ??
            "Adviser",
        }
      : null,
    waitingCount,
    servesMyLevel: coveredLevels.includes(enrollment.yearLevel),
    myYearLevel: enrollment.yearLevel,
    openLevels: coveredLevels,
    schedule: summarize(windows, Date.now()),
  };
}

export async function enrollmentRegister(
  adviserId: string,
  departmentId: string,
  yearId: string,
  filter: {
    range: "today" | "ay" | "all";
    q?: string;
    cursor?: string;
    limit: number;
  },
) {
  await assertDepartmentAssigned(adviserId, departmentId);

  const completedAt: Record<string, Date> = {};
  if (filter.range === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    completedAt.$gte = start;
    completedAt.$lte = end;
  }
  if (filter.cursor) completedAt.$lt = new Date(filter.cursor);
  const where: {
    departmentId: string;
    academicYearId: string;
    completedAt?: Record<string, Date>;
    studentProfileIds?: string[];
  } = {
    departmentId,
    academicYearId: yearId,
    ...(Object.keys(completedAt).length > 0 ? { completedAt } : {}),
  };
  if (filter.q) {
    const pattern = { $regex: escapeQueryRegex(filter.q), $options: "i" };
    const [byNumber, byName] = await Promise.all([
      StudentProfileModel.searchByStudentNumber(pattern),
      UserModel.searchByName(pattern),
    ]);
    const linked = await StudentProfileModel.listByUserIds(
      byName.map((u) => String(u._id)),
    );
    where.studentProfileIds = [
      ...new Set([...byNumber, ...linked].map((p) => String(p._id))),
    ];
  }

  const rows = await EnrollmentQueueModel.listCompleted(
    where,
    filter.limit + 1,
  );
  const total = await EnrollmentQueueModel.countCompleted(where);
  const hasMore = rows.length > filter.limit;
  const page = hasMore ? rows.slice(0, filter.limit) : rows;

  const profiles = await StudentProfileModel.findByIds(
    page.map((entry) => entry.studentProfileId),
  );
  const [users, advisers] = await Promise.all([
    UserModel.findByIds(profiles.map((profile) => profile.userId)),
    UserModel.findByIds(
      page
        .map((entry) => entry.servedById)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  ]);
  const nameByUserId = new Map(
    [...users, ...advisers].map((u) => [String(u._id), u.name ?? ""] as const),
  );
  const profileById = new Map(profiles.map((p) => [String(p._id), p] as const));
  const last = page[page.length - 1];

  return {
    entries: page.map((entry) => {
      const profile = profileById.get(entry.studentProfileId);
      return {
        enrollmentId: entry._id,
        studentProfileId: entry.studentProfileId,
        studentName: profile ? (nameByUserId.get(profile.userId) ?? "") : "",
        studentNumber: profile?.studentNumber ?? null,
        completedAt: entry.completedAt
          ? new Date(entry.completedAt).toISOString()
          : "",
        servedByName: entry.servedById
          ? (nameByUserId.get(entry.servedById) ?? "")
          : "",
      };
    }),
    total,
    nextCursor:
      hasMore && last?.completedAt
        ? new Date(last.completedAt).toISOString()
        : "",
  };
}
