import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import {
  departmentLevelRangeLabel,
  deriveDepartmentCode,
  normalizeYearLevels,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
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
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AvailabilityWindowModel } from "../../models/AvailabilityWindowModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { activeYearOrThrow } from "../../services/academic-years.js";
import { assignSelf } from "../../services/advisers.js";
import { syncAfterScheduleChange } from "../../services/calendar.js";
import {
  departmentListing,
  departmentView,
  enrollmentRegister,
  myDepartment,
} from "../../services/departments.js";

/**
 * `/api/v1` — `/me/departments` in both verbs, then the instructor/admin
 * department CRUD and register.
 */
export const departmentsRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];
const managers: RequestHandler[] = [
  requireSession,
  (req, res, next) => {
    const surface = sessionUser(req).role === "ADMIN" ? "admin" : "instructor";
    requireSurface(surface)(req, res, next);
  },
];

const idParams = z.object({ id: z.string().min(1) });
const yearLevels = z
  .array(z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]))
  .max(5);

function caller(req: Request) {
  const user = sessionUser(req);
  return { callerId: user.id, isAdmin: user.role === "ADMIN" };
}

async function assertIdentityAvailable(
  name: string,
  excludeId?: string,
): Promise<void> {
  const trimmed = name.trim();
  const code = deriveDepartmentCode(trimmed);
  const clash = (await DepartmentModel.listNames(excludeId)).find(
    (row) =>
      row.name.trim().toLowerCase() === trimmed.toLowerCase() ||
      deriveDepartmentCode(row.name) === code,
  );
  if (clash) {
    throw new ApiError("CONFLICT", {
      message: "A department with that name or code already exists.",
    });
  }
}

async function requireDepartment(id: string) {
  const row = await DepartmentModel.findById(id);
  if (!row)
    throw new ApiError("NOT_FOUND", { message: "Department not found." });
  return row;
}

async function requireAssigned(
  { callerId, isAdmin }: { callerId: string; isAdmin: boolean },
  departmentId: string,
  verb: string,
): Promise<void> {
  if (isAdmin) return;
  if (!(await AdviserDepartmentModel.findLink(callerId, departmentId))) {
    throw new ApiError("FORBIDDEN", {
      message: `Only this department's adviser (or an admin) can ${verb} it.`,
    });
  }
}

/**
 * `GET /api/v1/me/departments`
 * Access: session + student surface.
 * Use: the student's department today, or null, with its posted office-hour
 * `schedule` (`{ current, next }`).
 * Returns: `{ data: department | null }`.
 */
departmentsRouter.get(
  "/me/departments",
  requireSession,
  requireSurface("student"),
  catchAsync(async (req, res) => {
    okOne(res, await myDepartment(sessionUser(req).id));
  }),
);

/**
 * `PUT /api/v1/me/departments`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: claim one department outright — body `{ departmentIds, yearLevels? }`.
 * Returns: `{ data: assignment }`.
 */
departmentsRouter.put(
  "/me/departments",
  instructor,
  catchAsync(async (req, res) => {
    const userId = sessionUser(req).id;
    const input = parseBody(
      z.object({
        departmentIds: z.array(z.string().min(1)).max(1),
        yearLevels: yearLevels.default([]),
      }),
      req,
    );
    okOne(res, await assignSelf(userId, input));
  }),
);

/**
 * `GET /api/v1/departments`
 * Access: session + instructor or admin surface.
 * Use: every department with who holds it; an admin sees all, an instructor
 * their own (query `page`, `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
departmentsRouter.get(
  "/departments",
  managers,
  catchAsync(async (req, res) => {
    const { callerId, isAdmin } = caller(req);
    const rows = await departmentListing(callerId, isAdmin);
    const { page, pageSize } = parsePagination(req);
    okList(
      res,
      rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      rows.length,
    );
  }),
);

/**
 * `POST /api/v1/departments`
 * Access: session + instructor or admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: create one — body `{ name }`; an instructor holding none takes it.
 * Returns: `201` with `{ data: department }`.
 */
departmentsRouter.post(
  "/departments",
  managers,
  catchAsync(async (req, res) => {
    const { name } = parseBody(
      z.object({ name: z.string().trim().min(1).max(120) }),
      req,
    );
    const { callerId, isAdmin } = caller(req);
    await assertIdentityAvailable(name);
    const row = { _id: genId("dept"), name, yearLevels: [], isActive: true };
    await DepartmentModel.insert(row);
    const view = departmentView(row);

    if (isAdmin) {
      await AdminActionLogModel.log(
        callerId,
        "Created department",
        `${view.code} — ${view.name}`,
      );
      return okOne(res, view, 201);
    }
    const assigned =
      (await AdviserDepartmentModel.listForAdviser(callerId)).length === 0;
    if (assigned) {
      await AdviserDepartmentModel.insert({
        _id: genId("adviser-dept"),
        adviserId: callerId,
        departmentId: row._id,
        yearLevels: [],
      });
    }
    okOne(res, { ...view, assigned }, 201);
  }),
);

/**
 * `PATCH /api/v1/departments/:id`
 * Access: session + instructor or admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: rename an assigned department (admins may edit any), or admin-only deactivate — body `{ name?, isActive? }`.
 * Returns: `{ data: department }`.
 */
departmentsRouter.patch(
  "/departments/:id",
  managers,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const input = parseBody(
      z
        .object({
          name: z.string().trim().min(1).max(120).optional(),
          isActive: z.boolean().optional(),
        })
        .refine((v) => v.name !== undefined || v.isActive !== undefined, {
          message: "Nothing to update.",
        }),
      req,
    );
    const { callerId, isAdmin } = caller(req);
    await requireDepartment(id);
    if (input.isActive !== undefined && !isAdmin) {
      throw new ApiError("FORBIDDEN", {
        message: "Only an admin can change department status.",
      });
    }
    if (input.name !== undefined)
      await requireAssigned({ callerId, isAdmin }, id, "edit");
    if (
      input.isActive === false &&
      (await EnrollmentQueueModel.countInLine({
        departmentId: id,
        status: { $in: ["WAITING", "IN_PROGRESS"] },
      })) > 0
    ) {
      throw new ApiError("CONFLICT", {
        message: "Close the queue first — dept has students still in line.",
      });
    }
    let out: Record<string, unknown> = { id };

    if (input.name !== undefined) {
      await assertIdentityAvailable(input.name, id);
      const existing = await requireDepartment(id);
      await DepartmentModel.update(id, { name: input.name });
      const view = departmentView({ ...existing, name: input.name });
      if (isAdmin) {
        await AdminActionLogModel.log(
          callerId,
          "Edited department",
          `${view.code} — ${view.name}`,
        );
      }
      out = { ...out, ...view };
    }

    if (input.isActive !== undefined) {
      const existing = await requireDepartment(id);
      await DepartmentModel.update(id, { isActive: input.isActive });
      await AdminActionLogModel.log(
        callerId,
        input.isActive ? "Activated department" : "Deactivated department",
        deriveDepartmentCode(existing.name),
      );
      out = { ...out, id, isActive: input.isActive };
    }

    okOne(res, out);
  }),
);

/**
 * `PUT /api/v1/departments/:id/year-levels`
 * Access: session + instructor or admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set the year levels it serves — body `{ yearLevels }`.
 * Returns: `{ data: department }`.
 */
departmentsRouter.put(
  "/departments/:id/year-levels",
  managers,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    const body = parseBody(z.object({ yearLevels }), req);
    const who = caller(req);
    const existing = await requireDepartment(id);
    await requireAssigned(who, id, "edit");
    const levels = normalizeYearLevels(body.yearLevels);
    await DepartmentModel.update(id, { yearLevels: levels });
    if (who.isAdmin) {
      await AdminActionLogModel.log(
        who.callerId,
        "Updated year levels",
        `${deriveDepartmentCode(existing.name)} — ${departmentLevelRangeLabel(levels)}`,
      );
    }
    okOne(res, { id, yearLevels: levels });
  }),
);

/**
 * `DELETE /api/v1/departments/:id`
 * Access: session + instructor or admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: delete it, only when nothing is queued in it.
 * Returns: `{ data: department }`.
 */
departmentsRouter.delete(
  "/departments/:id",
  managers,
  catchAsync(async (req, res) => {
    const { id } = parseQuery(idParams, req);
    await requireDepartment(id);
    await requireAssigned(caller(req), id, "delete");
    if ((await EnrollmentQueueModel.countInLine({ departmentId: id })) > 0) {
      throw new ApiError("CONFLICT", {
        message: "Cannot delete a department with active queue entries.",
      });
    }
    await AdviserAvailabilityModel.deleteByDepartment(id);
    await AdviserDepartmentModel.deleteByDepartment(id);
    const scheduled = await AvailabilityWindowModel.deleteByDepartment(id);
    await DepartmentModel.remove(id);
    for (const adviserId of scheduled) {
      await syncAfterScheduleChange(adviserId);
    }
    okOne(res, { id, deleted: true });
  }),
);

/**
 * `GET /api/v1/departments/:id/enrollments`
 * Access: session + instructor surface.
 * Use: completed-enrollment register (query `range`, `q`, `cursor`, `limit`);
 * the next cursor comes back in the `X-Next-Cursor` header.
 * Returns: `{ data, page: 1, pageSize: limit, total }`.
 */
departmentsRouter.get(
  "/departments/:id/enrollments",
  instructor,
  catchAsync(async (req, res) => {
    const params = parseQuery(
      z.object({
        id: z.string().min(1),
        range: z.enum(["today", "ay", "all"]).default("ay"),
        q: z.string().max(100).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(50),
      }),
      req,
    );
    const year = await activeYearOrThrow();
    const page = await enrollmentRegister(
      sessionUser(req).id,
      params.id,
      String(year._id),
      params,
    );
    res.setHeader("X-Next-Cursor", page.nextCursor);
    okList(res, page.entries, 1, params.limit, page.total);
  }),
);
