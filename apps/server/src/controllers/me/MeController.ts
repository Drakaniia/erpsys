import type { Request, Response } from "express";
import { z } from "zod";
import { NOTIFICATION_PAGE_SIZE } from "../../config/constants.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { LaunchService } from "../../services/me/LaunchService.js";
import { NotificationService } from "../../services/me/NotificationService.js";
import { OverviewService } from "../../services/me/OverviewService.js";

export class MeController {
  readonly launch = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    okOne(res, await LaunchService.load(user));
  });

  readonly overview = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await OverviewService.load(user.role));
  });

  readonly stamp = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await OverviewService.stamp(user.id));
  });

  readonly saveStamp = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(
      res,
      await OverviewService.saveStamp(
        user.id,
        parseBody(
          z.object({
            name: z.string().max(80).optional(),
            graphicUrl: z.string().url().max(1000).nullable().optional(),
            signatureUrl: z.string().url().max(1000).nullable().optional(),
          }),
          req,
        ),
      ),
    );
  });
  readonly notifications = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    const rows = await NotificationService.listMine(user.id);
    okList(res, rows, 1, NOTIFICATION_PAGE_SIZE, rows.length);
  });

  readonly markNotificationsRead = catchAsync(
    async (req: Request, res: Response) => {
      const user = AuthService.sessionOf(req).user;
      okOne(res, await NotificationService.markAllRead(user.id));
    },
  );
}

export const meController = new MeController();
