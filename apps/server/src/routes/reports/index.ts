import { Router } from "express";
import { reportsController } from "../../controllers/reports/ReportsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the printable reports, one per audience.
 */
export const reportsRouter = Router();

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
  reportsController.userDirectory,
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
  reportsController.roster,
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
  reportsController.rosterStats,
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
  reportsController.stepRegister,
);
