import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn, refIn } from "../../lib/db/db.js";
import { purgeUserById } from "../../lib/db/user-purge.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { CalendarDisconnectService } from "../calendar/CalendarDisconnectService.js";

export type SkippedUser = {
  userId: string;
  reason: "ADMIN" | "BLOCKED" | "NOT_FOUND";
};

type DeleteTarget = {
  _id: string;
  name: string;
  email: string;
  role: string;
  blockedAt?: Date | null;
};

async function hasActivity(userId: string): Promise<boolean> {
  const db = getDbSync();
  const profiles = await db
    .collection<{ _id: string }>(COLLECTIONS.studentProfile)
    .find({ userId: refIn([userId]) } as never, { projection: { _id: 1 } })
    .toArray();
  const inProfiles = {
    studentProfileId: { $in: profiles.map((p) => p._id) },
  };
  const actor = refIn([userId]);

  const counts = await Promise.all([
    db.collection(COLLECTIONS.stepVerification).countDocuments({
      $or: [
        inProfiles,
        { verifiedById: actor },
        { respondedById: actor },
        { revokedById: actor },
      ],
    } as never),
    db.collection(COLLECTIONS.upload).countDocuments({
      $or: [inProfiles, { uploadedById: actor }],
    } as never),
    db.collection(COLLECTIONS.enrollmentQueue).countDocuments({
      $or: [inProfiles, { servedById: actor }, { movedToEndById: actor }],
    } as never),
    db
      .collection(COLLECTIONS.adviserDepartment)
      .countDocuments({ adviserId: actor } as never),
    db
      .collection(COLLECTIONS.adviserAvailability)
      .countDocuments({ adviserId: actor } as never),
    db.collection(COLLECTIONS.notification).countDocuments({
      userId: actor,
    } as never),
    db
      .collection(COLLECTIONS.adminActionLog)
      .countDocuments({ actorId: actor } as never),
    db
      .collection(COLLECTIONS.chatbotKnowledge)
      .countDocuments({ updatedById: actor } as never),
  ]);
  return counts.reduce((sum, count) => sum + count, 0) > 0;
}

async function disableAccount(target: DeleteTarget): Promise<void> {
  const db = getDbSync();
  const id = String(target._id);
  const actor = refIn([id]);

  await db.collection(COLLECTIONS.user).updateOne(
    { _id: target._id } as never,
    {
      $set: { blockedAt: new Date() },
    } as never,
  );
  await db
    .collection(COLLECTIONS.session)
    .deleteMany({ userId: actor } as never);
  const profiles = await db
    .collection<{ _id: string }>(COLLECTIONS.studentProfile)
    .find({ userId: actor } as never, { projection: { _id: 1 } })
    .toArray();
  await db.collection(COLLECTIONS.enrollmentQueue).deleteMany({
    studentProfileId: { $in: profiles.map((p) => String(p._id)) },
  } as never);
  await db.collection(COLLECTIONS.adviserAvailability).updateMany(
    { adviserId: actor, isOpen: true } as never,
    {
      $set: { isOpen: false, closedAt: new Date(), autoClosedAt: null },
    } as never,
  );
  await db.collection(COLLECTIONS.enrollmentQueue).updateMany(
    { servedById: actor, status: "IN_PROGRESS" } as never,
    { $set: { status: "WAITING", servedById: null, servedAt: null } } as never,
  );
}

async function hardDeleteAccount(target: DeleteTarget): Promise<void> {
  const db = getDbSync();
  const id = String(target._id);
  const actor = refIn([id]);

  await db
    .collection(COLLECTIONS.notification)
    .deleteMany({ userId: actor } as never);
  await db
    .collection(COLLECTIONS.verification)
    .deleteMany({ identifier: target.email } as never);
  const profiles = await db
    .collection<{ _id: string }>(COLLECTIONS.studentProfile)
    .find({ userId: actor } as never, { projection: { _id: 1 } })
    .toArray();
  const profileIds = profiles.map((p) => String(p._id));
  await db
    .collection(COLLECTIONS.studentEnrollment)
    .deleteMany({ studentProfileId: { $in: profileIds } } as never);
  await db
    .collection(COLLECTIONS.studentProfile)
    .deleteMany({ userId: actor } as never);
  await db.collection(COLLECTIONS.user).deleteOne({ _id: target._id } as never);
}

export class UserDeletionService {
  static async deleteBulk(
    actorId: string,
    userIds: string[],
  ): Promise<{
    hardDeleted: string[];
    blocked: string[];
    skipped: SkippedUser[];
  }> {
    if (userIds.length === 0)
      return { hardDeleted: [], blocked: [], skipped: [] };

    const targets = await getDbSync()
      .collection<DeleteTarget>(COLLECTIONS.user)
      .find(idIn(userIds) as never)
      .toArray();
    const byId = new Map(targets.map((target) => [String(target._id), target]));

    const hardDeleted: string[] = [];
    const blocked: string[] = [];
    const skipped: SkippedUser[] = [];

    for (const id of userIds) {
      const target = byId.get(id);
      if (!target) {
        skipped.push({ userId: id, reason: "NOT_FOUND" });
        continue;
      }
      if (target.role === "ADMIN") {
        skipped.push({ userId: id, reason: "ADMIN" });
        continue;
      }
      if (target.blockedAt) {
        skipped.push({ userId: id, reason: "BLOCKED" });
        continue;
      }
      await CalendarDisconnectService.removeAll(id);
      if (await hasActivity(id)) {
        await disableAccount(target);
        blocked.push(id);
      } else {
        await hardDeleteAccount(target);
        hardDeleted.push(id);
      }
    }

    if (userIds.length > 1) {
      if (hardDeleted.length > 0) {
        await AdminActionLogModel.log(
          actorId,
          "Bulk deleted",
          `${hardDeleted.length} account(s)`,
        );
      }
      if (blocked.length > 0) {
        await AdminActionLogModel.log(
          actorId,
          "Bulk disabled",
          `${blocked.length} account(s)`,
        );
      }
    } else {
      for (const id of hardDeleted)
        await AdminActionLogModel.log(actorId, "Deleted account", `User:${id}`);
      for (const id of blocked)
        await AdminActionLogModel.log(
          actorId,
          "Disabled account",
          `User:${id}`,
        );
    }

    return { hardDeleted, blocked, skipped };
  }

  static async purge(
    actorId: string,
    userId: string,
  ): Promise<{ userId: string }> {
    const target = await getDbSync()
      .collection<DeleteTarget>(COLLECTIONS.user)
      .findOne(idIn([userId]) as never);
    if (!target)
      throw new ApiError("NOT_FOUND", { message: "User not found." });
    if (target.role === "ADMIN") {
      throw new ApiError("FORBIDDEN", {
        message: "Admin accounts cannot be deleted.",
      });
    }
    if (!target.blockedAt) {
      throw new ApiError("CONFLICT", {
        message:
          "Only blocked accounts can be permanently deleted. Use Delete instead.",
      });
    }

    await CalendarDisconnectService.removeAll(userId);
    await purgeUserById(getDbSync(), userId);
    console.log(`[admin] purged account ${userId}`);
    await AdminActionLogModel.log(
      actorId,
      "Permanently deleted account",
      `User:${target._id}`,
    );
    return { userId: String(target._id) };
  }
}
