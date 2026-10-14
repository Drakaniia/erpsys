import type { Request, Response } from "express";
import { z } from "zod";
import { STUDENT_NUMBER_PATTERN, YEAR_LEVELS } from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { EnrollmentCompletionService } from "../../services/enrollments/EnrollmentCompletionService.js";
import { EnrollmentService } from "../../services/enrollments/EnrollmentService.js";

const studentNumberInput = z
  .string()
  .trim()
  .min(1, "Student number is required")
  .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed");

const saveInput = z.object({
  academicYearId: z.string().min(1),
  departmentId: z.string().min(1),
  yearLevel: z.enum(YEAR_LEVELS),
  studentNumber: studentNumberInput.optional(),
});

const completionInput = z.object({ departmentId: z.string().min(1) });

const revertInput = z.object({
  departmentId: z.string().min(1),
  reason: z.string().min(10).max(500),
});

const bulkRevertInput = revertInput.extend({
  enrollmentIds: z.array(z.string().min(1)).min(1).max(50).optional(),
  ids: z.array(z.string().min(1)).min(1).max(50).optional(),
});

export class EnrollmentsController {
  readonly mine = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    const { rows } = await EnrollmentService.listMine(user);
    okList(res, rows, 1, rows.length);
  });

  readonly save = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(saveInput, req);
    okOne(
      res,
      await EnrollmentService.save(AuthService.sessionOf(req).user, input),
    );
  });

  readonly complete = catchAsync(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { departmentId } = parseBody(completionInput, req);
    okOne(
      res,
      await EnrollmentCompletionService.complete(
        AuthService.sessionOf(req).user.id,
        id,
        departmentId,
      ),
    );
  });

  readonly revert = catchAsync(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { departmentId, reason } = parseBody(revertInput, req);
    okOne(
      res,
      await EnrollmentCompletionService.revert(
        AuthService.sessionOf(req).user.id,
        id,
        departmentId,
        reason,
      ),
    );
  });

  readonly revertMany = catchAsync(async (req: Request, res: Response) => {
    const { departmentId, enrollmentIds, ids, reason } = parseBody(
      bulkRevertInput,
      req,
    );
    const bulkIds = [...new Set([...(enrollmentIds ?? []), ...(ids ?? [])])];
    if (bulkIds.length === 0 || bulkIds.length > 50) {
      throw new ApiError("BAD_REQUEST", {
        message: "Provide 1–50 enrollment ids.",
      });
    }
    okOne(
      res,
      await EnrollmentCompletionService.revertMany(
        AuthService.sessionOf(req).user.id,
        departmentId,
        bulkIds,
        reason,
      ),
    );
  });
}

export const enrollmentsController = new EnrollmentsController();
