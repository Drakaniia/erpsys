import type { Db } from "mongodb";
import { COLLECTIONS, type CollectionName } from "./db.js";

export type QueueEntryRef = {
  id: string;
  status: string;
  departmentId?: string | null;
  academicYearId?: string | null;
  studentProfileId?: string | null;
  servedById?: string | null;
  servedAt?: Date | string | null;
  joinedAt?: Date | string | null;
};

export type DuplicateStudentYear = {
  studentProfileId: string | null;
  academicYearId: string | null;
  entries: QueueEntryRef[];
};

export type DepartmentServingConflict = {
  departmentId: string | null;
  academicYearId: string | null;
  entries: QueueEntryRef[];
};

export type DuplicateStudentNumber = {
  studentNumber: string | null;
  profileIds: string[];
};

export type UnplaceableServingEntry = {
  entryId: string;
  studentProfileId: string | null;
  missing: ("departmentId" | "academicYearId")[];
};

export type DuplicateAuthKey = {
  collection: CollectionName;
  field: string;
  value: string | null;
  documentIds: string[];
};

export type QueueAuditReport = {
  duplicateStudentYearEntries: DuplicateStudentYear[];
  departmentServingConflicts: DepartmentServingConflict[];
  duplicateStudentNumbers: DuplicateStudentNumber[];
  unplaceableServingEntries: UnplaceableServingEntry[];
  duplicateAuthKeys: DuplicateAuthKey[];
  blockingCount: number;
  clean: boolean;
  blockingByCategory: Record<string, number>;
};

export function idOf(value: unknown): string {
  return String(value);
}

export function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "number") return value;
  return 0;
}

export function nullable(value: unknown): string | null {
  return value === null || value === undefined || value === ""
    ? null
    : idOf(value);
}

export function toEntryRef(raw: Record<string, unknown>): QueueEntryRef {
  return {
    id: idOf(raw["id"]),
    status: idOf(raw["status"] ?? "WAITING"),
    departmentId: nullable(raw["departmentId"]),
    academicYearId: nullable(raw["academicYearId"]),
    studentProfileId: nullable(raw["studentProfileId"]),
    servedById: nullable(raw["servedById"]),
    servedAt: (raw["servedAt"] as Date | string | null | undefined) ?? null,
    joinedAt: (raw["joinedAt"] as Date | string | null | undefined) ?? null,
  };
}

export function sortByJoinedAt(entries: QueueEntryRef[]): QueueEntryRef[] {
  return entries.sort((a, b) => {
    const delta = timeOf(a.joinedAt) - timeOf(b.joinedAt);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
}

export function sortByServedAt(entries: QueueEntryRef[]): QueueEntryRef[] {
  return entries.sort((a, b) => {
    const delta =
      timeOf(b.servedAt ?? b.joinedAt) - timeOf(a.servedAt ?? a.joinedAt);
    if (delta !== 0) return delta;
    return b.id.localeCompare(a.id);
  });
}

export async function auditQueueInvariants(db: Db): Promise<QueueAuditReport> {
  const queue = db.collection(COLLECTIONS.enrollmentQueue);
  const profiles = db.collection(COLLECTIONS.studentProfile);

  const [
    duplicateRows,
    servingRows,
    numberRows,
    unplaceableRows,
    emailRows,
    tokenRows,
  ] = await Promise.all([
    queue
      .aggregate([
        {
          $group: {
            _id: {
              studentProfileId: "$studentProfileId",
              academicYearId: "$academicYearId",
            },
            count: { $sum: 1 },
            entries: {
              $push: {
                id: "$_id",
                status: "$status",
                departmentId: "$departmentId",
                academicYearId: "$academicYearId",
                studentProfileId: "$studentProfileId",
                servedById: "$servedById",
                servedAt: "$servedAt",
                joinedAt: "$joinedAt",
              },
            },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { "_id.studentProfileId": 1, "_id.academicYearId": 1 } },
      ])
      .toArray(),
    queue
      .aggregate([
        { $match: { status: "IN_PROGRESS" } },
        {
          $group: {
            _id: {
              departmentId: "$departmentId",
              academicYearId: "$academicYearId",
            },
            count: { $sum: 1 },
            entries: {
              $push: {
                id: "$_id",
                status: "$status",
                departmentId: "$departmentId",
                academicYearId: "$academicYearId",
                studentProfileId: "$studentProfileId",
                servedById: "$servedById",
                servedAt: "$servedAt",
                joinedAt: "$joinedAt",
              },
            },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { "_id.departmentId": 1, "_id.academicYearId": 1 } },
      ])
      .toArray(),
    profiles
      .aggregate([
        {
          $group: {
            _id: { $ifNull: ["$studentNumber", null] },
            count: { $sum: 1 },
            profileIds: { $push: "$_id" },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    queue
      .find({
        status: "IN_PROGRESS",
        $or: [
          { departmentId: { $in: [null, ""] } },
          { academicYearId: { $in: [null, ""] } },
        ],
      } as never)
      .toArray(),
    db
      .collection(COLLECTIONS.user)
      .aggregate([
        {
          $group: { _id: "$email", count: { $sum: 1 }, ids: { $push: "$_id" } },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray(),
    db
      .collection(COLLECTIONS.session)
      .aggregate([
        {
          $group: { _id: "$token", count: { $sum: 1 }, ids: { $push: "$_id" } },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray(),
  ]);

  const duplicateStudentYearEntries: DuplicateStudentYear[] = duplicateRows.map(
    (row) => {
      const key = row._id as {
        studentProfileId?: unknown;
        academicYearId?: unknown;
      };
      return {
        studentProfileId: nullable(key.studentProfileId),
        academicYearId: nullable(key.academicYearId),
        entries: sortByJoinedAt(
          ((row.entries as Record<string, unknown>[] | undefined) ?? []).map(
            toEntryRef,
          ),
        ),
      };
    },
  );

  const departmentServingConflicts: DepartmentServingConflict[] =
    servingRows.map((row) => {
      const key = row._id as {
        departmentId?: unknown;
        academicYearId?: unknown;
      };
      return {
        departmentId: nullable(key.departmentId),
        academicYearId: nullable(key.academicYearId),
        entries: sortByServedAt(
          ((row.entries as Record<string, unknown>[] | undefined) ?? []).map(
            toEntryRef,
          ),
        ),
      };
    });

  const duplicateStudentNumbers: DuplicateStudentNumber[] = numberRows.map(
    (row) => ({
      studentNumber: nullable(row._id),
      profileIds: ((row.profileIds as unknown[] | undefined) ?? []).map(idOf),
    }),
  );

  const unplaceableServingEntries: UnplaceableServingEntry[] = (
    unplaceableRows as unknown as Record<string, unknown>[]
  ).map((row) => {
    const missing: ("departmentId" | "academicYearId")[] = [];
    if (nullable(row["departmentId"]) === null) missing.push("departmentId");
    if (nullable(row["academicYearId"]) === null)
      missing.push("academicYearId");
    return {
      entryId: idOf(row["_id"]),
      studentProfileId: nullable(row["studentProfileId"]),
      missing,
    };
  });

  const duplicateAuthKeys: DuplicateAuthKey[] = [
    ...emailRows.map((row) => ({
      collection: COLLECTIONS.user,
      field: "email",
      value: nullable(row._id),
      documentIds: ((row.ids as unknown[] | undefined) ?? []).map(idOf),
    })),
    ...tokenRows.map((row) => ({
      collection: COLLECTIONS.session,
      field: "token",
      value: nullable(row._id),
      documentIds: ((row.ids as unknown[] | undefined) ?? []).map(idOf),
    })),
  ];

  const blockingByCategory: Record<string, number> = {
    duplicateStudentYearEntries: duplicateStudentYearEntries.length,
    departmentServingConflicts: departmentServingConflicts.length,
    duplicateStudentNumbers: duplicateStudentNumbers.length,
    unplaceableServingEntries: unplaceableServingEntries.length,
    duplicateAuthKeys: duplicateAuthKeys.length,
  };
  const blockingCount = Object.values(blockingByCategory).reduce(
    (total, count) => total + count,
    0,
  );

  return {
    duplicateStudentYearEntries,
    departmentServingConflicts,
    duplicateStudentNumbers,
    unplaceableServingEntries,
    duplicateAuthKeys,
    blockingCount,
    clean: blockingCount === 0,
    blockingByCategory,
  };
}

export function formatQueueAuditReport(report: QueueAuditReport): string {
  const lines: string[] = [];
  lines.push(
    report.clean
      ? "auditQueueInvariants: clean — no blocking violations."
      : `auditQueueInvariants: ${report.blockingCount} blocking violation(s).`,
  );
  const describe = (
    label: string,
    items: unknown[],
    render: (item: never) => string,
  ) => {
    if (items.length === 0) return;
    lines.push(`  ${label}: ${items.length}`);
    for (const item of items.slice(0, 20)) {
      lines.push(`    - ${render(item as never)}`);
    }
    if (items.length > 20) lines.push(`    ... and ${items.length - 20} more`);
  };

  describe(
    "duplicate (studentProfileId, academicYearId) queue entries",
    report.duplicateStudentYearEntries,
    (item: DuplicateStudentYear) =>
      `student=${item.studentProfileId ?? "(missing)"} year=${item.academicYearId ?? "(missing)"} entries=[${item.entries.map((e) => `${e.id}:${e.status}`).join(", ")}]`,
  );
  describe(
    "departments with more than one IN_PROGRESS row",
    report.departmentServingConflicts,
    (item: DepartmentServingConflict) =>
      `department=${item.departmentId ?? "(missing)"} year=${item.academicYearId ?? "(missing)"} entries=[${item.entries.map((e) => `${e.id}:servedBy=${e.servedById ?? "none"}`).join(", ")}]`,
  );
  describe(
    "duplicate studentNumber values",
    report.duplicateStudentNumbers,
    (item: DuplicateStudentNumber) =>
      `studentNumber=${item.studentNumber ?? "(missing)"} profiles=[${item.profileIds.join(", ")}]`,
  );
  describe(
    "IN_PROGRESS rows missing a partial-index key field",
    report.unplaceableServingEntries,
    (item: UnplaceableServingEntry) =>
      `entry=${item.entryId} student=${item.studentProfileId ?? "(missing)"} missing=[${item.missing.join(", ")}]`,
  );
  describe(
    "duplicate auth keys",
    report.duplicateAuthKeys,
    (item: DuplicateAuthKey) =>
      `${item.collection}.${item.field}=${item.value ?? "(missing)"} documents=[${item.documentIds.join(", ")}]`,
  );
  return lines.join("\n");
}
