import type { Request, Response } from "express";
import { z } from "zod";
import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVELS,
} from "../../config/constants.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseQuery } from "../../middleware/http.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { ReportsService } from "../../services/reports/ReportsService.js";
import { submissionListQuery } from "../../services/submissions/SubmissionListService.js";
import {
  ROSTER_SORTS,
  type RosterSort,
} from "../../services/students/RosterService.js";
import { rosterFilter } from "../../services/students/roster-filter.js";

const rosterQuery = z.object({
  academicYearId: z.string().optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  sort: z.string().default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(100).optional(),
  stepState: z.string().optional(),
  enrolled: z.string().optional(),
  unassigned: z.string().optional(),
});

const stepRegisterQuery = submissionListQuery.omit({
  page: true,
  pageSize: true,
  step: true,
});

const directoryQuery = z.object({
  q: z.string().max(100).default(""),
  role: z
    .enum(["ALL", "STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER", "ADMIN"])
    .default("ALL"),
  outside: z.enum(["ALL", "INSIDE", "OUTSIDE"]).default("ALL"),
  academicYearId: z.string().optional(),
  departmentId: z.string().optional(),
  yearLevel: z.enum(YEAR_LEVELS).optional(),
  sort: z.enum(["joined", "studentNumber", "name"]).default("joined"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});

function rosterSort(sort: string): RosterSort {
  return (ROSTER_SORTS as readonly string[]).includes(sort)
    ? (sort as RosterSort)
    : "name";
}

export class ReportsController {
  readonly roster = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(rosterQuery, req);
    okOne(
      res,
      await ReportsService.roster(
        AuthService.sessionOf(req).user.id,
        rosterFilter(input, req.query as Record<string, unknown>),
        rosterSort(input.sort),
        input.dir,
      ),
    );
  });

  readonly rosterStats = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(rosterQuery, req);
    okOne(
      res,
      await ReportsService.rosterStats(
        AuthService.sessionOf(req).user.id,
        rosterFilter(input, req.query as Record<string, unknown>),
      ),
    );
  });

  readonly stepRegister = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(
      stepRegisterQuery.extend({
        step: z.enum(PRE_ENROLLMENT_STEP_CODES),
      }),
      req,
    );
    okOne(res, await ReportsService.stepRegister(input, input.step));
  });

  readonly userDirectory = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(directoryQuery, req);
    okOne(res, await ReportsService.userDirectory(input));
  });
}

export const reportsController = new ReportsController();
