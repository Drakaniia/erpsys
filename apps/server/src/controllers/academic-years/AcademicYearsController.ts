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
import { AuthService } from "../../services/auth/AuthService.js";

const idParams = z.object({ id: z.string().min(1) });
const labels = {
  label: z.string().trim().min(1).max(30),
  semesterLabel: z.string().trim().min(1).max(30),
};

export class AcademicYearsController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const items = await AcademicYearService.list();
    const { page, pageSize } = parsePagination(req);
    okList(res, items, page, pageSize, items.length);
  });

  readonly create = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ ...labels, activate: z.boolean().default(false) }),
      req,
    );
    okOne(
      res,
      await AcademicYearService.create(
        AuthService.sessionOf(req).user.id,
        input,
      ),
      201,
    );
  });

  readonly update = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    const input = parseBody(z.object(labels), req);
    okOne(
      res,
      await AcademicYearService.update(
        AuthService.sessionOf(req).user.id,
        params.id,
        input,
      ),
    );
  });

  readonly remove = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    okOne(
      res,
      await AcademicYearService.remove(
        AuthService.sessionOf(req).user.id,
        params.id,
      ),
    );
  });

  readonly activation = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    okOne(res, await AcademicYearService.activationStats(params.id));
  });

  readonly activate = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    okOne(
      res,
      await AcademicYearService.activate(
        AuthService.sessionOf(req).user.id,
        params.id,
      ),
    );
  });
}

export const academicYearsController = new AcademicYearsController();
