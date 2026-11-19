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

import { AdminActionLogModel } from "../models/AdminActionLogModel.js";
import { AdviserScheduleModel } from "../models/AdviserScheduleModel.js";
import { DepartmentModel, type DepartmentRow, type AdviserAssignmentRow } from "../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { UserModel } from "../models/UserModel.js";
import { syncAfterScheduleChange } from "./calendar.js";

type Assignment = { departmentId: string; yearLevels: YearLevel[] };


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
  holders: AdviserAssignmentRow[],
  departmentId: string,
  levels: YearLevel[],
  adviserId: string,
): Promise<string | null> {
  const clash = holders.find(
    (holder) =>
      holder.departmentId === departmentId &&
      holder.adviserId !== adviserId &&
      yearLevelsOverlap(holder.yearLevels ?? [], levels),
  );
  if (!clash) return null;
  const [user] = await UserModel.findByIds([clash.adviserId]);
  return user?.name?.trim() || "An instructor";
}

async function writeAssignments(
  adviserId: string,
  assignments: Assignment[],
  previous: AdviserAssignmentRow[],
  departments: DepartmentRow[],
): Promise<void> {
  const keep = assignments.map((a) => a.departmentId);
  const removed = previous.filter((link) => !keep.includes(link.departmentId));
  const unchanged = previous.filter((link) =>
    assignments.some(
      (next) =>
        next.departmentId === link.departmentId &&
        JSON.stringify(normalizeYearLevels(link.yearLevels ?? [])) ===
          JSON.stringify(next.yearLevels),
    ),
  );
  if (removed.length > 0)
    await AdviserScheduleModel.closeOpenForAdviser(adviserId, keep);
  if (removed.length > 0 || unchanged.length !== previous.length) {
    await EnrollmentQueueModel.releaseServingExcept(
      adviserId,
      unchanged.map((link) => link.departmentId),
    );
  }
  await DepartmentModel.replaceAdviserAssignments(adviserId, assignments, departments);
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

  const departments = await DepartmentModel.listForAdviserChanges(adviserId, unique.map(row => row.departmentId));
  if (unique.some(row => !departments.some(department => String(department._id) === row.departmentId))) {
    throw new ApiError("NOT_FOUND", { message: "One or more departments don't exist." });
  }
  const holders = departments.flatMap(department => (department.advisers ?? []).map(holder => ({ ...holder, adviserId: String(holder.adviserId), departmentId: String(department._id) })));
  const previous = holders.filter((holder) => holder.adviserId === adviserId);
  const departmentOf = (id: string) =>
    departments.find((d) => String(d._id) === id);
  for (const assignment of unique) {
    const department = departmentOf(assignment.departmentId)!;
    assertLevelsOffered(department, assignment.yearLevels);
    const holder = await clashHolderName(
      holders,
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

  await writeAssignments(adviserId, unique, previous, departments);
  const removed = await AdviserScheduleModel.deleteWindowsForAdviser(
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
  const allDepartments = await DepartmentModel.listForAdviserChanges(adviserId, departmentIds);
  const departments = allDepartments.filter(department => departmentIds.includes(String(department._id)));
  if (departments.length !== departmentIds.length) {
    throw new ApiError("NOT_FOUND", { message: "One or more departments don't exist." });
  }
  const holders = allDepartments.flatMap(department => (department.advisers ?? []).map(holder => ({ ...holder, adviserId: String(holder.adviserId), departmentId: String(department._id) })));
  const previous = holders.filter((holder) => holder.adviserId === adviserId);

  if (departments.some((dept) => !dept.isActive)) {
    throw new ApiError("CONFLICT", {
      message: "Deactivated departments can't be assigned.",
    });
  }
  for (const department of departments) {
    assertLevelsOffered(department, requested);
  }
  for (const departmentId of departmentIds) {
    const holder = await clashHolderName(
      holders,
      departmentId,
      requested,
      adviserId,
    );
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
    previous,
    allDepartments,
  );
  return {
    departmentIds,
    yearLevels: departmentIds.length > 0 ? requested : [],
  };
}
