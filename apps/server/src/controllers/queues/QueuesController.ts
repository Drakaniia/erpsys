import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { QueueEntryService } from "../../services/queues/QueueEntryService.js";
import { QueueJoinService } from "../../services/queues/QueueJoinService.js";
import { QueueListingService } from "../../services/queues/QueueListingService.js";
import { QueueServingService } from "../../services/queues/QueueServingService.js";
import { QueueStatusService } from "../../services/queues/QueueStatusService.js";

const servingInput = z.object({
  departmentId: z.string().min(1),
  entryId: z.string().min(1),
});

export class QueuesController {
  readonly myQueue = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await QueueStatusService.load(user.id));
  });

  readonly myQueues = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await QueueListingService.myQueues(AuthService.sessionOf(req).user.id),
    );
  });

  readonly join = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(z.object({ departmentId: z.string().min(1) }), req);
    okOne(
      res,
      await QueueJoinService.join(
        AuthService.sessionOf(req).user,
        input.departmentId,
      ),
      201,
    );
  });

  readonly leave = catchAsync(async (req: Request, res: Response) => {
    okOne(res, await QueueJoinService.leave(AuthService.sessionOf(req).user));
  });

  readonly serve = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(servingInput, req);
    okOne(
      res,
      await QueueServingService.serve(
        AuthService.sessionOf(req).user.id,
        input,
      ),
      201,
    );
  });

  readonly release = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(servingInput, req);
    okOne(
      res,
      await QueueServingService.release(
        AuthService.sessionOf(req).user.id,
        input,
      ),
    );
  });

  readonly moveToEnd = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      servingInput.extend({ to: z.enum(["end"]).optional() }),
      req,
    );
    okOne(
      res,
      await QueueServingService.moveToEnd(
        AuthService.sessionOf(req).user.id,
        input,
      ),
    );
  });

  readonly removeEntry = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(z.object({ id: z.string().min(1) }), req);
    okOne(
      res,
      await QueueEntryService.remove(
        AuthService.sessionOf(req).user.id,
        params.id,
      ),
    );
  });

  readonly restoreEntry = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(z.object({ id: z.string().min(1) }), req);
    const body = parseBody(
      z.object({
        departmentId: z.string().min(1),
        studentProfileId: z.string().min(1),
        academicYearId: z.string().min(1),
        joinedAt: z.string().min(1),
        studentName: z.string(),
        token: z.string().min(1),
      }),
      req,
    );
    okOne(
      res,
      await QueueEntryService.restore(
        AuthService.sessionOf(req).user.id,
        params.id,
        body,
      ),
    );
  });
}

export const queuesController = new QueuesController();
