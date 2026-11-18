import {
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  departmentLevelRangeLabel,
  deriveDepartmentCode,
  normalizeYearLevels,
  yearLevelsOverlap,
  type YearLevel,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";
import { genId } from "../lib/db/ids.js";
import { AdminActionLogModel } from "../models/AdminActionLogModel.js";
import { AdviserAvailabilityModel } from "../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { AvailabilityWindowModel } from "../models/AvailabilityWindowModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { UserModel } from "../models/UserModel.js";
import { syncAfterScheduleChange } from "./calendar.js";

type Assignment = { departmentId: string; yearLevels: YearLevel[] };

async function departmentsByIds(ids: string[]) {
  const rows = await DepartmentModel.findByIds(ids);
  if (rows.length !== new Set(ids).size) {
    throw new ApiError("NOT_FOUND", {
      message: "One or more departments don't exist.",
    });
  }
  return rows;
}

export function assertLevelsOffered(
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

async function clashHolderName(
  departmentId: string,
  levels: YearLevel[],
  adviserId: string,
): Promise<string | null> {
  const clash = (
    await AdviserDepartmentModel.listOtherHolders(departmentId, adviserId)
  ).find((o) => yearLevelsOverlap(o.yearLevels ?? [], levels));
  if (!clash) return null;
  const [user] = await UserModel.findByIds([clash.adviserId]);
  return user?.name?.trim() || "An instructor";
}

async function writeAssignments(
  adviserId: string,
  assignments: Assignment[],
): Promise<void> {
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

export async function replaceAssignments(
  actorId: string,
  adviserId: string,
  assignments: Assignment[],
): Promise<{ adviserId: string; assignments: Assignment[] }> {
  const adviser = await UserModel.findById(adviserId);
  if (!adviser) {
    throw new ApiError("NOT_FOUND", { message: "Adviser not found." });
  }
  if (adviser.role !== "ENROLLMENT_ADVISER") {
    throw new ApiError("CONFLICT", {
      message: "Only instructor (adviser) accounts can be mapped.",
    });
  }

  const merged = new Map<string, YearLevel[]>();
  for (const { departmentId, yearLevels } of assignments) {
    merged.set(departmentId, [
      ...(merged.get(departmentId) ?? []),
      ...yearLevels,
    ]);
  }
  const unique = [...merged].map(([departmentId, yearLevels]) => ({
    departmentId,
    yearLevels: normalizeYearLevels(yearLevels),
  }));

  const departments = await departmentsByIds(unique.map((u) => u.departmentId));
  const departmentOf = (id: string) =>
    departments.find((d) => String(d._id) === id);
  for (const assignment of unique) {
    const department = departmentOf(assignment.departmentId)!;
    assertLevelsOffered(department, assignment.yearLevels);
    const holder = await clashHolderName(
      assignment.departmentId,
      assignment.yearLevels,
      adviserId,
    );
    if (holder) {
      throw new ApiError("CONFLICT", {
        message: `${deriveDepartmentCode(department.name)} — those year levels are already served by ${holder}.`,
      });
    }
  }

  await writeAssignments(adviserId, unique);
  const removed = await AvailabilityWindowModel.deleteForAdviser(
    adviserId,
    unique.map((a) => a.departmentId),
  );
  if (removed > 0) await syncAfterScheduleChange(adviserId);
  const inactive = unique.filter(
    (a) => !departmentOf(a.departmentId)?.isActive,
  ).length;
  await AdminActionLogModel.log(
    actorId,
    "Updated adviser mapping",
    `${adviser.name} → ${unique.length} department${unique.length === 1 ? "" : "s"}${inactive > 0 ? ` (${inactive} inactive)` : ""}`,
  );
  return { adviserId, assignments: unique };
}

export async function assignSelf(
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
    const holder = await clashHolderName(departmentId, requested, adviserId);
    if (!holder) continue;
    const department = departments.find((d) => String(d._id) === departmentId)!;
    const scope =
      requested.length > 0
        ? departmentLevelRangeLabel(requested)
        : "the whole department";
    throw new ApiError("CONFLICT", {
      message: `${deriveDepartmentCode(department.name)} — ${scope} is already served by ${holder}. Request a transfer to take it over.`,
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
