import { Router } from "express";
import { z } from "zod";
import { deriveDepartmentCode } from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import {
  buildQueueShareToken,
  buildQueueShareUrl,
  verifyShareToken,
} from "../../config/queue-share.js";
import { availabilityKey, liveAvailabilityPairs } from "../../config/queue.js";
import { env, isLocalOrigin } from "../../lib/platform/env.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { UserModel } from "../../models/UserModel.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { activeYearOrThrow } from "../../services/academic-years.js";
import { assertDepartmentAssigned } from "../../services/queues.js";

/**
 * `/api/v1` — shareable queue links minted by an assigned adviser.
 */
export const queueSharesRouter = Router();

const INVALID = {
  status: "INVALID",
  departmentId: null,
  departmentName: null,
  departmentCode: null,
  inviterName: null,
  isOpen: false,
  openByName: null,
  waitingCount: 0,
  academicYearId: null,
};

/**
 * `POST /api/v1/queue-shares`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: mint a link for a department — body `{ departmentId }`.
 * Returns: `201` with `{ data: { token, url } }`.
 */
queueSharesRouter.post(
  "/queue-shares",
  requireSession,
  requireSurface("instructor"),
  catchAsync(async (req, res) => {
    const { departmentId } = parseBody(
      z.object({ departmentId: z.string().min(1) }),
      req,
    );
    const adviser = sessionUser(req);
    await assertDepartmentAssigned(adviser.id, departmentId);
    const year = await activeYearOrThrow();
    const department = await DepartmentModel.findById(departmentId);
    if (!department || !department.isActive) {
      throw new ApiError("NOT_FOUND", { message: "Department not found." });
    }

    const origin = env.PUBLIC_SITE_URL;
    if (!origin) {
      throw new ApiError("PRECONDITION_FAILED", {
        message:
          "The public site URL is not configured — share links cannot be built. Set PUBLIC_SITE_URL on the server.",
      });
    }
    if (isLocalOrigin(origin) && env.NODE_ENV === "production") {
      throw new ApiError("PRECONDITION_FAILED", {
        message: `The public site URL is still "${origin}". Set it to the deployed host before sharing queue links.`,
      });
    }

    const token = buildQueueShareToken({
      departmentId: String(department._id),
      adviserId: adviser.id,
      academicYearId: String(year._id),
      secret: env.QUEUE_SHARE_SECRET,
    });
    okOne(
      res,
      {
        url: buildQueueShareUrl({ token, origin }),
        token,
        departmentId: String(department._id),
        departmentName: department.name,
        inviterName: adviser.name ?? "Your adviser",
        academicYearId: String(year._id),
      },
      201,
    );
  }),
);

/**
 * `GET /api/v1/queue-shares/:token`
 * Access: session + student surface.
 * Use: the landing payload behind a share link.
 * Returns: `{ data: share }`.
 */
queueSharesRouter.get(
  "/queue-shares/:token",
  requireSession,
  requireSurface("student"),
  catchAsync(async (req, res) => {
    const { token } = parseQuery(
      z.object({ token: z.string().min(1).max(2000) }),
      req,
    );
    const verified = verifyShareToken(token, env.QUEUE_SHARE_SECRET);
    if (!verified.ok) return okOne(res, INVALID);
    const { d: departmentId, a: adviserId, y: yearId } = verified.payload;

    const year = await AcademicYearModel.findActive();
    if (!year || String(year._id) !== yearId) {
      return okOne(res, { ...INVALID, status: "STALE" });
    }
    const activeYearId = String(year._id);

    const department = await DepartmentModel.findById(departmentId);
    if (!department || !department.isActive) return okOne(res, INVALID);

    const [availabilities, serving, waitingCount, inviter] = await Promise.all([
      AdviserAvailabilityModel.listOpenByYear(activeYearId),
      EnrollmentQueueModel.listInProgressByYear(activeYearId),
      EnrollmentQueueModel.countInLine({
        academicYearId: activeYearId,
        departmentId,
        status: { $in: ["WAITING", "IN_PROGRESS"] },
      }),
      UserModel.findById(adviserId),
    ]);

    const advisers = await UserModel.findByIds([
      ...new Set(
        availabilities
          .filter((a) => a.departmentId === departmentId)
          .map((a) => a.adviserId),
      ),
    ]);
    const nameById = new Map(
      advisers.map((u) => [String(u._id), u.name ?? "Adviser"] as const),
    );
    const livePairs = liveAvailabilityPairs({ availabilities, serving });
    const live = availabilities.find(
      (a) =>
        a.departmentId === departmentId &&
        livePairs.has(availabilityKey(a.adviserId, a.departmentId)),
    );
    const openByName = live
      ? (nameById.get(live.adviserId) ?? "Adviser")
      : null;

    okOne(res, {
      status: "OK",
      departmentId,
      departmentName: department.name,
      departmentCode: deriveDepartmentCode(department.name),
      inviterName: inviter?.name ?? "Adviser",
      isOpen: openByName !== null,
      openByName,
      waitingCount,
      academicYearId: activeYearId,
    });
  }),
);
