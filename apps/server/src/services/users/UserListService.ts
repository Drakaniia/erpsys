import { z } from "zod";
import {
  YEAR_LEVELS,
  deriveDepartmentCode,
  type YearLevel,
} from "../../config/constants.js";
import { COLLECTIONS, getDbSync, refIn } from "../../lib/db/db.js";
import type { AcademicYearRow } from "../../models/AcademicYearModel.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";

export const userListQuery = z.object({
  q: z.string().max(100).default(""),
  role: z
    .enum(["ALL", "STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER", "ADMIN"])
    .default("ALL"),
  outside: z.enum(["ALL", "INSIDE", "OUTSIDE"]).default("ALL"),
  academicYearId: z.string().optional(),
  departmentId: z.string().optional(),
  yearLevel: z.enum(YEAR_LEVELS).optional(),
  sort: z.enum(["joined", "studentNumber", "name"]).default("joined"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type UserListInput = z.infer<typeof userListQuery>;

export type UserListItem = {
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

type UserRow = {
  _id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  isOutsideOrg: boolean;
  blockedAt?: Date | null;
  createdAt: Date;
};

const SUB_LOOKUP_LIMIT = 1000;

const displayNameOf = (name: string, email: string): string =>
  name.trim() || email.split("@")[0]?.trim() || email;

async function resolveYear(
  requestedId?: string,
): Promise<AcademicYearRow | null> {
  if (requestedId) return AcademicYearModel.findById(requestedId);
  const active = await AcademicYearModel.findActive();
  if (active) return active;
  const newest = await AcademicYearModel.list();
  return newest[0] ?? null;
}

export class UserListService {
  static async list(
    input: UserListInput,
  ): Promise<{ items: UserListItem[]; total: number }> {
    const db = getDbSync();
    const year = await resolveYear(input.academicYearId);
    const filter: Record<string, unknown> = {};
    const q = input.q.trim();

    if (q) {
      const profiles = await db
        .collection<{ userId: string }>(COLLECTIONS.studentProfile)
        .find({ studentNumber: { $regex: q, $options: "i" } } as never, {
          projection: { userId: 1 },
        })
        .limit(SUB_LOOKUP_LIMIT)
        .toArray();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { _id: { $in: profiles.map((profile) => profile.userId) } },
      ];
    }
    if (input.role !== "ALL") filter.role = input.role;
    if (input.outside !== "ALL")
      filter.isOutsideOrg = input.outside === "OUTSIDE";

    if (year && (input.departmentId || input.yearLevel)) {
      const enrollments = await db
        .collection<{ studentProfileId: string }>(COLLECTIONS.studentEnrollment)
        .find(
          {
            academicYearId: String(year._id),
            ...(input.departmentId ? { departmentId: input.departmentId } : {}),
            ...(input.yearLevel ? { yearLevel: input.yearLevel } : {}),
          } as never,
          { projection: { studentProfileId: 1 } },
        )
        .limit(SUB_LOOKUP_LIMIT)
        .toArray();
      const owners =
        enrollments.length > 0
          ? await db
              .collection<{ userId: string }>(COLLECTIONS.studentProfile)
              .find(
                {
                  _id: {
                    $in: enrollments.map((row) => row.studentProfileId),
                  },
                } as never,
                { projection: { userId: 1 } },
              )
              .limit(SUB_LOOKUP_LIMIT)
              .toArray()
          : [];
      filter._id = refIn(owners.map((owner) => owner.userId));
    }

    const total = await db
      .collection(COLLECTIONS.user)
      .countDocuments(filter as never);
    const rows = await db
      .collection<UserRow>(COLLECTIONS.user)
      .find(filter as never)
      .sort({ createdAt: input.dir === "asc" ? 1 : -1 })
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .toArray();

    return {
      total,
      items: UserListService.sort(
        await hydrate(rows, year),
        input.sort,
        input.dir,
      ),
    };
  }

  static sort(
    items: UserListItem[],
    sort: UserListInput["sort"],
    dir: UserListInput["dir"],
  ): UserListItem[] {
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
}

async function hydrate(
  rows: UserRow[],
  year: AcademicYearRow | null,
): Promise<UserListItem[]> {
  const db = getDbSync();
  const userIds = rows.map((row) => String(row._id));
  const studentNumbers = new Map<string, string | null>();
  const profileIds = new Map<string, string>();

  if (rows.length > 0) {
    const profiles = await db
      .collection<{ _id: string; userId: string; studentNumber?: string }>(
        COLLECTIONS.studentProfile,
      )
      .find({ userId: { $in: userIds } } as never, {
        projection: { _id: 1, userId: 1, studentNumber: 1 },
      })
      .toArray();
    for (const profile of profiles) {
      studentNumbers.set(profile.userId, profile.studentNumber ?? null);
      if (!profileIds.has(profile.userId))
        profileIds.set(profile.userId, String(profile._id));
    }
  }

  const placements = new Map<
    string,
    {
      department: { id: string; name: string; code: string } | null;
      yearLevel: YearLevel | null;
    }
  >();
  if (year && rows.length > 0) {
    const profiles = await db
      .collection<{ _id: string; userId: string }>(COLLECTIONS.studentProfile)
      .find({ userId: { $in: userIds } } as never, {
        projection: { _id: 1, userId: 1 },
      })
      .toArray();
    const enrollments =
      profiles.length > 0
        ? await db
            .collection<{
              studentProfileId: string;
              departmentId?: string;
              yearLevel?: YearLevel;
            }>(COLLECTIONS.studentEnrollment)
            .find({
              academicYearId: String(year._id),
              studentProfileId: { $in: profiles.map((p) => String(p._id)) },
            } as never)
            .toArray()
        : [];
    const departmentIds = [
      ...new Set(enrollments.map((row) => row.departmentId).filter(Boolean)),
    ] as string[];
    const departments =
      departmentIds.length > 0
        ? await db
            .collection<{ _id: string; name: string }>(COLLECTIONS.department)
            .find({ _id: { $in: departmentIds } } as never, {
              projection: { name: 1 },
            })
            .toArray()
        : [];
    const nameByDepartment = new Map(
      departments.map((d) => [String(d._id), d.name]),
    );
    const userIdByProfile = new Map(
      profiles.map((p) => [String(p._id), p.userId]),
    );

    for (const record of enrollments) {
      const userId = userIdByProfile.get(String(record.studentProfileId));
      if (!userId) continue;
      const name = record.departmentId
        ? nameByDepartment.get(record.departmentId)
        : undefined;
      placements.set(userId, {
        department: record.departmentId
          ? {
              id: record.departmentId,
              name: name ?? "Unknown",
              code: name ? deriveDepartmentCode(name) : "UNK",
            }
          : null,
        yearLevel: record.yearLevel ?? null,
      });
    }
  }

  return rows.map((row) => ({
    id: String(row._id),
    name: displayNameOf(row.name, row.email),
    email: row.email,
    image: row.image ?? null,
    role: row.role,
    isOutsideOrg: row.isOutsideOrg,
    blocked: row.blockedAt != null,
    studentNumber: studentNumbers.get(String(row._id)) ?? null,
    studentProfileId: profileIds.get(String(row._id)) ?? null,
    department: placements.get(String(row._id))?.department ?? null,
    yearLevel: placements.get(String(row._id))?.yearLevel ?? null,
    joinedAt: new Date(row.createdAt).toISOString(),
  }));
}
