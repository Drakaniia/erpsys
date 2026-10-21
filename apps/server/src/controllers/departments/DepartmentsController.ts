import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import {
  okList,
  okOne,
  parseBody,
  parsePagination,
  parseQuery,
} from "../../middleware/http.js";
import { AcademicYearService } from "../../services/academic-years/AcademicYearService.js";
import { AdviserService } from "../../services/advisers/AdviserService.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { DepartmentAdminService } from "../../services/departments/DepartmentAdminService.js";
import { DepartmentListingService } from "../../services/departments/DepartmentListingService.js";
import { DepartmentService } from "../../services/departments/DepartmentService.js";
import { EnrollmentRegisterService } from "../../services/enrollments/EnrollmentRegisterService.js";

const idParams = z.object({ id: z.string().min(1) });
const nameBody = z.object({ name: z.string().trim().min(1).max(120) });
const patchBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, {
    message: "Nothing to update.",
  });
const yearLevelsBody = z.object({
  yearLevels: z
    .array(z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]))
    .max(5),
});
const myDepartmentsBody = z.object({
  departmentIds: z.array(z.string().min(1)).max(1),
  yearLevels: z
    .array(z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]))
    .max(5)
    .default([]),
});

function creator(req: Request) {
  const user = AuthService.sessionOf(req).user;
  return { callerId: user.id, isAdmin: user.role === "ADMIN" };
}

const registerQuery = z.object({
  id: z.string().min(1),
  range: z.enum(["today", "ay", "all"]).default("ay"),
  q: z.string().max(100).optional(),
  cursor: z.string().optional(),
  // ponytail: "load more" grows the limit instead of paging by cursor; ceiling 500 rows.
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export class DepartmentsController {
  readonly mine = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await DepartmentService.myDepartment(user.id));
  });

  readonly saveMine = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(
      res,
      await AdviserService.assignSelf(
        user.id,
        parseBody(myDepartmentsBody, req),
      ),
    );
  });

  readonly list = catchAsync(async (req: Request, res: Response) => {
    const { callerId, isAdmin } = creator(req);
    const rows = await DepartmentListingService.listing(callerId, isAdmin);
    const { page, pageSize } = parsePagination(req);
    okList(
      res,
      rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      rows.length,
    );
  });

  readonly create = catchAsync(async (req: Request, res: Response) => {
    const { name } = parseBody(nameBody, req);
    okOne(res, await DepartmentAdminService.create(creator(req), name), 201);
  });

  readonly update = catchAsync(async (req: Request, res: Response) => {
    const { id } = parseQuery(idParams, req);
    okOne(
      res,
      await DepartmentAdminService.update(creator(req), {
        id,
        ...parseBody(patchBody, req),
      }),
    );
  });

  readonly setYearLevels = catchAsync(async (req: Request, res: Response) => {
    const { id } = parseQuery(idParams, req);
    const { yearLevels } = parseBody(yearLevelsBody, req);
    okOne(
      res,
      await DepartmentAdminService.setYearLevels(creator(req), id, yearLevels),
    );
  });

  readonly remove = catchAsync(async (req: Request, res: Response) => {
    const { id } = parseQuery(idParams, req);
    okOne(res, await DepartmentAdminService.remove(creator(req), id));
  });

  readonly enrollments = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(registerQuery, req);
    const year = await AcademicYearService.activeOrThrow();
    const page = await EnrollmentRegisterService.list(
      AuthService.sessionOf(req).user.id,
      params.id,
      String(year._id),
      {
        range: params.range,
        q: params.q,
        cursor: params.cursor,
        limit: params.limit,
      },
    );
    res.setHeader("X-Next-Cursor", page.nextCursor);
    okList(res, page.entries, 1, params.limit, page.total);
  });
}

export const departmentsController = new DepartmentsController();
