import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { ScheduleService } from "../../services/schedules/ScheduleService.js";

const windowSchema = z.object({
  kind: z.enum(["WEEKLY", "EXTRA", "CANCEL"]),
  weekday: z.number().int().min(1).max(7).optional(),
  date: z.string().max(10).optional(),
  startMinute: z.number().int().min(0).max(1440).optional(),
  endMinute: z.number().int().min(0).max(1440).optional(),
});

export class SchedulesController {
  readonly get = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    const { departmentId } = parseQuery(
      z.object({ departmentId: z.string().min(1) }),
      req,
    );
    okOne(res, await ScheduleService.get(user.id, departmentId));
  });

  readonly save = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(
      res,
      await ScheduleService.save(
        user.id,
        parseBody(
          z.object({
            departmentId: z.string().min(1),
            windows: z.array(windowSchema).max(100),
          }),
          req,
        ),
      ),
    );
  });
}

export const schedulesController = new SchedulesController();
