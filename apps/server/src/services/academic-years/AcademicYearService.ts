import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import {
  AcademicYearModel,
  type AcademicYearOption,
  type AcademicYearRow,
} from "../../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";

const NOT_FOUND = "Academic year not found.";

export type AcademicYearView = {
  id: string;
  label: string;
  semesterLabel: string;
  isActive: boolean;
  createdAt: string;
  hasData: boolean;
};

type OpenQueueStats = {
  current: AcademicYearRow | null;
  total: number;
  byDept: Array<{ name: string; count: number }>;
};

async function openQueueStats(targetYearId: string): Promise<OpenQueueStats> {
  const db = getDbSync();
  const current = await db
    .collection<AcademicYearRow>(COLLECTIONS.academicYear)
    .findOne({ isActive: true, _id: { $ne: targetYearId } } as never);
  if (!current) return { current: null, total: 0, byDept: [] };

  const rows = await db
    .collection<{ departmentId: string }>(COLLECTIONS.enrollmentQueue)
    .find(
      {
        academicYearId: String(current._id),
        status: { $in: ["WAITING", "IN_PROGRESS"] },
      } as never,
      { projection: { departmentId: 1 } },
    )
    .toArray();
  if (rows.length === 0) return { current, total: 0, byDept: [] };

  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.departmentId);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const departments = await db
    .collection<{ _id: string; name: string }>(COLLECTIONS.department)
    .find({ _id: { $in: [...counts.keys()] } } as never, {
      projection: { name: 1 },
    })
    .toArray();
  const nameById = new Map(departments.map((d) => [String(d._id), d.name]));
  const byDept = [...counts.entries()]
    .map(([id, count]) => ({
      name: nameById.get(id) ?? "Unknown department",
      count,
    }))
    .sort((a, b) => b.count - a.count);
  return { current, total: rows.length, byDept };
}

async function assertNoOpenQueues(targetYearId: string): Promise<void> {
  const { current, total, byDept } = await openQueueStats(targetYearId);
  if (total === 0) return;
  const where = byDept.map((d) => `${d.name} (${d.count})`).join(", ");
  throw new ApiError("CONFLICT", {
    message: `${current?.label ?? "The current academic year"} · ${current?.semesterLabel ?? ""} still has ${total} student${total === 1 ? "" : "s"} in line (${where}) — finish serving them before switching academic years.`,
  });
}

export class AcademicYearService {
  static async list(): Promise<AcademicYearView[]> {
    const db = getDbSync();
    const [years, verifications, queues, forms] = await Promise.all([
      AcademicYearModel.list(),
      db
        .collection<{ academicYearId: string }>(COLLECTIONS.stepVerification)
        .find({} as never, { projection: { academicYearId: 1 } })
        .toArray(),
      db
        .collection<{ academicYearId: string }>(COLLECTIONS.enrollmentQueue)
        .find({} as never, { projection: { academicYearId: 1 } })
        .toArray(),
      db
        .collection<{ academicYearId: string }>(COLLECTIONS.profilingForm)
        .find({} as never, { projection: { academicYearId: 1 } })
        .toArray(),
    ]);

    const withData = new Set(
      [...verifications, ...queues, ...forms].map((row) =>
        String(row.academicYearId),
      ),
    );
    return years.map((year) => ({
      id: String(year._id),
      label: year.label,
      semesterLabel: year.semesterLabel,
      isActive: year.isActive,
      createdAt: new Date(year.createdAt).toISOString(),
      hasData: withData.has(String(year._id)),
    }));
  }

  static async create(
    actorId: string,
    input: { label: string; semesterLabel: string; activate: boolean },
  ): Promise<{
    id: string;
    label: string;
    semesterLabel: string;
    isActive: boolean;
  }> {
    if (input.activate) await assertNoOpenQueues("");

    const row: AcademicYearRow = {
      _id: genId("ay"),
      label: input.label,
      semesterLabel: input.semesterLabel,
      isActive: input.activate,
      createdAt: new Date(),
    };
    await AcademicYearModel.insert(row);
    if (input.activate) await AcademicYearModel.deactivateAllExcept(row._id);
    await AdminActionLogModel.log(
      actorId,
      "Created academic year",
      `${input.label} · ${input.semesterLabel}`,
    );
    return {
      id: row._id,
      label: row.label,
      semesterLabel: row.semesterLabel,
      isActive: row.isActive,
    };
  }

  static async update(
    actorId: string,
    id: string,
    input: { label: string; semesterLabel: string },
  ): Promise<{ id: string; label: string; semesterLabel: string }> {
    const existing = await AcademicYearModel.findById(id);
    if (!existing) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });
    if (!existing.isActive) {
      throw new ApiError("FORBIDDEN", {
        message: "Only the current academic year can be edited.",
      });
    }

    await AcademicYearModel.update(id, input);
    await AdminActionLogModel.log(
      actorId,
      "Edited academic year",
      `${input.label} · ${input.semesterLabel}`,
    );
    return { id, label: input.label, semesterLabel: input.semesterLabel };
  }

  static async remove(actorId: string, id: string): Promise<{ id: string }> {
    const db = getDbSync();
    const existing = await AcademicYearModel.findById(id);
    if (!existing) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });

    const [verifications, queues, form] = await Promise.all([
      db
        .collection(COLLECTIONS.stepVerification)
        .countDocuments({ academicYearId: id } as never),
      db
        .collection(COLLECTIONS.enrollmentQueue)
        .countDocuments({ academicYearId: id } as never),
      db
        .collection(COLLECTIONS.profilingForm)
        .findOne({ academicYearId: id } as never, { projection: { _id: 1 } }),
    ]);
    if (verifications > 0 || queues > 0 || form) {
      throw new ApiError("CONFLICT", {
        message: "Cannot delete — contains records.",
      });
    }

    await AcademicYearModel.remove(id);
    await AdminActionLogModel.log(
      actorId,
      "Deleted academic year",
      `${existing.label} · ${existing.semesterLabel}`,
    );
    return { id };
  }

  static async activationStats(id: string): Promise<{
    currentYearLabel: string | null;
    studentsWithProgress: number;
    openQueueCount: number;
  }> {
    const db = getDbSync();
    const year = await AcademicYearModel.findById(id);
    if (!year) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });

    const { current, total } = await openQueueStats(String(year._id));
    const scopeYearId = current ? String(current._id) : id;
    const verifications = await db
      .collection<{ studentProfileId: string }>(COLLECTIONS.stepVerification)
      .find({ academicYearId: scopeYearId } as never, {
        projection: { studentProfileId: 1 },
      })
      .toArray();

    return {
      currentYearLabel: current
        ? `${current.label} · ${current.semesterLabel}`
        : null,
      studentsWithProgress: new Set(
        verifications.map((v) => String(v.studentProfileId)),
      ).size,
      openQueueCount: total,
    };
  }

  static async activate(
    actorId: string,
    id: string,
  ): Promise<{ id: string; label: string; semesterLabel: string }> {
    const year = await AcademicYearModel.findById(id);
    if (!year) throw new ApiError("NOT_FOUND", { message: NOT_FOUND });
    if (year.isActive) {
      return {
        id: String(year._id),
        label: year.label,
        semesterLabel: year.semesterLabel,
      };
    }

    await assertNoOpenQueues(id);
    await AcademicYearModel.deactivateAllExcept(id);
    await AcademicYearModel.activate(id);
    await AdminActionLogModel.log(
      actorId,
      "Activated academic year",
      `${year.label} · ${year.semesterLabel}`,
    );
    return {
      id: String(year._id),
      label: year.label,
      semesterLabel: year.semesterLabel,
    };
  }

  static async findActive(): Promise<AcademicYearRow | null> {
    return AcademicYearModel.findActive();
  }

  static async resolve(requestedId?: string): Promise<AcademicYearRow | null> {
    if (requestedId) return AcademicYearModel.findById(requestedId);
    return (await AcademicYearModel.findActive()) ?? AcademicYearModel.newest();
  }

  static async options(): Promise<AcademicYearOption[]> {
    return AcademicYearModel.options();
  }

  static async activeOrThrow(): Promise<AcademicYearRow> {
    const year = await AcademicYearModel.findActive();
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year — an admin must activate one first.",
      });
    }
    return year;
  }
}
