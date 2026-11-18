import { ApiError } from "../config/errors.js";
import {
  departmentAcceptsLevel,
  deriveDepartmentCode,
  normalizeYearLevels,
  subtractYearLevels,
  yearLevelsOverlap,
  type YearLevel,
} from "../config/constants.js";
import { PRESENCE_STALE_MS, type TransferRow } from "../config/transfers.js";
import { genId } from "../lib/db/ids.js";
import { AdminActionLogModel } from "../models/AdminActionLogModel.js";
import { AdviserAvailabilityModel } from "../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { AcademicYearModel } from "../models/AcademicYearModel.js";
import { DepartmentModel } from "../models/DepartmentModel.js";
import { DepartmentTransferModel } from "../models/DepartmentTransferModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { NotificationModel } from "../models/NotificationModel.js";
import { UserModel } from "../models/UserModel.js";

export async function userName(userId: string): Promise<string> {
  return (await UserModel.findById(userId))?.name ?? "An instructor";
}

export async function deptNameOrThrow(departmentId: string): Promise<string> {
  const dept = await DepartmentModel.findById(departmentId);
  if (!dept) {
    throw new ApiError("NOT_FOUND", { message: "Department not found." });
  }
  return dept.name;
}

export async function notify(
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
}

export async function serialize(
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

export async function runTransfer(opts: {
  departmentId: string;
  adviserId: string;
  actorName: string;
  now: Date;
  departmentName: string;
  yearLevels?: readonly YearLevel[];
  ownerNoticeBody?: string;
}): Promise<string | null> {
  const requested = normalizeYearLevels(opts.yearLevels ?? []);
  const holders = (await AdviserDepartmentModel.listOtherHolders(opts.departmentId, opts.adviserId))
    .filter((holder) => yearLevelsOverlap(holder.yearLevels ?? [], requested));
  if (holders.length > 1) {
    throw new ApiError("CONFLICT", { message: "Request year levels from one instructor at a time." });
  }
  const owner = holders[0] ?? null;

  await AdviserDepartmentModel.deleteOthers(opts.adviserId, opts.departmentId);
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
      await EnrollmentQueueModel.releaseServingBy(opts.departmentId, owner.adviserId);
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
    await EnrollmentQueueModel.releaseServingBy(opts.departmentId, opts.adviserId);
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

  return owner ? userName(owner.adviserId) : null;
}

export async function listTransfers(userId: string) {
  const [incoming, outgoing, year] = await Promise.all([
    DepartmentTransferModel.listIncoming(userId),
    DepartmentTransferModel.listOutgoing(userId),
    AcademicYearModel.findActive(),
  ]);
  const all = [...incoming, ...outgoing];
  const ownerIds = [...new Set(all.map((row) => row.ownerId))];
  const activeOwners = year
    ? await Promise.all(
        ownerIds.map((ownerId) =>
          AdviserAvailabilityModel.isActive(
            ownerId,
            String(year._id),
            new Date(),
            PRESENCE_STALE_MS,
          ),
        ),
      )
    : [];
  const activeSet = new Set(ownerIds.filter((_, index) => activeOwners[index]));
  const names = new Map<string, string>();
  for (const row of all) {
    if (names.has(row.departmentId)) continue;
    names.set(
      row.departmentId,
      await deptNameOrThrow(row.departmentId).catch(() => "Department"),
    );
  }
  const shape = (rows: TransferRow[]) =>
    Promise.all(
      rows.map((row) =>
        serialize(row, activeSet, names.get(row.departmentId) ?? "Department"),
      ),
    );
  return { incoming: await shape(incoming), outgoing: await shape(outgoing) };
}

export async function resolveExpiredTransfers(
  now: Date = new Date(),
): Promise<number> {
  const expired = await DepartmentTransferModel.listExpired(now);
  for (const row of expired) {
    const latest = await DepartmentTransferModel.findById(String(row._id));
    if (latest?.status !== "PENDING") continue;
    const department = await DepartmentModel.findById(row.departmentId);
    const deptName = department?.name;
    const offered = (row.yearLevels ?? []).every((level) => departmentAcceptsLevel(department?.yearLevels ?? [], level));
    if (!deptName || !department?.isActive || !offered) {
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
      requesterLink !== null && (requested.length === 0
        ? normalizeYearLevels(requesterLink.yearLevels ?? []).length === 0
        : requested.every((level) => departmentAcceptsLevel(requesterLink.yearLevels ?? [], level)));
    const holders = await AdviserDepartmentModel.listOtherHolders(row.departmentId, row.requesterId);
    const conflictingOwners = holders.filter((holder) => yearLevelsOverlap(holder.yearLevels ?? [], requested));
    if (!stillOwner || requesterAlreadyOwns || conflictingOwners.length !== 1 || conflictingOwners[0].adviserId !== row.ownerId) {
      await DepartmentTransferModel.update(row._id, {
        status: "EXPIRED",
        resolvedAt: now,
      });
      continue;
    }
    const requesterName = await userName(row.requesterId);
    await runTransfer({
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
  }
  return expired.length;
}
