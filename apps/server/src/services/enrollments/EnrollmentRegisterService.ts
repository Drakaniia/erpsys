import { escapeQueryRegex } from "../../config/queue.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import { QueueAccessService } from "../queues/QueueAccessService.js";

export type RegisterFilter = {
  range: "today" | "ay" | "all";
  q?: string;
  cursor?: string;
  limit: number;
};

export type RegisterEntry = {
  enrollmentId: string;
  studentProfileId: string;
  studentName: string;
  studentNumber: string | null;
  completedAt: string;
  servedByName: string;
};

export type RegisterPage = {
  entries: RegisterEntry[];
  total: number;
  nextCursor: string;
};

type Where = {
  departmentId: string;
  academicYearId: string;
  completedAt?: Record<string, Date>;
  studentProfileIds?: string[];
};

function buildWhere(
  departmentId: string,
  yearId: string,
  filter: RegisterFilter,
): Where {
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
  return {
    departmentId,
    academicYearId: yearId,
    ...(Object.keys(completedAt).length > 0 ? { completedAt } : {}),
  };
}

export class EnrollmentRegisterService {
  static async list(
    adviserId: string,
    departmentId: string,
    yearId: string,
    filter: RegisterFilter,
  ): Promise<RegisterPage> {
    await QueueAccessService.assertDepartmentAssigned(adviserId, departmentId);

    const where = buildWhere(departmentId, yearId, filter);
    if (filter.q) {
      const pattern = {
        $regex: escapeQueryRegex(filter.q),
        $options: "i",
      };
      const [byNumber, byName] = await Promise.all([
        StudentProfileModel.searchByStudentNumber(pattern),
        UserModel.searchByName(pattern),
      ]);
      const linked = await StudentProfileModel.listByUserIds(
        byName.map((u) => String(u._id)),
      );
      where.studentProfileIds = [
        ...new Set([
          ...byNumber.map((p) => String(p._id)),
          ...linked.map((p) => String(p._id)),
        ]),
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
      users.map((u) => [String(u._id), u.name ?? ""] as const),
    );
    const adviserById = new Map(
      advisers.map((u) => [String(u._id), u.name ?? ""] as const),
    );
    const profileById = new Map(
      profiles.map((p) => [String(p._id), p] as const),
    );

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
            ? (adviserById.get(entry.servedById) ?? "")
            : "",
        };
      }),
      total,
      nextCursor:
        hasMore && page.length > 0 && page[page.length - 1]?.completedAt
          ? new Date(page[page.length - 1]!.completedAt!).toISOString()
          : "",
    };
  }
}
