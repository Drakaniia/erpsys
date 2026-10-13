import { ApiError } from "../../config/errors.js";
import {
  YEAR_LEVEL_LABELS,
  departmentAcceptsLevel,
  departmentLevelRangeLabel,
  deriveDepartmentCode,
  normalizeYearLevels,
  subtractYearLevels,
  yearLevelsOverlap,
  type YearLevel,
} from "../../config/constants.js";
import {
  PRESENCE_STALE_MS,
  TRANSFER_INACTIVE_GRACE_MS,
  TRANSFER_RESPONSE_WINDOW_MS,
  type TransferRow,
} from "../../config/transfers.js";
import { genId } from "../../lib/db/ids.js";
import { publishToUser } from "../../lib/platform/sse.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { AdviserAvailabilityModel } from "../../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../../models/AdviserDepartmentModel.js";
import { AcademicYearModel } from "../../models/AcademicYearModel.js";
import { DepartmentModel } from "../../models/DepartmentModel.js";
import { DepartmentTransferModel } from "../../models/DepartmentTransferModel.js";
import { EnrollmentQueueModel } from "../../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../../models/NotificationModel.js";
import { UserModel } from "../../models/UserModel.js";

type TransferOutcome = {
  previousOwnerId: string | null;
  previousOwnerName: string | null;
};

async function userName(userId: string): Promise<string> {
  return (await UserModel.findById(userId))?.name ?? "An instructor";
}

async function deptNameOrThrow(departmentId: string): Promise<string> {
  const dept = await DepartmentModel.findById(departmentId);
  if (!dept) {
    throw new ApiError("NOT_FOUND", { message: "Department not found." });
  }
  return dept.name;
}

async function notify(
  userId: string,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await NotificationModel.insert({
    _id: genId("notification"),
    userId,
    type,
    title,
    body,
    createdAt: new Date(),
  });
  publishToUser(userId, "notifications");
}

function assertLevelsOffered(
  dept: { name: string; yearLevels?: YearLevel[] },
  requested: YearLevel[],
): void {
  const unsupported = requested.filter(
    (level) => !departmentAcceptsLevel(dept.yearLevels ?? [], level),
  );
  if (unsupported.length > 0) {
    throw new ApiError("CONFLICT", {
      message: `${dept.name} doesn't offer ${unsupported
        .map((level) => YEAR_LEVEL_LABELS[level])
        .join(", ")}.`,
    });
  }
}

async function serialize(
  row: TransferRow,
  activeOwnerIds: Set<string>,
  deptName: string,
) {
  const [requesterName, ownerName] = await Promise.all([
    userName(row.requesterId),
    userName(row.ownerId),
  ]);
  return {
    id: String(row._id),
    departmentId: row.departmentId,
    departmentName: deptName,
    departmentCode: deriveDepartmentCode(deptName),
    status: row.status,
    requesterId: row.requesterId,
    requesterName,
    ownerId: row.ownerId,
    ownerName,
    ownerActive: activeOwnerIds.has(row.ownerId),
    yearLevels: normalizeYearLevels(row.yearLevels ?? []),
    createdAt: new Date(row.createdAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
    respondedAt: row.respondedAt
      ? new Date(row.respondedAt).toISOString()
      : null,
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
  };
}

export class TransferService {
  static async list(userId: string) {
    const [incoming, outgoing, year] = await Promise.all([
      DepartmentTransferModel.listIncoming(userId),
      DepartmentTransferModel.listOutgoing(userId),
      AcademicYearModel.findActive(),
    ]);
    const yearId = year ? String(year._id) : "";
    const ownerIds = [
      ...new Set([...incoming, ...outgoing].map((row) => row.ownerId)),
    ];
    const activeOwners = yearId
      ? await Promise.all(
          ownerIds.map((ownerId) =>
            AdviserAvailabilityModel.isActive(
              ownerId,
              yearId,
              new Date(),
              PRESENCE_STALE_MS,
            ),
          ),
        )
      : [];
    const activeSet = new Set(
      ownerIds.filter((_, index) => activeOwners[index]),
    );
    const names = new Map<string, string>();
    for (const row of [...incoming, ...outgoing]) {
      if (names.has(row.departmentId)) continue;
      names.set(
        row.departmentId,
        await deptNameOrThrow(row.departmentId).catch(() => "Department"),
      );
    }
    const shape = (rows: TransferRow[]) =>
      Promise.all(
        rows.map((row) =>
          serialize(
            row,
            activeSet,
            names.get(row.departmentId) ?? "Department",
          ),
        ),
      );
    return { incoming: await shape(incoming), outgoing: await shape(outgoing) };
  }

  static async create(
    requester: { id: string; name?: string },
    input: { departmentId: string; yearLevels: YearLevel[] },
  ) {
    const year = await AcademicYearModel.findActive();
    if (!year) {
      throw new ApiError("PRECONDITION_FAILED", {
        message: "No active academic year.",
      });
    }
    const yearId = String(year._id);
    const requested = normalizeYearLevels(input.yearLevels);
    const dept = await DepartmentModel.findById(input.departmentId);
    if (!dept) {
      throw new ApiError("NOT_FOUND", { message: "Department not found." });
    }
    if (!dept.isActive) {
      throw new ApiError("CONFLICT", {
        message: "Deactivated departments can't be assigned.",
      });
    }
    assertLevelsOffered(dept, requested);

    const holders = await AdviserDepartmentModel.listOtherHolders(
      input.departmentId,
      requester.id,
    );
    const owner =
      holders.find((holder) =>
        yearLevelsOverlap(holder.yearLevels ?? [], requested),
      ) ?? null;
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
      yearId,
      now,
      PRESENCE_STALE_MS,
    );
    const expiresAt = new Date(
      now.getTime() +
        (ownerActive
          ? TRANSFER_RESPONSE_WINDOW_MS
          : TRANSFER_INACTIVE_GRACE_MS),
    );
    const minutes = Math.round((expiresAt.getTime() - now.getTime()) / 60_000);
    const row: TransferRow = {
      _id: genId("transfer-request"),
      departmentId: input.departmentId,
      requesterId: requester.id,
      ownerId: owner.adviserId,
      status: "PENDING",
      yearLevels: requested,
      createdAt: now,
      expiresAt,
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
    publishToUser(owner.adviserId, "transfer-requests");
    return serialize(
      row,
      ownerActive ? new Set([owner.adviserId]) : new Set(),
      dept.name,
    );
  }

  static async respond(userId: string, id: string, accept: boolean) {
    const row = await DepartmentTransferModel.findById(id);
    if (!row) {
      throw new ApiError("NOT_FOUND", {
        message: "Transfer request not found.",
      });
    }
    if (row.ownerId !== userId) {
      throw new ApiError("FORBIDDEN", {
        message: "Only the current owner can respond.",
      });
    }
    if (row.status !== "PENDING") {
      throw new ApiError("CONFLICT", {
        message: "This request was already resolved.",
      });
    }
    const deptName = await deptNameOrThrow(row.departmentId);
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
        `${deriveDepartmentCode(deptName)} transfer declined`,
        `The current instructor is keeping the ${deptName} queue. You can request again anytime.`,
      );
      publishToUser(row.requesterId, "transfer-requests");
      return {
        id: String(row._id),
        status: "DECLINED",
        transferredFromName: null,
      };
    }

    const stillOwner = await AdviserDepartmentModel.findLink(
      userId,
      row.departmentId,
    );
    if (!stillOwner) {
      throw new ApiError("CONFLICT", {
        message: "That department is no longer assigned to you.",
      });
    }
    const requesterName = await userName(row.requesterId);
    const outcome = await TransferService.runTransfer({
      departmentId: row.departmentId,
      adviserId: row.requesterId,
      actorName: requesterName,
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
      `${deriveDepartmentCode(deptName)} transfer approved`,
      `You're now serving the ${deptName} queue (${departmentLevelRangeLabel(normalizeYearLevels(row.yearLevels ?? []))}).`,
    );
    publishToUser(row.requesterId, "transfer-requests");
    return {
      id: String(row._id),
      status: "ACCEPTED",
      transferredFromName: outcome.previousOwnerName,
    };
  }

  static async cancel(userId: string, id: string) {
    const row = await DepartmentTransferModel.findById(id);
    if (!row) {
      throw new ApiError("NOT_FOUND", {
        message: "Transfer request not found.",
      });
    }
    if (row.requesterId !== userId) {
      throw new ApiError("FORBIDDEN", {
        message: "Only the requester can cancel this.",
      });
    }
    if (row.status !== "PENDING") {
      throw new ApiError("CONFLICT", {
        message: "This request was already resolved.",
      });
    }
    await DepartmentTransferModel.update(row._id, {
      status: "CANCELLED",
      resolvedAt: new Date(),
    });
    publishToUser(row.ownerId, "transfer-requests");
    return { id: String(row._id), cancelled: true };
  }

  static async takeover(
    adviser: { id: string; name?: string },
    departmentId: string,
    yearLevels: YearLevel[],
  ) {
    const requested = normalizeYearLevels(yearLevels);
    const dept = await DepartmentModel.findById(departmentId);
    if (!dept) {
      throw new ApiError("NOT_FOUND", { message: "Department not found." });
    }
    if (!dept.isActive) {
      throw new ApiError("CONFLICT", {
        message: "Deactivated departments can't be assigned.",
      });
    }
    assertLevelsOffered(dept, requested);
    const outcome = await TransferService.runTransfer({
      departmentId,
      adviserId: adviser.id,
      actorName: adviser.name ?? "Another instructor",
      now: new Date(),
      departmentName: dept.name,
      yearLevels: requested,
    });
    if (outcome.previousOwnerId) {
      publishToUser(outcome.previousOwnerId, "notifications");
    }
    return {
      departmentId,
      name: dept.name,
      code: deriveDepartmentCode(dept.name),
      transferredFromName: outcome.previousOwnerName,
    };
  }

  private static async runTransfer(opts: {
    departmentId: string;
    adviserId: string;
    actorName: string;
    now: Date;
    departmentName: string;
    yearLevels?: readonly YearLevel[];
    ownerNoticeBody?: string;
  }): Promise<TransferOutcome> {
    const requested = normalizeYearLevels(opts.yearLevels ?? []);
    const holders = await AdviserDepartmentModel.listOtherHolders(
      opts.departmentId,
      opts.adviserId,
    );
    const owner =
      holders.find((holder) =>
        requested.length === 0
          ? true
          : yearLevelsOverlap(holder.yearLevels ?? [], requested),
      ) ?? null;

    await AdviserDepartmentModel.deleteOthers(
      opts.adviserId,
      opts.departmentId,
    );
    await AdviserAvailabilityModel.closeOpenForAdviser(opts.adviserId, [
      opts.departmentId,
    ]);
    await EnrollmentQueueModel.releaseServingExcept(opts.adviserId, [
      opts.departmentId,
    ]);

    if (owner) {
      const remaining = subtractYearLevels(owner.yearLevels ?? [], requested);
      if (remaining.length === 0) {
        await AdviserDepartmentModel.deleteOne(
          owner.adviserId,
          opts.departmentId,
        );
        await AdviserAvailabilityModel.closeForDepartment(
          owner.adviserId,
          opts.departmentId,
          opts.now,
        );
        await EnrollmentQueueModel.releaseServingBy(
          opts.departmentId,
          owner.adviserId,
        );
      } else {
        await AdviserDepartmentModel.setLevels(
          owner.adviserId,
          opts.departmentId,
          remaining,
        );
      }
      await AdminActionLogModel.log(
        opts.adviserId,
        "DEPARTMENT_QUEUE_TRANSFERRED",
        `Department:${opts.departmentId}`,
        `from:${owner.adviserId}`,
      );
      await notify(
        owner.adviserId,
        "DEPARTMENT_QUEUE_TRANSFERRED",
        `${deriveDepartmentCode(opts.departmentName)} queue transferred`,
        opts.ownerNoticeBody ??
          `${opts.actorName} is now handling the ${opts.departmentName} queue.`,
      );
    }

    const mine = await AdviserDepartmentModel.findLink(
      opts.adviserId,
      opts.departmentId,
    );
    if (mine) {
      await AdviserDepartmentModel.setLevels(
        opts.adviserId,
        opts.departmentId,
        requested.length === 0
          ? []
          : normalizeYearLevels([...(mine.yearLevels ?? []), ...requested]),
      );
    } else {
      await AdviserDepartmentModel.insert({
        _id: genId("adviser-dept"),
        adviserId: opts.adviserId,
        departmentId: opts.departmentId,
        yearLevels: requested,
      });
    }

    return {
      previousOwnerId: owner?.adviserId ?? null,
      previousOwnerName: owner ? await userName(owner.adviserId) : null,
    };
  }

  static async resolveExpired(now: Date = new Date()): Promise<number> {
    const expired = await DepartmentTransferModel.listExpired(now);
    const affected = new Set<string>();
    for (const row of expired) {
      const deptName = await deptNameOrThrow(row.departmentId).catch(
        () => null,
      );
      if (!deptName) {
        await DepartmentTransferModel.update(row._id, {
          status: "EXPIRED",
          resolvedAt: now,
        });
        continue;
      }
      const requested = normalizeYearLevels(row.yearLevels ?? []);
      const [ownerLink, requesterLink] = await Promise.all([
        AdviserDepartmentModel.findLink(row.ownerId, row.departmentId),
        AdviserDepartmentModel.findLink(row.requesterId, row.departmentId),
      ]);
      const stillOwner =
        ownerLink !== null &&
        yearLevelsOverlap(ownerLink.yearLevels ?? [], requested);
      const requesterAlreadyOwns =
        requesterLink !== null &&
        requested.every((level) =>
          departmentAcceptsLevel(requesterLink.yearLevels ?? [], level),
        );
      if (!stillOwner || requesterAlreadyOwns) {
        await DepartmentTransferModel.update(row._id, {
          status: "EXPIRED",
          resolvedAt: now,
        });
        affected.add(row.requesterId);
        affected.add(row.ownerId);
        continue;
      }
      const requesterName = await userName(row.requesterId);
      await TransferService.runTransfer({
        departmentId: row.departmentId,
        adviserId: row.requesterId,
        actorName: requesterName,
        now,
        departmentName: deptName,
        yearLevels: row.yearLevels,
        ownerNoticeBody: `${requesterName} is now handling the ${deptName} queue — the transfer request timed out with no response.`,
      });
      await DepartmentTransferModel.update(row._id, {
        status: "AUTO_TRANSFERRED",
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
        `${deriveDepartmentCode(deptName)} transfer approved`,
        `The previous instructor didn't respond in time — you're now serving the ${deptName} queue.`,
      );
      affected.add(row.requesterId);
      affected.add(row.ownerId);
    }
    for (const userId of affected) publishToUser(userId, "transfer-requests");
    return expired.length;
  }
}
