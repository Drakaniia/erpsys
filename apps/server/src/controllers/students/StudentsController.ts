import type { Request, Response } from "express";
import { z } from "zod";
import { STUDENT_NUMBER_PATTERN } from "../../config/constants.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { StudentAssessmentService } from "../../services/students/StudentAssessmentService.js";
import { StudentListService } from "../../services/students/StudentListService.js";
import {
  RosterBoardService,
  rosterBoardQuery,
} from "../../services/students/RosterBoardService.js";
import { OfficerStudentService } from "../../services/students/OfficerStudentService.js";
import { SubmissionReviewService } from "../../services/submissions/SubmissionReviewService.js";
import { StudentProfileService } from "../../services/students/StudentProfileService.js";
import { StudentRecordService } from "../../services/students/StudentRecordService.js";
import { StudentReminderService } from "../../services/students/StudentReminderService.js";
import { StudentStepService } from "../../services/students/StudentStepService.js";

const studentNumberInput = z
  .string()
  .trim()
  .min(1, "Student number is required")
  .regex(STUDENT_NUMBER_PATTERN, "Only numbers are allowed");

export class StudentsController {
  readonly mySteps = catchAsync(async (req: Request, res: Response) => {
    okOne(res, await StudentStepService.load(AuthService.sessionOf(req).user));
  });

  readonly myProfile = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await StudentProfileService.status(user.id));
  });

  readonly saveStudentNumber = catchAsync(
    async (req: Request, res: Response) => {
      const input = parseBody(
        z.object({ studentNumber: studentNumberInput }),
        req,
      );
      okOne(
        res,
        await StudentProfileService.saveStudentNumber(
          AuthService.sessionOf(req).user,
          input.studentNumber,
        ),
      );
    },
  );

  readonly captureMugshot = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({
        fileKey: z.string().min(1).max(500),
        fileUrl: z.string().min(1).max(2_000_000),
      }),
      req,
    );
    okOne(
      res,
      await SubmissionReviewService.captureMugshot(
        AuthService.sessionOf(req).user.id,
        String(req.params.id),
        input,
      ),
    );
  });

  readonly officerDetail = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(
      z.object({
        academicYearId: z.string().optional(),
        scope: z.enum(["mine", "all"]).default("mine"),
      }),
      req,
    );
    okOne(
      res,
      await OfficerStudentService.detail(
        AuthService.sessionOf(req).user as { id: string; role?: string },
        String(req.params.id),
        input.academicYearId,
        input.scope,
      ),
    );
  });

  readonly officerRecord = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(
      z.object({
        academicYearId: z.string().optional(),
        scope: z.enum(["mine", "all"]).default("mine"),
      }),
      req,
    );
    okOne(
      res,
      await OfficerStudentService.record(
        AuthService.sessionOf(req).user as { id: string; role?: string },
        String(req.params.id),
        input.academicYearId,
        input.scope,
      ),
    );
  });

  readonly list = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(
      z.object({
        q: z.string().max(100).default(""),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
        sort: z.string().default("joined"),
        dir: z.enum(["asc", "desc"]).default("desc"),
        role: z.string().default("ALL"),
        outside: z.string().default("ALL"),
        academicYearId: z.string().optional(),
        departmentId: z.string().optional(),
        yearLevel: z.string().optional(),
        scope: z.enum(["mine", "all"]).default("mine"),
        unassigned: z.string().optional(),
        enrolled: z.string().optional(),
        stepState: z.string().optional(),
      }),
      req,
    );
    const { items, total } = await StudentListService.list(
      AuthService.sessionOf(req).user as { id: string; role?: string },
      input,
      req.query as Record<string, unknown>,
    );
    okList(res, items, input.page, input.limit, total);
  });

  readonly rosterBoard = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(rosterBoardQuery, req);
    okOne(
      res,
      await RosterBoardService.load(
        AuthService.sessionOf(req).user as { id: string; role?: string },
        input,
        req.query as Record<string, unknown>,
      ),
    );
  });

  readonly reminders = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(
      z.object({
        studentProfileIds: z.array(z.string().min(1)).min(1).max(200),
        academicYearId: z.string().optional(),
      }),
      req,
    );
    okOne(
      res,
      await StudentReminderService.send(
        AuthService.sessionOf(req).user.id,
        input.studentProfileIds,
        input.academicYearId,
      ),
    );
  });

  readonly myRecord = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await StudentRecordService.loadForStudent(user.id));
  });

  readonly assessment = catchAsync(async (req: Request, res: Response) => {
    const user = AuthService.sessionOf(req).user;
    okOne(res, await StudentAssessmentService.apply(user));
  });
}

export const studentsController = new StudentsController();
