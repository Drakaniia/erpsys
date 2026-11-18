import { Router } from "express";
import { z } from "zod";
import {
  deriveDepartmentCode,
  normalizeYearLevels,
} from "../../config/constants.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import {
  okList,
  okOne,
  parseBody,
  parsePagination,
  parseQuery,
} from "../../middleware/http.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { UserModel } from "../../models/UserModel.js";
import { activeYearOrThrow } from "../../services/academic-years.js";
import { replaceAssignments } from "../../services/advisers.js";
import {
  assertDepartmentAssigned,
  release,
} from "../../services/queues.js";

/**
 * `/api/v1` — the adviser roster, plus an instructor's own availability switch.
 */
export const advisersRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const instructor = [requireSession, requireSurface("instructor")];

const yearLevelSchema = z.enum(["FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH"]);

/**
 * `GET /api/v1/advisers`
 * Access: session + admin surface.
 * Use: every instructor with the departments it holds (query `page`,
 * `pageSize`).
 * Returns: `{ data, page, pageSize, total }`.
 */
advisersRouter.get(
  "/advisers",
  admin,
  catchAsync(async (req, res) => {
    const users = await UserModel.listByRole("ENROLLMENT_ADVISER");
    const links = await AdviserDepartmentModel.listAll();
    const departments = await DepartmentModel.findByIds(
      links.map((link) => link.departmentId),
    );
    const nameById = new Map(
      departments.map((dept) => [String(dept._id), dept.name]),
    );
    const rows = users.map((user) => ({
      id: String(user._id),
      name: user.name ?? "",
      email: user.email ?? "",
      departments: links
        .filter((link) => link.adviserId === String(user._id))
        .map((link) => {
          const name = nameById.get(link.departmentId) ?? "Unknown";
          return {
            id: link.departmentId,
            name,
            code: deriveDepartmentCode(name),
            yearLevels: normalizeYearLevels(link.yearLevels ?? []),
          };
        }),
    }));
    const { page, pageSize } = parsePagination(req);
    okList(res, rows, page, pageSize, rows.length);
  }),
);

/**
 * `PATCH /api/v1/advisers/:adviserId`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: replace the whole mapping — body
 * `{ assignments: [{ departmentId, yearLevels }] }`.
 * Returns: `{ data: adviser }`.
 */
advisersRouter.patch(
  "/advisers/:adviserId",
  admin,
  catchAsync(async (req, res) => {
    const { adviserId } = parseQuery(
      z.object({ adviserId: z.string().min(1) }),
      req,
    );
    const { assignments } = parseBody(
      z.object({
        assignments: z
          .array(
            z.object({
              departmentId: z.string().min(1),
              yearLevels: z.array(yearLevelSchema).max(5).default([]),
            }),
          )
          .max(50),
      }),
      req,
    );
    okOne(
      res,
      await replaceAssignments(sessionUser(req).id, adviserId, assignments),
    );
  }),
);

/**
 * `PUT /api/v1/me/availability`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: open or close my department's queue — body `{ departmentId, isOpen }`.
 * Returns: `{ data: availability }`.
 */
advisersRouter.put(
  "/me/availability",
  instructor,
  catchAsync(async (req, res) => {
    const adviserId = sessionUser(req).id;
    const { departmentId, isOpen } = parseBody(
      z.object({ departmentId: z.string().min(1), isOpen: z.boolean() }),
      req,
    );
    const academicYearId = String(
      (await activeYearOrThrow())._id,
    );
    await assertDepartmentAssigned(adviserId, departmentId);
    await AdviserAvailabilityModel.setOpen({
      adviserId,
      departmentId,
      academicYearId,
      isOpen,
      now: new Date(),
    });

    if (!isOpen) {
      const serving = await EnrollmentQueueModel.findInProgress(
        departmentId,
        academicYearId,
      );
      if (serving?.servedById === adviserId) {
        await release(adviserId, {
          departmentId,
          entryId: String(serving._id),
        });
      }
    }

    const open = await AdviserAvailabilityModel.listOpenByDepartment(
      departmentId,
      academicYearId,
    );
    const holder = open[0] && open[0].adviserId !== adviserId ? open[0] : null;
    const [holderUser] = holder
      ? await UserModel.findByIds([holder.adviserId])
      : [];
    okOne(res, {
      departmentId,
      myOpen: isOpen,
      isOpen: open.length > 0,
      openBy: holderUser
        ? { id: String(holderUser._id), name: holderUser.name ?? "" }
        : null,
    });
  }),
);

/**
 * `POST /api/v1/me/availability/heartbeat`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: I am still serving; keeps the queue open.
 * Returns: `{ data: availability }`.
 */
advisersRouter.post(
  "/me/availability/heartbeat",
  instructor,
  catchAsync(async (req, res) => {
    okOne(res, {
      touched: await AdviserAvailabilityModel.touchOpen(
        sessionUser(req).id,
        new Date(),
      ),
    });
  }),
);
