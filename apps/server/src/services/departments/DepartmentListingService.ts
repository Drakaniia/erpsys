import { normalizeYearLevels, type YearLevel } from "../../config/constants.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { UserModel } from "../../models/UserModel.js";
import { DepartmentService, type DepartmentView } from "./DepartmentService.js";

type OwnerEntry = {
  adviserId: string;
  adviserName: string;
  yearLevels: YearLevel[];
};

export type InstructorDepartmentView = DepartmentView & {
  assigned: boolean;
  assignedToName: string | null;
  assignedToId: string | null;
  myYearLevels: YearLevel[];
  owners: Array<{ adviserId: string; name: string; yearLevels: YearLevel[] }>;
  mappingCount?: number;
};

export class DepartmentListingService {
  static async listing(
    callerId: string,
    isAdmin: boolean,
  ): Promise<InstructorDepartmentView[]> {
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
        ...DepartmentService.toView(row),
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
}
