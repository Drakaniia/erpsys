import { COLLECTIONS, getDbSync, idIn, refIn } from "../lib/db/db.js";
import {
  normalizeYearLevels,
  yearLevelsOverlap,
  subtractYearLevels,
  YEAR_LEVELS,
  type YearLevel,
} from "../config/constants.js";
import { ApiError } from "../config/errors.js";

export type DepartmentAdviser = {
  _id?: string;
  adviserId: string;
  yearLevels?: YearLevel[];
  createdAt?: Date | null;
  updatedAt?: Date | null;
  readTs?: number;
  writeTs?: number;
};

export type AdviserAssignmentRow = DepartmentAdviser & { departmentId: string };

function assignmentsOf(department: DepartmentRow): AdviserAssignmentRow[] {
  return (department.advisers ?? []).map((adviser) => ({
    ...adviser,
    adviserId: String(adviser.adviserId),
    departmentId: String(department._id),
  }));
}

export type DepartmentRow = {
  _id: string;
  name: string;
  isActive: boolean;
  yearLevels?: YearLevel[];
  advisers?: DepartmentAdviser[];
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export class DepartmentModel {
  static async listAdvisersByDepartment(
    departmentId: string,
  ): Promise<AdviserAssignmentRow[]> {
    const department = await this.findById(departmentId);
    return department ? assignmentsOf(department) : [];
  }

  static async listForAdviserChanges(
    adviserId: string,
    departmentIds: string[],
  ): Promise<DepartmentRow[]> {
    const departments = await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({
        $or: [
          { advisers: { $elemMatch: { adviserId: refIn([adviserId]) } } },
          idIn(departmentIds),
        ],
      } as never)
      .toArray();
    return departments;
  }

  static async findAdviserLink(
    adviserId: string,
    departmentId: string,
  ): Promise<AdviserAssignmentRow | null> {
    return (
      (await this.listAdvisersByDepartment(departmentId)).find(
        (row) => row.adviserId === adviserId,
      ) ?? null
    );
  }

  static async listOtherAdviserHolders(
    departmentId: string,
    adviserId: string,
  ): Promise<AdviserAssignmentRow[]> {
    return (await this.listAdvisersByDepartment(departmentId)).filter(
      (row) => row.adviserId !== adviserId,
    );
  }

  static async listAssignmentsForAdviser(
    adviserId: string,
  ): Promise<AdviserAssignmentRow[]> {
    const departments = await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({
        advisers: { $elemMatch: { adviserId: refIn([adviserId]) } },
      } as never)
      .toArray();
    return departments
      .flatMap(assignmentsOf)
      .filter((row) => row.adviserId === adviserId);
  }

  static async listAllAdviserAssignments(): Promise<AdviserAssignmentRow[]> {
    return (await this.listAll()).flatMap(assignmentsOf);
  }

  static async insertAdviser(row: AdviserAssignmentRow): Promise<void> {
    const { departmentId, ...adviser } = row;
    await this.changeAdvisers(departmentId, (current) => {
      if (
        current.some(
          (holder) => String(holder.adviserId) === String(adviser.adviserId),
        )
      ) {
        throw new ApiError("CONFLICT", {
          message: "This adviser is already assigned.",
        });
      }
      const now = new Date();
      return [
        ...current,
        {
          ...adviser,
          yearLevels: normalizeYearLevels(adviser.yearLevels ?? []),
          createdAt: adviser.createdAt ?? now,
          updatedAt: now,
        },
      ];
    });
  }

  static async setAdviserLevels(
    adviserId: string,
    departmentId: string,
    yearLevels: YearLevel[],
  ): Promise<void> {
    await this.changeAdvisers(departmentId, (current) =>
      current.map((holder) =>
        String(holder.adviserId) === adviserId
          ? {
              ...holder,
              yearLevels: normalizeYearLevels(yearLevels),
              updatedAt: new Date(),
            }
          : holder,
      ),
    );
  }

  static async deleteAdviser(
    adviserId: string,
    departmentId: string,
  ): Promise<void> {
    await this.changeAdvisers(departmentId, (current) =>
      current.filter((holder) => String(holder.adviserId) !== adviserId),
    );
  }

  static async deleteOtherAdviserAssignments(
    adviserId: string,
    keepDepartmentId: string,
  ): Promise<void> {
    const links = await this.listAssignmentsForAdviser(adviserId);
    for (const link of links)
      if (link.departmentId !== keepDepartmentId)
        await this.deleteAdviser(adviserId, link.departmentId);
  }

  static async deleteAssignmentsForAdviser(adviserId: string): Promise<void> {
    const links = await this.listAssignmentsForAdviser(adviserId);
    for (const link of links)
      await this.deleteAdviser(adviserId, link.departmentId);
  }

  static async deleteAdvisersByDepartment(departmentId: string): Promise<void> {
    await this.changeAdvisers(departmentId, () => []);
  }

  static async transferAdviserLevels(
    departmentId: string,
    adviser: DepartmentAdviser,
    requested: YearLevel[],
    expectedOwnerId: string | null,
  ): Promise<void> {
    await this.changeAdvisers(departmentId, (current) => {
      const holders = current.filter(
        (holder) =>
          String(holder.adviserId) !== String(adviser.adviserId) &&
          yearLevelsOverlap(holder.yearLevels ?? [], requested),
      );
      if (
        holders.length > 1 ||
        (holders[0] ? String(holders[0].adviserId) : null) !== expectedOwnerId
      ) {
        throw new ApiError("CONFLICT", {
          message: "Department assignments changed. Reload and try again.",
        });
      }
      const now = new Date();
      const mine = current.find(
        (holder) => String(holder.adviserId) === String(adviser.adviserId),
      );
      const next = current.flatMap((holder) => {
        if (String(holder.adviserId) === String(adviser.adviserId)) return [];
        if (String(holder.adviserId) !== expectedOwnerId) return [holder];
        const remaining =
          requested.length === 0
            ? []
            : subtractYearLevels(
                holder.yearLevels?.length ? holder.yearLevels : YEAR_LEVELS,
                requested,
              );
        return remaining.length
          ? [{ ...holder, yearLevels: remaining, updatedAt: now }]
          : [];
      });
      const yearLevels =
        requested.length === 0 || (mine && !mine.yearLevels?.length)
          ? []
          : normalizeYearLevels([...(mine?.yearLevels ?? []), ...requested]);
      return [
        ...next,
        {
          ...(mine ?? adviser),
          yearLevels,
          createdAt: mine?.createdAt ?? adviser.createdAt ?? now,
          updatedAt: now,
        },
      ];
    });
  }

  static async replaceAdviserAssignments(
    adviserId: string,
    assignments: Array<{ departmentId: string; yearLevels: YearLevel[] }>,
    departments: DepartmentRow[],
  ): Promise<void> {
    for (const department of departments) {
      const next = assignments.find(
        (row) => row.departmentId === String(department._id),
      );
      const existing = department.advisers?.find(
        (row) => String(row.adviserId) === adviserId,
      );
      if (!existing && !next) continue;

      await this.changeAdvisers(
        String(department._id),
        (current) => {
          const mine = current.find(
            (row) => String(row.adviserId) === adviserId,
          );
          const others = current.filter(
            (row) => String(row.adviserId) !== adviserId,
          );
          if (!next) return others;
          const now = new Date();
          return [
            ...others,
            {
              ...(mine ?? { adviserId, createdAt: now }),
              yearLevels: normalizeYearLevels(next.yearLevels),
              updatedAt: now,
            },
          ];
        },
        department,
      );
    }
  }

  private static async changeAdvisers(
    departmentId: string,
    change: (current: DepartmentAdviser[]) => DepartmentAdviser[],
    initial?: DepartmentRow,
  ): Promise<void> {
    const collection = getDbSync().collection<DepartmentRow>(
      COLLECTIONS.department,
    );
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const department =
        attempt === 0 && initial ? initial : await this.findById(departmentId);
      if (!department)
        throw new ApiError("NOT_FOUND", { message: "Department not found." });
      const next = change(department.advisers ?? []);
      for (let i = 0; i < next.length; i += 1) {
        if (
          next
            .slice(i + 1)
            .some(
              (other) =>
                String(other.adviserId) === String(next[i].adviserId) ||
                yearLevelsOverlap(
                  other.yearLevels ?? [],
                  next[i].yearLevels ?? [],
                ),
            )
        ) {
          throw new ApiError("CONFLICT", {
            message:
              "Those year levels are already assigned to another instructor.",
          });
        }
      }
      const result = await collection.updateOne(
        {
          ...idIn([departmentId]),
          advisers: department.advisers ?? { $exists: false },
        } as never,
        { $set: { advisers: next } } as never,
      );
      if (result.matchedCount) return;
    }
    throw new ApiError("CONFLICT", {
      message: "Department assignments changed. Reload and try again.",
    });
  }

  static async findById(id: string): Promise<DepartmentRow | null> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .findOne(idIn([id]) as never);
  }

  static async findByIds(ids: string[]): Promise<DepartmentRow[]> {
    if (ids.length === 0) return [];
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find(idIn([...new Set(ids)]) as never)
      .toArray();
  }

  static async listIds(): Promise<Array<{ _id: string }>> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({} as never, { projection: { _id: 1 } })
      .toArray();
  }

  static async listActive(): Promise<DepartmentRow[]> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({ isActive: true } as never)
      .sort({ name: 1 })
      .toArray();
  }

  static async listAll(): Promise<DepartmentRow[]> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find({} as never)
      .sort({ name: 1 })
      .toArray();
  }

  static async listNames(
    excludeId?: string,
  ): Promise<Array<{ _id: string; name: string }>> {
    return getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .find((excludeId ? { _id: { $ne: excludeId } } : {}) as never, {
        projection: { _id: 1, name: 1 },
      })
      .toArray();
  }

  static async insert(row: DepartmentRow): Promise<void> {
    await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .insertOne(row as never);
  }

  static async update(
    id: string,
    patch: Partial<Pick<DepartmentRow, "name" | "isActive" | "yearLevels">>,
  ): Promise<void> {
    await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .updateOne(idIn([id]) as never, { $set: patch } as never);
  }

  static async remove(id: string): Promise<void> {
    await getDbSync()
      .collection<DepartmentRow>(COLLECTIONS.department)
      .deleteOne(idIn([id]) as never);
  }
}
