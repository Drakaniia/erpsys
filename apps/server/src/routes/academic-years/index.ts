import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync } from "../../lib/db/db.js";
import { genId } from "../../lib/db/ids.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import {
  okList,
  okOne,
  parseBody,
  parsePagination,
  parseQuery,
} from "../../middleware/http.js";
import {
  AcademicYearModel,
  type AcademicYearRow,
} from "../../models/AcademicYearModel.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";

/**
 * `/api/v1` — academic-year CRUD, plus the activation preview and commit.
 */
export const academicYearsRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const idParams = z.object({ id: z.string().min(1) });
const labels = {
  label: z.string().trim().min(1).max(30),
  semesterLabel: z.string().trim().min(1).max(30),
};

async function findOrThrow(id: string): Promise<AcademicYearRow> {
  const year = await AcademicYearModel.findById(id);
  if (!year) {
    throw new ApiError("NOT_FOUND", { message: "Academic year not found." });
  }
  return year;
}

async function openQueueStats(targetYearId: string) {
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
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.departmentId);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const departments = counts.size
    ? await db
        .collection<{ _id: string; name: string }>(COLLECTIONS.department)
        .find({ _id: { $in: [...counts.keys()] } } as never, {
          projection: { name: 1 },
        })
        .toArray()
    : [];
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

/**
 * `GET /api/v1/academic-years`
 * Access: session + admin surface.
 * Use: list every academic year (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
academicYearsRouter.get(
  "/academic-years",
  admin,
  catchAsync(async (req, res) => {
    const db = getDbSync();
    const [years, verifications, queues] = await Promise.all([
      AcademicYearModel.list(),
      db
        .collection<{ academicYearId: string }>(COLLECTIONS.stepVerification)
        .find({} as never, { projection: { academicYearId: 1 } })
        .toArray(),
      db
        .collection<{ academicYearId: string }>(COLLECTIONS.enrollmentQueue)
        .find({} as never, { projection: { academicYearId: 1 } })
        .toArray(),

    ]);
    const withData = new Set(
      [...verifications, ...queues].map((row) =>
        String(row.academicYearId),
      ),
    );
    const items = years.map((year) => ({
      id: String(year._id),
      label: year.label,
      semesterLabel: year.semesterLabel,
      isActive: year.isActive,
      createdAt: new Date(year.createdAt).toISOString(),
      hasData: withData.has(String(year._id)) || !!year.profilingForm,
    }));
    const { page, pageSize } = parsePagination(req);
    okList(res, items, page, pageSize, items.length);
  }),
);

/**
 * `POST /api/v1/academic-years`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: create a year — body `{ label, semesterLabel, activate? }`.
 * Returns: `201` with `{ data: year }`.
 */
academicYearsRouter.post(
  "/academic-years",
  admin,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({ ...labels, activate: z.boolean().default(false) }),
      req,
    );
    if (input.activate) await assertNoOpenQueues("");
    const now = new Date();
    const row: AcademicYearRow = {
      _id: genId("ay"),
      label: input.label,
      semesterLabel: input.semesterLabel,
      isActive: input.activate,
      createdAt: now,
      updatedAt: now,
    };
    await AcademicYearModel.insert(row);
    if (input.activate) await AcademicYearModel.deactivateAllExcept(row._id);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Created academic year",
      `${input.label} · ${input.semesterLabel}`,
    );
    okOne(
      res,
      {
        id: row._id,
        label: row.label,
        semesterLabel: row.semesterLabel,
        isActive: row.isActive,
      },
      201,
    );
  }),
);

/**
 * `PATCH /api/v1/academic-years/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: rename a year — body `{ label, semesterLabel }`.
 * Returns: `{ data: year }`.
 */
academicYearsRouter.patch(
  "/academic-years/:id",
  admin,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const input = parseBody(z.object(labels), req);
    if (!(await findOrThrow(id)).isActive) {
      throw new ApiError("FORBIDDEN", {
        message: "Only the current academic year can be edited.",
      });
    }
    await AcademicYearModel.update(id, input);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Edited academic year",
      `${input.label} · ${input.semesterLabel}`,
    );
    okOne(res, { id, label: input.label, semesterLabel: input.semesterLabel });
  }),
);

/**
 * `DELETE /api/v1/academic-years/:id`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete a year.
 * Returns: `{ data: year }`.
 */
academicYearsRouter.delete(
  "/academic-years/:id",
  admin,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const existing = await findOrThrow(id);
    const db = getDbSync();
    const [verifications, queues] = await Promise.all([
      db
        .collection(COLLECTIONS.stepVerification)
        .countDocuments({ academicYearId: id } as never),
      db
        .collection(COLLECTIONS.enrollmentQueue)
        .countDocuments({ academicYearId: id } as never),

    ]);
    if (verifications > 0 || queues > 0 || existing.profilingForm) {
      throw new ApiError("CONFLICT", {
        message: "Cannot delete — contains records.",
      });
    }
    await AcademicYearModel.remove(id);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Deleted academic year",
      `${existing.label} · ${existing.semesterLabel}`,
    );
    okOne(res, { id });
  }),
);

/**
 * `GET /api/v1/academic-years/:id/activation`
 * Access: session + admin surface.
 * Use: what activating this year would carry over.
 * Returns: `{ data: stats }`.
 */
academicYearsRouter.get(
  "/academic-years/:id/activation",
  admin,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const year = await findOrThrow(id);
    const { current, total } = await openQueueStats(String(year._id));
    const verifications = await getDbSync()
      .collection<{ studentProfileId: string }>(COLLECTIONS.stepVerification)
      .find({ academicYearId: current ? String(current._id) : id } as never, {
        projection: { studentProfileId: 1 },
      })
      .toArray();
    okOne(res, {
      currentYearLabel: current
        ? `${current.label} · ${current.semesterLabel}`
        : null,
      studentsWithProgress: new Set(
        verifications.map((v) => String(v.studentProfileId)),
      ).size,
      openQueueCount: total,
    });
  }),
);

/**
 * `POST /api/v1/academic-years/:id/activation`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: make this the active year.
 * Returns: `{ data: year }`.
 */
academicYearsRouter.post(
  "/academic-years/:id/activation",
  admin,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const year = await findOrThrow(id);
    if (!year.isActive) {
      await assertNoOpenQueues(id);
      await AcademicYearModel.deactivateAllExcept(id);
      await AcademicYearModel.activate(id);
      await AdminActionLogModel.log(
        sessionUser(req).id,
        "Activated academic year",
        `${year.label} · ${year.semesterLabel}`,
      );
    }
    okOne(res, {
      id: String(year._id),
      label: year.label,
      semesterLabel: year.semesterLabel,
    });
  }),
);
