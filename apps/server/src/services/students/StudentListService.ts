import { ApiError } from "../../config/errors.js";
import {
  ROSTER_SORTS,
  ROSTER_STEP_STATES,
  RosterService,
  type RosterBucket,
  type RosterFilter,
  type RosterSort,
  type RosterStepState,
} from "./RosterService.js";
import { UserDirectoryService } from "../users/UserDirectoryService.js";
import { StudentProfileModel } from "../../models/StudentProfileModel.js";
import { UserModel } from "../../models/UserModel.js";
import { escapeQueryRegex } from "../../config/queue.js";

const ROSTER_KEYS = [
  "scope",
  "cursor",
  "departmentIds",
  "yearLevels",
  "buckets",
  "steps",
  "unassigned",
  "enrolled",
] as const;

export function strArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const out = list.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : undefined;
}

export function optBool(value: unknown): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

type ListQuery = {
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

export class StudentListService {
  static async list(
    user: { id: string; role?: string },
    input: ListQuery,
    query: Record<string, unknown>,
  ) {
    const role = user.role;
    if (role === "STUDENT") {
      throw new ApiError("FORBIDDEN", { message: "Forbidden." });
    }
    const isRosterRequest = ROSTER_KEYS.some((key) => key in query);

    if (role === "ADMIN" && !isRosterRequest) {
      const sort =
        input.sort === "name" || input.sort === "studentNumber"
          ? input.sort
          : "joined";
      const { items, total } = await UserDirectoryService.page({
        q: input.q,
        role:
          input.role === "ALL" ||
          input.role === "STUDENT" ||
          input.role === "SBO_OFFICER" ||
          input.role === "ENROLLMENT_ADVISER" ||
          input.role === "ADMIN"
            ? input.role
            : "ALL",
        outside:
          input.outside === "INSIDE" || input.outside === "OUTSIDE"
            ? input.outside
            : "ALL",
        academicYearId: input.academicYearId,
        departmentId: input.departmentId,
        yearLevel: input.yearLevel as never,
        sort,
        dir: input.dir,
        page: input.page,
        pageSize: input.pageSize,
      });
      return { items, total };
    }

    if (
      role === "ENROLLMENT_ADVISER" ||
      (role === "ADMIN" && isRosterRequest)
    ) {
      const sort: RosterSort = (ROSTER_SORTS as readonly string[]).includes(
        input.sort,
      )
        ? (input.sort as RosterSort)
        : "name";
      const filter: RosterFilter = {
        academicYearId: input.academicYearId,
        departmentIds: strArray(query.departmentIds),
        yearLevels: strArray(query.yearLevels) as RosterFilter["yearLevels"],
        buckets: strArray(query.buckets) as RosterBucket[] | undefined,
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
      const { rows } = await RosterService.load(filter, user.id);
      const sorted = RosterService.sortRows(
        rows,
        sort,
        input.dir === "desc" ? "desc" : "asc",
      );
      const { entries } = RosterService.paginate(
        sorted,
        input.cursor,
        input.limit,
      );
      return { items: entries, total: sorted.length };
    }

    const q = input.q.trim();
    if (!q) return { items: [], total: 0 };
    const rx = { $regex: escapeQueryRegex(q), $options: "i" };
    const [byNumber, byName] = await Promise.all([
      StudentProfileModel.searchByStudentNumber(rx, input.limit),
      UserModel.searchByName(rx, input.limit),
    ]);
    const viaUser = await StudentProfileModel.listByUserIds(
      byName.map((row) => String(row._id)),
      input.limit,
    );
    const seen = new Set<string>();
    const profiles = (
      await StudentProfileModel.findByIds([
        ...byNumber.map((row) => String(row._id)),
        ...viaUser.map((row) => String(row._id)),
      ])
    ).filter((profile) => {
      const id = String(profile._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const users = await UserModel.findByIds(
      profiles.map((profile) => String(profile.userId)),
    );
    const userById = new Map(users.map((row) => [String(row._id), row]));
    const items = profiles.slice(0, input.limit).map((profile) => {
      const owner = userById.get(String(profile.userId));
      const name =
        owner?.name?.trim() ||
        (owner?.email ?? "").split("@")[0]?.trim() ||
        "Unknown";
      return {
        studentProfileId: String(profile._id),
        name,
        studentNumber: profile.studentNumber,
      };
    });
    return { items, total: items.length };
  }
}
