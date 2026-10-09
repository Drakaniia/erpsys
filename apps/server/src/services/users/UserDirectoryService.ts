import {
  deriveDepartmentCode,
  type YearLevel,
} from "../../config/constants.js";
import { escapeQueryRegex } from "../../config/queue.js";
import { AcademicYearService } from "../academic-years/AcademicYearService.js";
import type { AcademicYearRow } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { StudentEnrollmentModel } from "../../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";

const SUB_LOOKUP_LIMIT = 1000;

export type UserDirectoryFilter = {
  q: string;
  role: "ALL" | "STUDENT" | "SBO_OFFICER" | "ENROLLMENT_ADVISER" | "ADMIN";
  outside: "ALL" | "INSIDE" | "OUTSIDE";
  academicYearId?: string;
  departmentId?: string;
  yearLevel?: YearLevel;
};

export type UserDirectorySort = "joined" | "studentNumber" | "name";
export type UserDirectoryDir = "asc" | "desc";

export type UserDirectoryItem = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  isOutsideOrg: boolean;
  blocked: boolean;
  studentNumber: string | null;
  studentProfileId: string | null;
  department: { id: string; name: string; code: string } | null;
  yearLevel: string | null;
  joinedAt: string;
};

function displayNameOf(user: { name?: string | null; email?: string }): string {
  const name = user.name?.trim() ?? "";
  if (name) return name;
  const local = (user.email ?? "").split("@")[0]?.trim() ?? "";
  return local || "Unknown";
}

export class UserDirectoryService {
  private static async userIdsByStudentNumber(q: string): Promise<string[]> {
    const pattern = { $regex: escapeQueryRegex(q), $options: "i" };
    const profiles = await StudentProfileModel.searchByStudentNumber(
      pattern,
      SUB_LOOKUP_LIMIT,
    );
    const full = await StudentProfileModel.findByIds(
      profiles.map((profile) => String(profile._id)),
    );
    return full.map((profile) => String(profile.userId));
  }

  static async filter(
    input: UserDirectoryFilter,
    year: AcademicYearRow | null,
  ): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = {};
    const q = input.q.trim();
    if (q) {
      const pattern = { $regex: escapeQueryRegex(q), $options: "i" };
      filter.$or = [
        { name: pattern },
        { email: pattern },
        { _id: { $in: await UserDirectoryService.userIdsByStudentNumber(q) } },
      ];
    }
    if (input.role !== "ALL") filter.role = input.role;
    if (input.outside !== "ALL")
      filter.isOutsideOrg = input.outside === "OUTSIDE";

    if (year && (input.departmentId || input.yearLevel)) {
      const matched = await StudentEnrollmentModel.listForYearFilter({
        academicYearId: String(year._id),
        departmentId: input.departmentId,
        yearLevel: input.yearLevel,
      });
      const owners = await StudentProfileModel.findByIds([
        ...new Set(matched.map((row) => row.studentProfileId)),
      ]);
      filter._id = { $in: owners.map((owner) => String(owner.userId)) };
    }
    return filter;
  }

  static async count(filter: Record<string, unknown>): Promise<number> {
    return UserModel.countForDirectory(filter);
  }

  static async fetchRows(
    filter: Record<string, unknown>,
    dir: UserDirectoryDir,
    paging?: { page: number; pageSize: number },
  ): Promise<
    Array<{
      _id: string;
      name?: string | null;
      email?: string;
      image?: string | null;
      role?: string;
      isOutsideOrg?: boolean;
      blockedAt?: Date | null;
      createdAt?: Date | null;
    }>
  > {
    return UserModel.listForDirectory(filter, dir, paging);
  }

  static async loadItems(
    rows: Array<{
      _id: string;
      name?: string | null;
      email?: string;
      image?: string | null;
      role?: string;
      isOutsideOrg?: boolean;
      blockedAt?: Date | null;
      createdAt?: Date | null;
    }>,
    year: AcademicYearRow | null,
  ): Promise<UserDirectoryItem[]> {
    const userIds = rows.map((row) => String(row._id));
    const profiles = await StudentProfileModel.listByUserIds(userIds);
    const profileIdByUser = new Map(
      profiles.map((profile) => [String(profile.userId), String(profile._id)]),
    );
    const studentNumbers = new Map<string, string | null>();
    const fullProfiles = await StudentProfileModel.findByIds(
      profiles.map((profile) => String(profile._id)),
    );
    for (const profile of fullProfiles) {
      studentNumbers.set(String(profile.userId), profile.studentNumber ?? null);
    }

    const placement = new Map<
      string,
      {
        department: { id: string; name: string; code: string } | null;
        yearLevel: string | null;
      }
    >();
    if (year && userIds.length > 0) {
      const yearId = String(year._id);
      const enrollments = await StudentEnrollmentModel.listByProfiles(
        profiles.map((profile) => String(profile._id)),
        yearId,
      );
      const departments = await DepartmentModel.findByIds(
        enrollments.map((row) => String(row.departmentId ?? "")),
      );
      const nameByDept = new Map(
        departments.map((dept) => [String(dept._id), dept.name]),
      );
      for (const record of enrollments) {
        const profileId = String(record.studentProfileId);
        const userId = profiles.find(
          (profile) => String(profile._id) === profileId,
        )?.userId;
        if (!userId) continue;
        const deptName = record.departmentId
          ? nameByDept.get(String(record.departmentId))
          : undefined;
        placement.set(String(userId), {
          department: record.departmentId
            ? {
                id: String(record.departmentId),
                name: deptName ?? "Unknown",
                code: deptName ? deriveDepartmentCode(deptName) : "UNK",
              }
            : null,
          yearLevel: record.yearLevel ?? null,
        });
      }
    }

    return rows.map((row) => {
      const id = String(row._id);
      return {
        id,
        name: displayNameOf({ name: row.name, email: row.email }),
        email: row.email ?? "",
        image: row.image ?? null,
        role: row.role ?? "STUDENT",
        isOutsideOrg: Boolean(row.isOutsideOrg),
        blocked: row.blockedAt != null,
        studentNumber: studentNumbers.get(id) ?? null,
        studentProfileId: profileIdByUser.get(id) ?? null,
        department: placement.get(id)?.department ?? null,
        yearLevel: placement.get(id)?.yearLevel ?? null,
        joinedAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
      };
    });
  }

  static sort(
    items: UserDirectoryItem[],
    sort: UserDirectorySort,
    dir: UserDirectoryDir,
  ): UserDirectoryItem[] {
    const sign = dir === "asc" ? 1 : -1;
    if (sort === "studentNumber") {
      return items.sort(
        (a, b) =>
          sign *
          (a.studentNumber ?? "").localeCompare(
            b.studentNumber ?? "",
            undefined,
            {
              numeric: true,
            },
          ),
      );
    }
    if (sort === "name") {
      return items.sort((a, b) => sign * a.name.localeCompare(b.name));
    }
    return items;
  }

  static async page(
    input: UserDirectoryFilter & {
      sort: UserDirectorySort;
      dir: UserDirectoryDir;
      page: number;
      pageSize: number;
    },
  ) {
    const year = await AcademicYearService.resolve(input.academicYearId);
    const filter = await UserDirectoryService.filter(input, year);
    const [total, rows] = await Promise.all([
      UserModel.countForDirectory(filter),
      UserDirectoryService.fetchRows(filter, input.dir, {
        page: input.page,
        pageSize: input.pageSize,
      }),
    ]);
    const items = UserDirectoryService.sort(
      await UserDirectoryService.loadItems(rows, year),
      input.sort,
      input.dir,
    );
    return { items, total };
  }
}
