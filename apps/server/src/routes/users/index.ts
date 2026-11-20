import { hashPassword } from "better-auth/crypto";
import { Router } from "express";
import { z } from "zod";
import { inviteAccount } from "../../config/auth.js";
import { YEAR_LEVELS } from "../../config/constants.js";
import { newPasswordSchema } from "../../config/password.js";
import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn, refIn } from "../../lib/db/db.js";
import { purgeUserById } from "../../lib/db/user-purge.js";
import { outsideTransaction } from "../../lib/db/timestamp-ordering.js";
import {
  requireSession,
  requireStepUp,
  requireSurface,
  sessionUser,
} from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";
import { removeCalendarData } from "../../services/calendar.js";
import { userDirectoryPage } from "../../services/users.js";

/**
 * `/api/v1` — the admin user table: bulk verbs on the collection, the rest on
 * `/:userId`.
 */
export const usersRouter = Router();

const admin = [requireSession, requireSurface("admin")];
const userIdParams = z.object({ userId: z.string().min(1) });
const userIds = z.array(z.string().min(1)).max(500);
const leverRole = z.enum(["STUDENT", "SBO_OFFICER"]);
const listQuery = z.object({
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
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

type Target = {
  _id: string;
  name: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  blockedAt?: Date | null;
};

const users = () => getDbSync().collection<Target>(COLLECTIONS.user);
const notFound = () =>
  new ApiError("NOT_FOUND", { message: "User not found." });

type DeleteSkip = "SELF" | "LAST_ADMIN" | "BLOCKED" | "NOT_FOUND";

async function protectDeletion(
  target: Target,
  actorId: string,
): Promise<DeleteSkip | null> {
  const userId = String(target._id);
  if (userId === actorId) return "SELF";
  if (target.role !== "ADMIN") return null;

  const db = getDbSync();
  const session = db.client.startSession();
  try {
    return await outsideTransaction(() =>
      session.withTransaction(async () => {
        const accounts = db.collection<Target>(COLLECTIONS.user);
        await accounts.updateMany(
          { role: "ADMIN" },
          { $inc: { adminDeletionVersion: 1 } },
          { session },
        );
        const current = await accounts.findOne(idIn([userId]) as never, {
          session,
        });
        if (!current) return "NOT_FOUND";
        if (!target.blockedAt && current.blockedAt) return "BLOCKED";
        const survivor = await accounts.findOne(
          {
            role: "ADMIN",
            blockedAt: null,
            _id: { $nin: refIn([userId]).$in },
          } as never,
          { session },
        );
        if (!survivor) return "LAST_ADMIN";
        if (!current.blockedAt) {
          await accounts.updateOne(
            { _id: current._id } as never,
            { $set: { blockedAt: new Date() } },
            { session },
          );
        }
        return null;
      }),
    );
  } finally {
    await session.endSession();
  }
}

async function profileIds(actor: unknown): Promise<string[]> {
  const owners = await getDbSync()
    .collection<{ studentProfile?: { _id: string } }>(COLLECTIONS.user)
    .find({ _id: actor } as never, { projection: { studentProfile: 1 } })
    .toArray();
  return owners.flatMap((owner) =>
    owner.studentProfile ? [String(owner.studentProfile._id)] : [],
  );
}

async function hasActivity(userId: string): Promise<boolean> {
  const db = getDbSync();
  const actor = refIn([userId]);
  const inProfiles = { studentProfileId: refIn(await profileIds(actor)) };
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
      .collection(COLLECTIONS.department)
      .countDocuments({
        advisers: { $elemMatch: { adviserId: actor } },
      } as never),
    db
      .collection(COLLECTIONS.adviserSchedule)
      .countDocuments({ kind: "presence", adviserId: actor } as never),
    db
      .collection(COLLECTIONS.notification)
      .countDocuments({ userId: actor } as never),
    db
      .collection(COLLECTIONS.adminActionLog)
      .countDocuments({ actorId: actor } as never),
    db
      .collection(COLLECTIONS.chatbotKnowledge)
      .countDocuments({ updatedById: actor } as never),
  ]);
  return counts.some((count) => count > 0);
}

async function disableAccount(target: Target): Promise<void> {
  const db = getDbSync();
  const actor = refIn([String(target._id)]);
  await users().updateOne(
    { _id: target._id } as never,
    { $set: { blockedAt: new Date() } } as never,
  );
  await db
    .collection(COLLECTIONS.session)
    .deleteMany({ userId: actor } as never);
  await db.collection(COLLECTIONS.enrollmentQueue).deleteMany({
    studentProfileId: refIn(await profileIds(actor)),
  } as never);
  await db.collection(COLLECTIONS.adviserSchedule).updateMany(
    { kind: "presence", adviserId: actor, isOpen: true } as never,
    {
      $set: { isOpen: false, closedAt: new Date(), autoClosedAt: null },
    } as never,
  );
  await db.collection(COLLECTIONS.enrollmentQueue).updateMany(
    { servedById: actor, status: "IN_PROGRESS" } as never,
    {
      $set: { status: "WAITING", servedById: null, servedAt: null },
    } as never,
  );
}

async function hardDeleteAccount(target: Target): Promise<void> {
  await purgeUserById(getDbSync(), String(target._id));
}

/**
 * `GET /api/v1/users`
 * Access: session + admin surface.
 * Use: user table with filters and paging.
 * Returns: `{ data, page, pageSize, total }`.
 */
usersRouter.get(
  "/users",
  admin,
  catchAsync(async (req, res) => {
    const input = parseQuery(listQuery, req);
    const { items, total } = await userDirectoryPage(input);
    okList(res, items, input.page, input.pageSize, total);
  }),
);

/**
 * `POST /api/v1/users/invite`
 * Access: session + admin surface.
 * Concurrency: duplicate email rejected by unique index; no overwrite.
 * Use: provision an account and email a one-time setup link — body `{ name, email }`.
 * Returns: `201` with `{ data: { userId } }`.
 */
usersRouter.post(
  "/users/invite",
  admin,
  catchAsync(async (req, res) => {
    const { name, email } = parseBody(
      z.object({
        name: z.string().trim().min(1).max(100),
        email: z.string().trim().max(254).email().toLowerCase(),
      }),
      req,
    );
    const userId = await inviteAccount(name, email);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Invited account",
      `User:${userId}`,
    );
    okOne(res, { userId }, 201);
  }),
);

/**
 * `POST /api/v1/users/:userId/promote-admin`
 * Access: session + admin surface (step-up required).
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: grant admin access to an active account with verified email and revoke its sessions.
 * Returns: `{ data: { userId, role } }`.
 */
usersRouter.post(
  "/users/:userId/promote-admin",
  admin,
  requireStepUp,
  catchAsync(async (req, res) => {
    const { userId } = parseQuery(userIdParams, req);
    const target = await users().findOne(idIn([userId]) as never);
    if (!target) throw notFound();
    const eligible = ["STUDENT", "SBO_OFFICER", "ENROLLMENT_ADVISER"];
    if (
      !eligible.includes(target.role) ||
      target.blockedAt ||
      target.emailVerified !== true
    ) {
      throw new ApiError("CONFLICT", {
        message:
          "Only active non-admin accounts with a verified email can be promoted to admin.",
      });
    }
    const { matchedCount } = await users().updateOne(
      {
        _id: target._id,
        role: target.role,
        emailVerified: true,
        blockedAt: null,
      } as never,
      { $set: { role: "ADMIN" } },
    );
    if (!matchedCount) {
      throw new ApiError("CONFLICT", {
        message: "The account changed. Refresh and try again.",
      });
    }
    await getDbSync()
      .collection(COLLECTIONS.session)
      .deleteMany({ userId: refIn([userId]) } as never);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Promoted to admin",
      `User:${userId}`,
    );
    okOne(res, { userId, role: "ADMIN" });
  }),
);

/**
 * `POST /api/v1/users/:userId/reactivate`
 * Access: session + admin surface (step-up required).
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Concurrency: conditional blockedAt update permits one reactivation; changed account → `409`.
 * Use: reactivate a disabled account without changing its role or records; revoke sessions for fresh sign-in.
 * Returns: `{ data: { userId } }`.
 */
usersRouter.post(
  "/users/:userId/reactivate",
  admin,
  requireStepUp,
  catchAsync(async (req, res) => {
    const { userId } = parseQuery(userIdParams, req);
    const target = await users().findOne(idIn([userId]) as never);
    if (!target) throw notFound();
    if (!target.blockedAt) {
      throw new ApiError("CONFLICT", {
        message: "Only disabled accounts can be reactivated.",
      });
    }
    const { matchedCount } = await users().updateOne(
      { _id: target._id, blockedAt: target.blockedAt } as never,
      { $set: { blockedAt: null } },
    );
    if (!matchedCount) {
      throw new ApiError("CONFLICT", {
        message: "The account changed. Refresh and try again.",
      });
    }
    await getDbSync()
      .collection(COLLECTIONS.session)
      .deleteMany({ userId: refIn([userId]) } as never);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Reactivated account",
      `User:${userId}`,
    );
    okOne(res, { userId: String(target._id) });
  }),
);

/**
 * `PATCH /api/v1/users`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: change roles in bulk — body `{ userIds, role }`.
 * Returns: `{ data: update result }`.
 */
usersRouter.patch(
  "/users",
  admin,
  catchAsync(async (req, res) => {
    const input = parseBody(z.object({ userIds, role: leverRole }), req);
    const actorId = sessionUser(req).id;
    if (input.userIds.length === 0) {
      return okOne(res, { updated: 0, skipped: [] });
    }
    const targets = await users()
      .find(idIn(input.userIds) as never, { projection: { name: 1, role: 1 } })
      .toArray();
    const expected = input.role === "SBO_OFFICER" ? "STUDENT" : "SBO_OFFICER";
    const skipped: string[] = [];
    const eligible: string[] = [];
    for (const target of targets) {
      const id = String(target._id);
      if (
        target.role !== expected ||
        (input.role === "STUDENT" && id === actorId)
      ) {
        skipped.push(id);
      } else {
        eligible.push(id);
      }
    }
    if (eligible.length > 0) {
      await users().updateMany(
        { _id: refIn(eligible) } as never,
        { $set: { role: input.role } } as never,
      );
      await AdminActionLogModel.log(
        actorId,
        input.role === "SBO_OFFICER" ? "Bulk promoted" : "Bulk demoted",
        `${eligible.length} student${eligible.length === 1 ? "" : "s"}`,
      );
    }
    okOne(res, { updated: eligible.length, skipped });
  }),
);

/**
 * `DELETE /api/v1/users`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Concurrency: admin removals reserve a disabled account in a Mongo transaction; shared admin writes serialize survivor checks.
 * Use: delete up to 500 accounts — body `{ userIds }`; skip self and preserve an active admin.
 * Returns: `{ data: { hardDeleted, blocked, skipped } }`; skip reasons `SELF`, `LAST_ADMIN`, `BLOCKED`, `NOT_FOUND`.
 */
usersRouter.delete(
  "/users",
  admin,
  catchAsync(async (req, res) => {
    const { userIds: requestedIds } = parseBody(z.object({ userIds }), req);
    const ids = [...new Set(requestedIds)];
    const actorId = sessionUser(req).id;
    const hardDeleted: string[] = [];
    const blocked: string[] = [];
    const skipped: Array<{
      userId: string;
      reason: DeleteSkip;
    }> = [];
    if (ids.length === 0) return okOne(res, { hardDeleted, blocked, skipped });

    const targets = await users()
      .find(idIn(ids) as never)
      .toArray();
    const byId = new Map(targets.map((target) => [String(target._id), target]));
    for (const id of ids) {
      const target = byId.get(id);
      if (!target) skipped.push({ userId: id, reason: "NOT_FOUND" });
      else if (id === actorId) skipped.push({ userId: id, reason: "SELF" });
      else if (target.blockedAt)
        skipped.push({ userId: id, reason: "BLOCKED" });
      else {
        const reason = await protectDeletion(target, actorId);
        if (reason) {
          skipped.push({ userId: id, reason });
          continue;
        }
        await removeCalendarData(id);
        if (await hasActivity(id)) {
          await disableAccount(target);
          blocked.push(id);
        } else {
          await hardDeleteAccount(target);
          hardDeleted.push(id);
        }
      }
    }

    if (ids.length > 1) {
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
      for (const id of hardDeleted) {
        await AdminActionLogModel.log(actorId, "Deleted account", `User:${id}`);
      }
      for (const id of blocked) {
        await AdminActionLogModel.log(
          actorId,
          "Disabled account",
          `User:${id}`,
        );
      }
    }
    okOne(res, { hardDeleted, blocked, skipped });
  }),
);

/**
 * `PATCH /api/v1/users/:userId`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set one role — body `{ role }`.
 * Returns: `{ data: user }`.
 */
usersRouter.patch(
  "/users/:userId",
  admin,
  catchAsync(async (req, res) => {
    const { userId } = parseQuery(userIdParams, req);
    const { role } = parseBody(z.object({ role: leverRole }), req);
    const actorId = sessionUser(req).id;
    const target = await users().findOne(idIn([userId]) as never);
    if (!target) throw notFound();
    if (target.role !== "STUDENT" && target.role !== "SBO_OFFICER") {
      throw new ApiError("CONFLICT", {
        message:
          "This role is derived from the email domain — it cannot be changed here.",
      });
    }
    if (role === "STUDENT" && String(target._id) === actorId) {
      throw new ApiError("FORBIDDEN", {
        message: "You cannot demote yourself.",
      });
    }
    if (target.role !== role) {
      await users().updateOne(
        { _id: target._id } as never,
        { $set: { role } } as never,
      );
      await AdminActionLogModel.log(
        actorId,
        role === "SBO_OFFICER" ? "Promoted" : "Demoted",
        `${target.name} ${role === "SBO_OFFICER" ? "to SBO Officer" : "to Student"}`,
      );
    }
    okOne(res, { userId: String(target._id), role });
  }),
);

/**
 * `DELETE /api/v1/users/:userId`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Concurrency: admin survivor checks serialize through shared admin writes in a Mongo transaction.
 * Use: purge one blocked account and its records; reject self and preserve an active admin.
 * Returns: `{ data: purge result }`.
 */
usersRouter.delete(
  "/users/:userId",
  admin,
  catchAsync(async (req, res) => {
    const { userId } = parseQuery(userIdParams, req);
    const target = await users().findOne(idIn([userId]) as never);
    if (!target) throw notFound();
    if (String(target._id) === sessionUser(req).id) {
      throw new ApiError("FORBIDDEN", {
        message: "You cannot delete yourself.",
      });
    }
    if (!target.blockedAt) {
      throw new ApiError("CONFLICT", {
        message:
          "Only blocked accounts can be permanently deleted. Use Delete instead.",
      });
    }
    const reason = await protectDeletion(target, sessionUser(req).id);
    if (reason) {
      throw new ApiError("FORBIDDEN", {
        message:
          reason === "LAST_ADMIN"
            ? "The last active admin cannot be deleted."
            : "This account can no longer be deleted. Reload and try again.",
      });
    }
    await removeCalendarData(userId);
    await purgeUserById(getDbSync(), userId);
    console.log(`[admin] purged account ${userId}`);
    await AdminActionLogModel.log(
      sessionUser(req).id,
      "Permanently deleted account",
      `User:${target._id}`,
    );
    okOne(res, { userId: String(target._id) });
  }),
);

/**
 * `POST /api/v1/users/:userId/password-reset`
 * Access: session + admin surface.
 * Concurrency: timestamp ordering — optional body `ts`; stale → `409` `TS_ABORTED`.
 * Use: set a new password — body `{ newPassword }`, 12–128 characters, uppercase and lowercase.
 * Returns: `{ data: reset result }`.
 */
usersRouter.post(
  "/users/:userId/password-reset",
  admin,
  catchAsync(async (req, res) => {
    const { userId } = parseQuery(userIdParams, req);
    const { newPassword } = parseBody(
      z.object({ newPassword: newPasswordSchema }),
      req,
    );
    const actorId = sessionUser(req).id;
    if (userId === actorId) {
      throw new ApiError("FORBIDDEN", {
        message: "You cannot reset your own password through this interface.",
      });
    }
    const target = await users().findOne(idIn([userId]) as never);
    if (!target) throw notFound();
    if (target.role !== "STUDENT") {
      throw new ApiError("FORBIDDEN", {
        message: "Password reset is only available for student accounts.",
      });
    }
    const accounts = getDbSync().collection(COLLECTIONS.account);
    const hash = await hashPassword(newPassword);
    await accounts.deleteMany({
      userId: refIn([userId]),
      providerId: "credential",
    } as never);
    await accounts.insertOne({
      _id: crypto.randomUUID(),
      userId: target._id,
      providerId: "credential",
      accountId: String(target._id),
      password: hash,
    } as never);
    await AdminActionLogModel.log(
      actorId,
      "PASSWORD_RESET",
      `User:${userId}`,
      `Password reset for ${target.email ?? target.name}`,
    );
    okOne(res, {
      success: true,
      message: `Password reset successfully for ${target.name}.`,
    });
  }),
);
