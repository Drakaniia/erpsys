import type { WindowKind } from "../config/schedule.js";
import { COLLECTIONS, getDbSync, refIn } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

export type AvailabilityWindowRow = {
  _id: string;
  adviserId: string;
  departmentId: string;
  academicYearId: string;
  kind: WindowKind;
  weekday?: number;
  date?: string;
  startMinute?: number;
  endMinute?: number;
  createdAt: Date;
};

export type WindowInput = Pick<
  AvailabilityWindowRow,
  "kind" | "weekday" | "date" | "startMinute" | "endMinute"
>;

const windows = () =>
  getDbSync().collection<AvailabilityWindowRow>(COLLECTIONS.availabilityWindow);

export class AvailabilityWindowModel {
  static async listForAdviser(
    adviserId: string,
    academicYearId: string,
  ): Promise<AvailabilityWindowRow[]> {
    return windows()
      .find({ adviserId, academicYearId } as never)
      .toArray();
  }

  static async listForAdviserDepartment(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityWindowRow[]> {
    return windows()
      .find({ adviserId, departmentId, academicYearId } as never)
      .toArray();
  }

  static async listByDepartment(
    departmentId: string,
    academicYearId: string,
  ): Promise<AvailabilityWindowRow[]> {
    return windows()
      .find({ departmentId, academicYearId } as never)
      .toArray();
  }

  static async replace(
    adviserId: string,
    departmentId: string,
    academicYearId: string,
    rows: WindowInput[],
  ): Promise<void> {
    await windows().deleteMany({
      adviserId,
      departmentId,
      academicYearId,
    } as never);
    if (rows.length === 0) return;
    const now = new Date();
    await windows().insertMany(
      rows.map((row) => ({
        ...row,
        _id: genId("window"),
        adviserId,
        departmentId,
        academicYearId,
        createdAt: now,
      })) as never,
    );
  }

  static async deleteForAdviser(
    adviserId: string,
    keepDepartmentIds: string[] = [],
  ): Promise<number> {
    const result = await windows().deleteMany({
      adviserId: refIn([adviserId]),
      departmentId: { $nin: keepDepartmentIds },
    } as never);
    return result.deletedCount ?? 0;
  }

  static async deleteByDepartment(departmentId: string): Promise<string[]> {
    const rows = await windows()
      .find({ departmentId } as never)
      .toArray();
    await windows().deleteMany({ departmentId } as never);
    return [...new Set(rows.map((row) => row.adviserId))];
  }

  static async deleteStaleYears(activeYearId: string): Promise<string[]> {
    const rows = await windows()
      .find({ academicYearId: { $ne: activeYearId } } as never)
      .toArray();
    if (rows.length === 0) return [];
    await windows().deleteMany({
      academicYearId: { $ne: activeYearId },
    } as never);
    return [...new Set(rows.map((row) => row.adviserId))];
  }
}
