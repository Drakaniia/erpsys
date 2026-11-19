import { deriveDepartmentCode, type YearLevel } from "../config/constants.js";
import { escapeQueryRegex } from "../config/queue.js";
import type { AcademicYearRow } from "../models/AcademicYearModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import { StudentEnrollmentModel } from "../models/StudentEnrollmentModel.js";
import { StudentProfileModel } from "../models/StudentProfileModel.js";
import { UserModel } from "../models/UserModel.js";
import { resolveYear } from "./academic-years.js";

type UserDirectoryFilter = {
  q: string;
  role: "ALL" | "STUDENT" | "SBO_OFFICER" | "ENROLLMENT_ADVISER" | "ADMIN";
  outside: "ALL" | "INSIDE" | "OUTSIDE";
  academicYearId?: string;
  departmentId?: string;
  yearLevel?: YearLevel;
};

async function directoryFilter(
  input: UserDirectoryFilter,
  year: AcademicYearRow | null,
): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};
  const q = input.q.trim();
  if (q) {
    const pattern = { $regex: escapeQueryRegex(q), $options: "i" };
    const profiles = await StudentProfileModel.findByIds(
      (await StudentProfileModel.searchByStudentNumber(pattern, 1000)).map(
        (profile) => String(profile._id),
      ),
    );
    filter.$or = [
      { name: pattern },
      { email: pattern },
      { _id: { $in: profiles.map((profile) => String(profile.userId)) } },
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
    const owners = await StudentProfileModel.findByIds(
      matched.map((row) => row.studentProfileId),
    );
    filter._id = { $in: owners.map((owner) => String(owner.userId)) };
  }
  return filter;
}

async function loadItems(
  rows: Awaited<ReturnType<typeof UserModel.listForDirectory>>,
  year: AcademicYearRow | null,
) {
  const profiles = await StudentProfileModel.listByUserIds(
    rows.map((row) => String(row._id)),
  );
  const profileIdByUser = new Map(
    profiles.map((profile) => [String(profile.userId), String(profile._id)]),
  );
  const userByProfile = new Map(
    profiles.map((profile) => [String(profile._id), String(profile.userId)]),
  );
  const studentNumbers = new Map(
    (await StudentProfileModel.findByIds([...userByProfile.keys()])).map(
      (profile) => [String(profile.userId), profile.studentNumber ?? null],
    ),
  );

  const placement = new Map<
    string,
    {
      department: { id: string; name: string; code: string } | null;
      yearLevel: string | null;
    }
  >();
  if (year) {
    const enrollments = await StudentEnrollmentModel.listByProfiles(
      [...userByProfile.keys()],
      String(year._id),
    );
    const departments = await DepartmentModel.findByIds(
      enrollments.map((row) => String(row.departmentId ?? "")),
    );
    const nameByDept = new Map(departments.map((d) => [String(d._id), d.name]));
    for (const record of enrollments) {
      const userId = userByProfile.get(String(record.studentProfileId));
      if (!userId) continue;
      const deptId = record.departmentId ? String(record.departmentId) : null;
      const name = deptId ? nameByDept.get(deptId) : undefined;
      placement.set(userId, {
        department: deptId
          ? {
              id: deptId,
              name: name ?? "Unknown",
              code: name ? deriveDepartmentCode(name) : "UNK",
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
      name:
        row.name?.trim() ||
        (row.email ?? "").split("@")[0]?.trim() ||
        "Unknown",
      email: row.email ?? "",
      image: row.image ?? null,
      role: row.role ?? "STUDENT",
      isOutsideOrg: Boolean(row.isOutsideOrg),
      blocked: row.blockedAt != null,
      emailVerified: row.emailVerified === true,
      studentNumber: studentNumbers.get(id) ?? null,
      studentProfileId: profileIdByUser.get(id) ?? null,
      department: placement.get(id)?.department ?? null,
      yearLevel: placement.get(id)?.yearLevel ?? null,
      joinedAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
    };
  });
}

export async function userDirectoryPage(
  input: UserDirectoryFilter & {
    sort: "joined" | "studentNumber" | "name";
    dir: "asc" | "desc";
    page: number;
    pageSize: number;
  },
) {
  const year = await resolveYear(input.academicYearId);
  const filter = await directoryFilter(input, year);
  const [total, rows] = await Promise.all([
    UserModel.countForDirectory(filter),
    UserModel.listForDirectory(filter, input.dir, input),
  ]);
  const items = await loadItems(rows, year);
  const sign = input.dir === "asc" ? 1 : -1;
  if (input.sort === "studentNumber") {
    items.sort(
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
  } else if (input.sort === "name") {
    items.sort((a, b) => sign * a.name.localeCompare(b.name));
  }
  return { items, total, year };
}
