import {
  departmentLevelRangeLabel,
  deriveDepartmentCode,
  normalizeYearLevels,
  type YearLevel,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { genId } from "../../lib/db/ids.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { CalendarSyncService } from "../calendar/CalendarSyncService.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { DepartmentService, type DepartmentView } from "./DepartmentService.js";

const NOT_FOUND = "Department not found.";
const IDENTITY_CONFLICT = "A department with that name or code already exists.";

export type DepartmentCreator = {
  callerId: string;
  isAdmin: boolean;
};

async function assertIdentityAvailable(
  name: string,
  excludeId?: string,
): Promise<void> {
  const trimmed = name.trim();
  const code = deriveDepartmentCode(trimmed);
  const rows = await DepartmentModel.listNames(excludeId);
  const clash = rows.find(
    (row) =>
      row.name.trim().toLowerCase() === trimmed.toLowerCase() ||
      deriveDepartmentCode(row.name) === code,
  );
  if (clash) throw new ApiError("CONFLICT", { message: IDENTITY_CONFLICT });
}

async function requireAssigned(
  callerId: string,
  isAdmin: boolean,
  departmentId: string,
  verb: string,
): Promise<void> {
  if (isAdmin) return;
  const link = await AdviserDepartmentModel.findLink(callerId, departmentId);
  if (!link) {
    throw new ApiError("FORBIDDEN", {
      message: `Only this department's adviser (or an admin) can ${verb} it.`,
    });
  }
}

const requireDepartment = async (id: string) => {
  const row = await DepartmentModel.findById(id);
  if (!row) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });
  return row;
};

export class DepartmentAdminService {
  static async create(
    caller: DepartmentCreator,
    name: string,
  ): Promise<DepartmentView & { assigned?: boolean }> {
    await assertIdentityAvailable(name);
    const id = genId("dept");
    await DepartmentModel.insert({
      _id: id,
      name,
      yearLevels: [],
      isActive: true,
    });

    if (caller.isAdmin) {
      const view = DepartmentService.toView({
        _id: id,
        name,
        yearLevels: [],
        isActive: true,
      });
      await AdminActionLogModel.log(
        caller.callerId,
        "Created department",
        `${view.code} — ${view.name}`,
      );
      return view;
    }

    const assigned =
      (await AdviserDepartmentModel.listForAdviser(caller.callerId)).length ===
      0;
    if (assigned) {
      await AdviserDepartmentModel.insert({
        _id: genId("adviser-dept"),
        adviserId: caller.callerId,
        departmentId: id,
        yearLevels: [],
      });
    }
    return {
      id,
      name,
      code: deriveDepartmentCode(name),
      yearLevels: [],
      isActive: true,
      assigned,
    };
  }

  static async update(
    caller: DepartmentCreator,
    input: { id: string; name?: string; isActive?: boolean },
  ): Promise<Record<string, unknown>> {
    let out: Record<string, unknown> = { id: input.id };

    if (input.name !== undefined) {
      await assertIdentityAvailable(input.name, input.id);
      const existing = await requireDepartment(input.id);
      await DepartmentModel.update(input.id, { name: input.name });
      const view = DepartmentService.toView({ ...existing, name: input.name });
      if (caller.isAdmin) {
        await AdminActionLogModel.log(
          caller.callerId,
          "Edited department",
          `${view.code} — ${view.name}`,
        );
      }
      out = { ...out, ...view };
    }

    if (input.isActive !== undefined) {
      if (!caller.isAdmin) {
        throw new ApiError("FORBIDDEN", {
          message: "Only an admin can change department status.",
        });
      }
      if (!input.isActive) {
        const inLine = await EnrollmentQueueModel.countInLine({
          departmentId: input.id,
          status: { $in: ["WAITING", "IN_PROGRESS"] },
        });
        if (inLine > 0) {
          throw new ApiError("CONFLICT", {
            message: "Close the queue first — dept has students still in line.",
          });
        }
      }
      const existing = await requireDepartment(input.id);
      await DepartmentModel.update(input.id, { isActive: input.isActive });
      await AdminActionLogModel.log(
        caller.callerId,
        input.isActive ? "Activated department" : "Deactivated department",
        deriveDepartmentCode(existing.name),
      );
      out = { ...out, id: input.id, isActive: input.isActive };
    }

    return out;
  }

  static async setYearLevels(
    caller: DepartmentCreator,
    departmentId: string,
    levels: YearLevel[],
  ): Promise<{ id: string; yearLevels: YearLevel[] }> {
    const existing = await requireDepartment(departmentId);
    await requireAssigned(
      caller.callerId,
      caller.isAdmin,
      departmentId,
      "edit",
    );
    const yearLevels = normalizeYearLevels(levels);
    await DepartmentModel.update(departmentId, { yearLevels });
    if (caller.isAdmin) {
      await AdminActionLogModel.log(
        caller.callerId,
        "Updated year levels",
        `${deriveDepartmentCode(existing.name)} — ${departmentLevelRangeLabel(yearLevels)}`,
      );
    }
    return { id: departmentId, yearLevels };
  }

  static async remove(
    caller: DepartmentCreator,
    departmentId: string,
  ): Promise<{ id: string; deleted: true }> {
    await requireDepartment(departmentId);
    await requireAssigned(
      caller.callerId,
      caller.isAdmin,
      departmentId,
      "delete",
    );
    const queued = await EnrollmentQueueModel.countInLine({ departmentId });
    if (queued > 0) {
      throw new ApiError("CONFLICT", {
        message: "Cannot delete a department with active queue entries.",
      });
    }
    await AdviserAvailabilityModel.deleteByDepartment(departmentId);
    await AdviserDepartmentModel.deleteByDepartment(departmentId);
    const scheduled =
      await AvailabilityWindowModel.deleteByDepartment(departmentId);
    await DepartmentModel.remove(departmentId);
    for (const adviserId of scheduled) {
      await CalendarSyncService.afterScheduleChange(adviserId);
    }
    return { id: departmentId, deleted: true };
  }
}
