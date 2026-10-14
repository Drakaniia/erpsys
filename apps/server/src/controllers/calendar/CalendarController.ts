import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { CalendarConnectService } from "../../services/calendar/CalendarConnectService.js";
import { CalendarDisconnectService } from "../../services/calendar/CalendarDisconnectService.js";

const callbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(2048).optional(),
  error: z.string().max(200).optional(),
});

export class CalendarController {
  readonly status = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await CalendarConnectService.status(AuthService.sessionOf(req).user.id),
    );
  });

  readonly connect = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await CalendarConnectService.begin(AuthService.sessionOf(req).user.id),
    );
  });

  readonly callback = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    const query = callbackQuery.safeParse(req.query);
    let outcome = "error";
    if (query.success && query.data.code && query.data.state) {
      try {
        await CalendarConnectService.finish(user.id, {
          code: query.data.code,
          state: query.data.state,
        });
        outcome = "connected";
      } catch {
        outcome = "error";
      }
    }
    res.redirect(`/instructor?calendar=${outcome}`);
  });

  readonly sync = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await CalendarConnectService.resync(AuthService.sessionOf(req).user.id),
    );
  });

  readonly disconnect = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    await CalendarDisconnectService.disconnect(user.id, true);
    okOne(res, await CalendarConnectService.status(user.id));
  });
}

export const calendarController = new CalendarController();
