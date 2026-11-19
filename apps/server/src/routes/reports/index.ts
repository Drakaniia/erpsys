import { Router } from "express";
import { z } from "zod";
import {
  PRE_ENROLLMENT_STEP_CODES,
  YEAR_LEVELS,
} from "../../config/constants.js";
import { REPORT_ROW_CAP, capRows } from "../../config/report.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseQuery } from "../../middleware/http.js";
import {
  ROSTER_SORTS,
  loadRoster,
  rosterFilter,
  rosterStats,
  sortRoster,
  summarizeRoster,
  yearLabel,
  type RosterSort,
} from "../../services/roster.js";
import {
  submissionListQuery,
  submissionRegister,
} from "../../services/submissions.js";
import { userDirectoryPage } from "../../services/users.js";

/**
 * `/api/v1` — the printable reports, one per audience.
 */
export const reportsRouter = Router();

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

const stepRegisterQuery = submissionListQuery
  .omit({ page: true, pageSize: true, step: true })
  .extend({ step: z.enum(PRE_ENROLLMENT_STEP_CODES) });

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

/**
 * `GET /api/v1/reports/user-directory`
 * Access: session + admin surface.
 * Use: user table (query `q`, `role`, `outside`, `academicYearId`,
 * `departmentId`, `yearLevel`, `sort`, `dir`).
 * Returns: `{ data: rows }` for print.
 */
reportsRouter.get(
  "/reports/user-directory",
  [requireSession, requireSurface("admin")],
  catchAsync(async (req, res) => {
    const input = parseQuery(directoryQuery, req);
    const { items, total, year } = await userDirectoryPage({
      ...input,
      page: 1,
      pageSize: REPORT_ROW_CAP,
    });
    okOne(res, {
      year: year ? yearLabel(year) : null,
      rows: items,
      matchedCount: total,
      truncated: total > REPORT_ROW_CAP,
    });
  }),
);

/**
 * `GET /api/v1/reports/roster`
 * Access: session + instructor surface.
 * Use: roster (query `academicYearId`, `scope`, `sort`, `dir`, `q`, `steps`,
 * `buckets`, `departmentIds`, `yearLevels`, `stepState`, `enrolled`,
 * `unassigned`).
 * Returns: `{ data: capped rows + bucket stats }`.
 */
reportsRouter.get(
  "/reports/roster",
  [requireSession, requireSurface("instructor")],
  catchAsync(async (req, res) => {
    const input = parseQuery(rosterQuery, req);
    const loaded = await loadRoster(
      rosterFilter(input, req.query as Record<string, unknown>),
      sessionUser(req).id,
    );
    if (!loaded.year) {
      return okOne(res, {
        year: null,
        rows: [],
        stats: summarizeRoster([], loaded.unassignedTotal),
        matchedCount: 0,
        truncated: false,
      });
    }
    const sort = (ROSTER_SORTS as readonly string[]).includes(input.sort)
      ? (input.sort as RosterSort)
      : "name";
    const capped = capRows(sortRoster(loaded.rows, sort, input.dir));
    okOne(res, {
      year: yearLabel(loaded.year),
      rows: capped.rows,
      stats: summarizeRoster(capped.rows, loaded.unassignedTotal),
      matchedCount: capped.matchedCount,
      truncated: capped.truncated,
    });
  }),
);

/**
 * `GET /api/v1/reports/roster-stats`
 * Access: session + instructor surface.
 * Use: the same filters as `/reports/roster`, aggregated and uncapped.
 * Returns: `{ data: bucket totals }`.
 */
reportsRouter.get(
  "/reports/roster-stats",
  [requireSession, requireSurface("instructor")],
  catchAsync(async (req, res) => {
    const input = parseQuery(rosterQuery, req);
    okOne(
      res,
      await rosterStats(
        sessionUser(req).id,
        rosterFilter(input, req.query as Record<string, unknown>),
      ),
    );
  }),
);

/**
 * `GET /api/v1/reports/step-register`
 * Access: session + officer surface.
 * Use: one step's submissions (query `step` plus the submission filters).
 * Returns: `{ data: register rows }`.
 */
reportsRouter.get(
  "/reports/step-register",
  [requireSession, requireSurface("officer")],
  catchAsync(async (req, res) => {
    const input = parseQuery(stepRegisterQuery, req);
    okOne(res, await submissionRegister(input, input.step));
  }),
);
