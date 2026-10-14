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
import { AdviserAvailabilityService } from "../../services/advisers/AdviserAvailabilityService.js";
import { AdviserService } from "../../services/advisers/AdviserService.js";
import { AuthService } from "../../services/auth/AuthService.js";

const yearLevelSchema = z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]);
const adviserParams = z.object({ adviserId: z.string().min(1) });

export class AdvisersController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const rows = await AdviserService.list();
    const { page, pageSize } = parsePagination(req);
    okList(res, rows, page, pageSize, rows.length);
  });

  readonly saveAssignments = catchAsync(async (req: Request, res: Response) => {
    const { adviserId } = parseQuery(adviserParams, req);
    const { assignments } = parseBody(
      z.object({
        assignments: z
          .array(
            z.object({
              departmentId: z.string().min(1),
              yearLevels: z.array(yearLevelSchema).max(5).default([]),
            }),
          )
          .max(50),
      }),
      req,
    );
    okOne(
      res,
      await AdviserService.replaceAssignments(
        AuthService.sessionOf(req).user.id,
        adviserId,
        assignments,
      ),
    );
  });

  readonly setAvailability = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(
      res,
      await AdviserAvailabilityService.setOpen(
        user.id,
        parseBody(
          z.object({ departmentId: z.string().min(1), isOpen: z.boolean() }),
          req,
        ),
      ),
    );
  });

  readonly heartbeat = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await AdviserAvailabilityService.heartbeat(user.id));
  });
}

export const advisersController = new AdvisersController();
