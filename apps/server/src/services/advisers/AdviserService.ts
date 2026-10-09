import {
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  departmentLevelRangeLabel,
  deriveDepartmentCode,
  normalizeYearLevels,
  yearLevelsOverlap,
  type YearLevel,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { genId } from "../../lib/db/ids.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { CalendarSyncService } from "../calendar/CalendarSyncService.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import {
  DepartmentModel,
  type DepartmentRow,
} from "../../models/DepartmentModel.js";
import { UserModel } from "../../models/UserModel.js";

export type AssignmentInput = { departmentId: string; yearLevels: YearLevel[] };

export type AdviserView = {
  id: string;
  name: string;
  email: string;
  departments: Array<{
    id: string;
    name: string;
    code: string;
    yearLevels: YearLevel[];
  }>;
};

const MISSING_DEPARTMENTS = "One or more departments don't exist.";

async function departmentsByIds(ids: string[]): Promise<DepartmentRow[]> {
  const rows = await DepartmentModel.findByIds(ids);
  if (rows.length !== new Set(ids).size) {
    throw new ApiError("NOT_FOUND", { message: MISSING_DEPARTMENTS });
  }
  return rows;
}

function assertLevelsOffered(
  department: { name: string; yearLevels?: YearLevel[] },
  requested: YearLevel[],
): void {
  const unsupported = requested.filter(
    (level) => !departmentAcceptsLevel(department.yearLevels ?? [], level),
  );
  if (unsupported.length > 0) {
    throw new ApiError("CONFLICT", {
      message: `${department.name} doesn't offer ${unsupported
        .map((level) => YEAR_LEVEL_LABELS[level])
        .join(", ")}.`,
    });
  }
}

async function clashHolder(
  departmentId: string,
  levels: YearLevel[],
  adviserId: string,
): Promise<{ adviserId: string } | null> {
  const others = await AdviserDepartmentModel.listOtherHolders(
    departmentId,
    adviserId,
  );
  return (
    others.find((o) => yearLevelsOverlap(o.yearLevels ?? [], levels)) ?? null
  );
}

async function holderName(adviserId: string): Promise<string> {
  const [user] = await UserModel.findByIds([adviserId]);
  return user?.name?.trim() || "An instructor";
}

async function writeAssignments(
  adviserId: string,
  assignments: AssignmentInput[],
): Promise<void> {
  // Departments taken away must not stay open or keep a student locked.
  const keep = assignments.map((a) => a.departmentId);
  await AdviserAvailabilityModel.closeOpenForAdviser(adviserId, keep);
  await EnrollmentQueueModel.releaseServingExcept(adviserId, keep);
  await AdviserDepartmentModel.deleteForAdviser(adviserId);
  await AdviserDepartmentModel.insertMany(
    assignments.map((assignment) => ({
      _id: genId("adviser-dept"),
      adviserId,
      departmentId: assignment.departmentId,
      yearLevels: assignment.yearLevels,
    })),
  );
}

export class AdviserService {
  static async list(): Promise<AdviserView[]> {
    const rows = await UserModel.listByRole("ENROLLMENT_ADVISER");
    const links = await AdviserDepartmentModel.listAll();
    const departments = await DepartmentModel.findByIds(
      links.map((link) => link.departmentId),
    );
    const departmentById = new Map(
      departments.map((dept) => [String(dept._id), dept]),
    );

    return rows.map((row) => ({
      id: String(row._id),
      name: row.name ?? "",
      email: row.email ?? "",
      departments: links
        .filter((link) => link.adviserId === String(row._id))
        .map((link) => {
          const department = departmentById.get(link.departmentId);
          const name = department?.name ?? "Unknown";
          return {
            id: link.departmentId,
            name,
            code: deriveDepartmentCode(name),
            yearLevels: normalizeYearLevels(link.yearLevels ?? []),
          };
        }),
    }));
  }

  static async replaceAssignments(
    actorId: string,
    adviserId: string,
    assignments: AssignmentInput[],
  ): Promise<{ adviserId: string; assignments: AssignmentInput[] }> {
    const adviser = await UserModel.findById(adviserId);
    if (!adviser)
      throw new ApiError("NOT_FOUND", { message: "Adviser not found." });
    if (adviser.role !== "ENROLLMENT_ADVISER") {
      throw new ApiError("CONFLICT", {
        message: "Only instructor (adviser) accounts can be mapped.",
      });
    }

    const merged = new Map<string, YearLevel[]>();
    for (const assignment of assignments) {
      const levels = merged.get(assignment.departmentId);
      merged.set(
        assignment.departmentId,
        levels
          ? normalizeYearLevels([...levels, ...assignment.yearLevels])
          : [...assignment.yearLevels],
      );
    }
    const unique = [...merged].map(([departmentId, yearLevels]) => ({
      departmentId,
      yearLevels: normalizeYearLevels(yearLevels),
    }));

    const departments = await departmentsByIds(
      unique.map((u) => u.departmentId),
    );
    for (const assignment of unique) {
      const department = departments.find(
        (d) => String(d._id) === assignment.departmentId,
      )!;
      assertLevelsOffered(department, assignment.yearLevels);
      const clash = await clashHolder(
        assignment.departmentId,
        assignment.yearLevels,
        adviserId,
      );
      if (clash) {
        throw new ApiError("CONFLICT", {
          message: `${deriveDepartmentCode(department.name)} — those year levels are already served by ${await holderName(clash.adviserId)}.`,
        });
      }
    }

    await writeAssignments(adviserId, unique);
    const removed = await AvailabilityWindowModel.deleteForAdviser(
      adviserId,
      unique.map((a) => a.departmentId),
    );
    if (removed > 0) await CalendarSyncService.afterScheduleChange(adviserId);
    const inactive = unique.filter(
      (a) =>
        !departments.find((d) => String(d._id) === a.departmentId)?.isActive,
    ).length;
    await AdminActionLogModel.log(
      actorId,
      "Updated adviser mapping",
      `${adviser.name} → ${unique.length} department${unique.length === 1 ? "" : "s"}${inactive > 0 ? ` (${inactive} inactive)` : ""}`,
    );
    return {
      adviserId,
      assignments: unique.map(({ departmentId, yearLevels }) => ({
        departmentId,
        yearLevels,
      })),
    };
  }

  static async assignSelf(
    adviserId: string,
    input: { departmentIds: string[]; yearLevels: YearLevel[] },
  ): Promise<{ departmentIds: string[]; yearLevels: YearLevel[] }> {
    const departmentIds = [...new Set(input.departmentIds)];
    const requested = normalizeYearLevels(input.yearLevels);
    const departments = await departmentsByIds(departmentIds);

    if (departments.some((dept) => !dept.isActive)) {
      throw new ApiError("CONFLICT", {
        message: "Deactivated departments can't be assigned.",
      });
    }
    for (const department of departments) {
      assertLevelsOffered(department, requested);
    }
    for (const departmentId of departmentIds) {
      const clash = await clashHolder(departmentId, requested, adviserId);
      if (!clash) continue;
      const department = departments.find(
        (d) => String(d._id) === departmentId,
      )!;
      const scope =
        requested.length > 0
          ? departmentLevelRangeLabel(requested)
          : "the whole department";
      throw new ApiError("CONFLICT", {
        message: `${deriveDepartmentCode(department.name)} — ${scope} is already served by ${await holderName(clash.adviserId)}. Request a transfer to take it over.`,
      });
    }

    await writeAssignments(
      adviserId,
      departmentIds.map((departmentId) => ({
        departmentId,
        yearLevels: requested,
      })),
    );
    return {
      departmentIds,
      yearLevels: departmentIds.length > 0 ? requested : [],
    };
  }
}
