import { Router } from "express";
import { z } from "zod";
import {
  YEAR_LEVELS,
  departmentLevelRangeLabel,
  deriveDepartmentCode,
  normalizeYearLevels,
  yearLevelsOverlap,
} from "../../config/constants.js";
import { ApiError } from "../../config/errors.js";
import {
  PRESENCE_STALE_MS,
  TRANSFER_INACTIVE_GRACE_MS,
  TRANSFER_RESPONSE_WINDOW_MS,
  type TransferRow,
} from "../../config/transfers.js";
import { genId } from "../../lib/db/ids.js";
import {
  requireSession,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody } from "../../middleware/http.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { DepartmentTransferModel } from "../../models/DepartmentTransferModel.js";
import { assertLevelsOffered } from "../../services/advisers.js";
import {
  deptNameOrThrow,
  listTransfers,
  notify,
  resolveExpiredTransfers,
  runTransfer,
  serialize,
  userName,
} from "../../services/transfers.js";

/**
 * `/api/v1` — department handover between instructors.
 */
export const transfersRouter = Router();

const instructor = [requireSession, requireSurface("instructor")];

const yearLevels = z.array(z.enum(YEAR_LEVELS)).max(5).default([]);

async function assignableDepartment(departmentId: string) {
  const dept = await DepartmentModel.findById(departmentId);
  if (!dept) {
    throw new ApiError("NOT_FOUND", { message: "Department not found." });
  }
  if (!dept.isActive) {
    throw new ApiError("CONFLICT", {
      message: "Deactivated departments can't be assigned.",
    });
  }
  return dept;
}

async function transferOrThrow(id: string) {
  const row = await DepartmentTransferModel.findById(id);
  if (!row) {
    throw new ApiError("NOT_FOUND", { message: "Transfer request not found." });
  }
  return row;
}

function assertPending(row: TransferRow): void {
  if (row.status !== "PENDING") {
    throw new ApiError("CONFLICT", {
      message: "This request was already resolved.",
    });
  }
}

/**
 * `GET /api/v1/transfers`
 * Access: session + instructor surface.
 * Use: incoming offers and my own requests; expired ones are resolved first.
 * Returns: `{ data: transfer list }`.
 */
transfersRouter.get(
  "/transfers",
  instructor,
  catchAsync(async (req, res) => {
    await resolveExpiredTransfers();
    okOne(res, await listTransfers(sessionUser(req).id));
  }),
);

/**
 * `POST /api/v1/transfers`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: ask for a department — body `{ departmentId, yearLevels? }`.
 * Returns: `201` with `{ data: transfer }`.
 */
transfersRouter.post(
  "/transfers",
  instructor,
  catchAsync(async (req, res) => {
    const input = parseBody(
      z.object({ departmentId: z.string().min(1), yearLevels }),
      req,
    );
    const requester = sessionUser(req);
    const year = await AcademicYearModel.findActive();
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year.",
      });
    }
    const requested = normalizeYearLevels(input.yearLevels);
    const dept = await assignableDepartment(input.departmentId);
    assertLevelsOffered(dept, requested);

    const owner = (
      await AdviserDepartmentModel.listOtherHolders(
        input.departmentId,
        requester.id,
      )
    ).find((holder) => yearLevelsOverlap(holder.yearLevels ?? [], requested));
    if (!owner) {
      throw new ApiError("CONFLICT", {
        message:
          requested.length > 0
            ? `${departmentLevelRangeLabel(requested)} isn't assigned to anyone — assign it directly.`
            : "This department isn't assigned to anyone — assign it directly.",
      });
    }

    const now = new Date();
    const ownerActive = await AdviserAvailabilityModel.isActive(
      owner.adviserId,
      String(year._id),
      now,
      PRESENCE_STALE_MS,
    );
    const windowMs = ownerActive
      ? TRANSFER_RESPONSE_WINDOW_MS
      : TRANSFER_INACTIVE_GRACE_MS;
    const minutes = Math.round(windowMs / 60_000);
    const row: TransferRow = {
      _id: genId("transfer-request"),
      departmentId: input.departmentId,
      requesterId: requester.id,
      ownerId: owner.adviserId,
      status: "PENDING",
      yearLevels: requested,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + windowMs),
    };
    await DepartmentTransferModel.deletePending(
      input.departmentId,
      requester.id,
    );
    await DepartmentTransferModel.insert(row);

    const requesterName = requester.name ?? (await userName(requester.id));
    const range = departmentLevelRangeLabel(requested);
    await notify(
      owner.adviserId,
      "DEPARTMENT_TRANSFER_REQUESTED",
      `${deriveDepartmentCode(dept.name)} transfer requested`,
      ownerActive
        ? `${requesterName} wants to take over the ${dept.name} queue (${range}). Accept or decline within ${minutes} minutes, or it transfers automatically.`
        : `${requesterName} wants to take over the ${dept.name} queue (${range}). You look offline — it transfers automatically in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
    okOne(
      res,
      await serialize(
        row,
        new Set(ownerActive ? [owner.adviserId] : []),
        dept.name,
      ),
      201,
    );
  }),
);

/**
 * `PATCH /api/v1/transfers/:id`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: the owner accepts or declines — body `{ accept }`.
 * Returns: `{ data: transfer }`.
 */
transfersRouter.patch(
  "/transfers/:id",
  instructor,
  catchAsync(async (req, res) => {
    const { accept } = parseBody(z.object({ accept: z.boolean() }), req);
    const userId = sessionUser(req).id;
    const row = await transferOrThrow(String(req.params.id));
    if (row.ownerId !== userId) {
      throw new ApiError("FORBIDDEN", {
        message: "Only the current owner can respond.",
      });
    }
    assertPending(row);
    const deptName = await deptNameOrThrow(row.departmentId);
    const code = deriveDepartmentCode(deptName);
    const now = new Date();
    if (!accept) {
      await DepartmentTransferModel.update(row._id, {
        status: "DECLINED",
        respondedAt: now,
        resolvedAt: now,
      });
      await notify(
        row.requesterId,
        "DEPARTMENT_TRANSFER_DECLINED",
        `${code} transfer declined`,
        `The current instructor is keeping the ${deptName} queue. You can request again anytime.`,
      );
      return okOne(res, {
        id: String(row._id),
        status: "DECLINED",
        transferredFromName: null,
      });
    }

    if (!(await AdviserDepartmentModel.findLink(userId, row.departmentId))) {
      throw new ApiError("CONFLICT", {
        message: "That department is no longer assigned to you.",
      });
    }
    const transferredFromName = await runTransfer({
      departmentId: row.departmentId,
      adviserId: row.requesterId,
      actorName: await userName(row.requesterId),
      now,
      departmentName: deptName,
      yearLevels: row.yearLevels ?? [],
    });
    await DepartmentTransferModel.update(row._id, {
      status: "ACCEPTED",
      respondedAt: now,
      resolvedAt: now,
    });
    await DepartmentTransferModel.cancelPendingExcept(
      row.departmentId,
      String(row._id),
      now,
    );
    await notify(
      row.requesterId,
      "DEPARTMENT_TRANSFER_APPROVED",
      `${code} transfer approved`,
      `You're now serving the ${deptName} queue (${departmentLevelRangeLabel(normalizeYearLevels(row.yearLevels ?? []))}).`,
    );
    okOne(res, {
      id: String(row._id),
      status: "ACCEPTED",
      transferredFromName,
    });
  }),
);

/**
 * `DELETE /api/v1/transfers/:id`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: the requester withdraws.
 * Returns: `{ data: transfer }`.
 */
transfersRouter.delete(
  "/transfers/:id",
  instructor,
  catchAsync(async (req, res) => {
    const row = await transferOrThrow(String(req.params.id));
    if (row.requesterId !== sessionUser(req).id) {
      throw new ApiError("FORBIDDEN", {
        message: "Only the requester can cancel this.",
      });
    }
    assertPending(row);
    await DepartmentTransferModel.update(row._id, {
      status: "CANCELLED",
      resolvedAt: new Date(),
    });
    okOne(res, { id: String(row._id), cancelled: true });
  }),
);

/**
 * `POST /api/v1/departments/:id/takeover`
 * Access: session + instructor surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: claim a department nobody holds — body `{ yearLevels? }`.
 * Returns: `{ data: assignment }`.
 */
transfersRouter.post(
  "/departments/:id/takeover",
  instructor,
  catchAsync(async (req, res) => {
    const input = parseBody(z.object({ yearLevels }), req);
    const adviser = sessionUser(req);
    const departmentId = String(req.params.id);
    const requested = normalizeYearLevels(input.yearLevels);
    const dept = await assignableDepartment(departmentId);
    assertLevelsOffered(dept, requested);
    const transferredFromName = await runTransfer({
      departmentId,
      adviserId: adviser.id,
      actorName: adviser.name ?? "Another instructor",
      now: new Date(),
      departmentName: dept.name,
      yearLevels: requested,
    });
    okOne(res, {
      departmentId,
      name: dept.name,
      code: deriveDepartmentCode(dept.name),
      transferredFromName,
    });
  }),
);
