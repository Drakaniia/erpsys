import type { Request, Response } from "express";
import { z } from "zod";
import { uploadStepCodeSchema } from "../../config/steps.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { EvidenceService } from "../../services/evidence/EvidenceService.js";
import { StepSubmissionService } from "../../services/evidence/StepSubmissionService.js";

const stepCodeParams = z.object({ code: uploadStepCodeSchema });

export class EvidenceController {
  readonly add = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({
        stepCode: uploadStepCodeSchema,
        fileKey: z.string().min(1).max(500),
        fileUrl: z.string().url().max(1000),
      }),
      req,
    );
    okOne(
      res,
      await EvidenceService.add(AuthService.sessionOf(req).user, input),
      201,
    );
  });

  readonly remove = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(z.object({ id: z.string().min(1) }), req);
    okOne(
      res,
      await EvidenceService.remove(AuthService.sessionOf(req).user, params.id),
    );
  });

  readonly saveLink = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({
        stepCode: uploadStepCodeSchema,
        url: z.string().url().max(1000),
      }),
      req,
    );
    okOne(
      res,
      await StepSubmissionService.saveLink(
        AuthService.sessionOf(req).user,
        input,
      ),
    );
  });

  readonly removeLink = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(z.object({ stepCode: uploadStepCodeSchema }), req);
    okOne(
      res,
      await StepSubmissionService.removeLink(
        AuthService.sessionOf(req).user,
        input.stepCode,
      ),
    );
  });

  readonly submit = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(stepCodeParams, req);
    okOne(
      res,
      await StepSubmissionService.submit(
        AuthService.sessionOf(req).user,
        params.code,
      ),
      201,
    );
  });

  readonly cancel = catchAsync(async (req: Request, res: Response) => {
    const params = parseQuery(stepCodeParams, req);
    okOne(
      res,
      await StepSubmissionService.cancel(
        AuthService.sessionOf(req).user,
        params.code,
      ),
    );
  });
}

export const evidenceController = new EvidenceController();
