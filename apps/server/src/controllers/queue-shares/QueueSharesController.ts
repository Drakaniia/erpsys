import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { QueueShareService } from "../../services/queue-shares/QueueShareService.js";

export class QueueSharesController {
  readonly create = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(z.object({ departmentId: z.string().min(1) }), req);
    okOne(
      res,
      await QueueShareService.create(
        AuthService.sessionOf(req).user,
        input.departmentId,
      ),
      201,
    );
  });

  readonly view = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(
      z.object({ token: z.string().min(1).max(2000) }),
      req,
    );
    okOne(res, await QueueShareService.view(input.token));
  });
}

export const queueSharesController = new QueueSharesController();
