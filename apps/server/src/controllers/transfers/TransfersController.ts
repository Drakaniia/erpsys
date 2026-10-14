import type { Request, Response } from "express";
import { z } from "zod";
import { YEAR_LEVELS } from "../../config/constants.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { TransferService } from "../../services/transfers/TransferService.js";

const requestInput = z.object({
  departmentId: z.string().min(1),
  yearLevels: z.array(z.enum(YEAR_LEVELS)).max(5).default([]),
});

const takeoverInput = z.object({
  yearLevels: z.array(z.enum(YEAR_LEVELS)).max(5).default([]),
});

export class TransfersController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    await TransferService.resolveExpired();
    okOne(res, await TransferService.list(AuthService.sessionOf(req).user.id));
  });

  readonly create = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(requestInput, req);
    okOne(
      res,
      await TransferService.create(
        AuthService.sessionOf(req).user as { id: string; name?: string },
        input,
      ),
      201,
    );
  });

  readonly respond = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(z.object({ accept: z.boolean() }), req);
    okOne(
      res,
      await TransferService.respond(
        AuthService.sessionOf(req).user.id,
        String(req.params.id),
        input.accept,
      ),
    );
  });

  readonly cancel = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await TransferService.cancel(
        AuthService.sessionOf(req).user.id,
        String(req.params.id),
      ),
    );
  });

  readonly takeover = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(takeoverInput, req);
    okOne(
      res,
      await TransferService.takeover(
        AuthService.sessionOf(req).user as { id: string; name?: string },
        String(req.params.id),
        input.yearLevels,
      ),
    );
  });
}

export const transfersController = new TransfersController();
