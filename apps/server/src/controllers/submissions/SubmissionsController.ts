import type { Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import {
  SubmissionListService,
  submissionListQuery,
} from "../../services/submissions/SubmissionListService.js";
import { SubmissionReviewService } from "../../services/submissions/SubmissionReviewService.js";

const replyInput = z.object({
  chips: z.array(z.string().min(1)).max(10).default([]),
  note: z.string().max(500).optional(),
});

export class SubmissionsController {
  readonly list = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(submissionListQuery, req);
    const { data, total } = await SubmissionListService.page(input);
    okList(res, data, input.page, input.pageSize, total);
  });

  readonly detail = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await SubmissionReviewService.detail(String(req.params.verificationId)),
    );
  });

  readonly verify = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await SubmissionReviewService.verify(
        AuthService.sessionOf(req).user.id,
        String(req.params.id),
      ),
    );
  });

  readonly revoke = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await SubmissionReviewService.revoke(
        AuthService.sessionOf(req).user.id,
        String(req.params.id),
      ),
    );
  });

  readonly reply = catchAsync(async (req: Request, res: Response) => {
    okOne(
      res,
      await SubmissionReviewService.reply(
        AuthService.sessionOf(req).user.id,
        String(req.params.id),
        parseBody(replyInput, req),
      ),
    );
  });
}

export const submissionsController = new SubmissionsController();
