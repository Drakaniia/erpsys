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
import { AuthService } from "../../services/auth/AuthService.js";
import { RequirementService } from "../../services/requirements/RequirementService.js";

const idParams = z.object({ id: z.string().min(1) });

export class RequirementsController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const items = await RequirementService.list();
    const { page, pageSize } = parsePagination(req);
    okList(res, items, page, pageSize, items.length);
  });

  readonly create = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ label: z.string().trim().min(1).max(200) }),
      req,
    );
    const row = await RequirementService.create(
      AuthService.sessionOf(req).user.id,
      input,
    );
    okOne(res, row, 201);
  });

  readonly update = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(idParams, req);
    const input = parseBody(
      z.object({
        label: z.string().trim().min(1).max(200).optional(),
        isActive: z.boolean().optional(),
      }),
      req,
    );
    okOne(
      res,
      await RequirementService.update(
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
      await RequirementService.remove(
        AuthService.sessionOf(req).user.id,
        params.id,
      ),
    );
  });

  readonly reorder = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({ orderedIds: z.array(z.string().min(1)).max(500) }),
      req,
    );
    okOne(
      res,
      await RequirementService.reorder(
        AuthService.sessionOf(req).user.id,
        input.orderedIds,
      ),
    );
  });
}

export const requirementsController = new RequirementsController();
