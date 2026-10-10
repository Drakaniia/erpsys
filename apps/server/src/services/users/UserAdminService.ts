import { hashPassword } from "better-auth/crypto";
import { ApiError } from "../../config/errors.js";
import { COLLECTIONS, getDbSync, idIn, refIn } from "../../lib/db/db.js";
import { AdminActionLogModel } from "../../models/AdminActionLogModel.js";

export const LEVER_ROLES = ["STUDENT", "SBO_OFFICER"] as const;
export type LeverRole = (typeof LEVER_ROLES)[number];

type TargetRow = { _id: string; name: string; email?: string; role: string };

const users = () => getDbSync().collection<TargetRow>(COLLECTIONS.user);

export class UserAdminService {
  static async setRole(
    actorId: string,
    userId: string,
    role: LeverRole,
  ): Promise<{ userId: string; role: LeverRole }> {
    const target = await users().findOne(idIn([userId]) as never);
    if (!target)
      throw new ApiError("NOT_FOUND", { message: "User not found." });

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
    if (target.role === role) return { userId: String(target._id), role };

    await users().updateOne(
      { _id: target._id } as never,
      {
        $set: { role },
      } as never,
    );
    await AdminActionLogModel.log(
      actorId,
      role === "SBO_OFFICER" ? "Promoted" : "Demoted",
      `${target.name} ${role === "SBO_OFFICER" ? "to SBO Officer" : "to Student"}`,
    );
    return { userId: String(target._id), role };
  }

  static async setRoleBulk(
    actorId: string,
    userIds: string[],
    role: LeverRole,
  ): Promise<{ updated: number; skipped: string[] }> {
    if (userIds.length === 0) return { updated: 0, skipped: [] };

    const targets = await users()
      .find(idIn(userIds) as never, { projection: { name: 1, role: 1 } })
      .toArray();
    const expected = role === "SBO_OFFICER" ? "STUDENT" : "SBO_OFFICER";
    const skipped: string[] = [];
    const eligible: string[] = [];
    for (const target of targets) {
      if (
        target.role !== expected ||
        (role === "STUDENT" && String(target._id) === actorId)
      ) {
        skipped.push(String(target._id));
      } else {
        eligible.push(target._id);
      }
    }

    if (eligible.length > 0) {
      await users().updateMany(
        { _id: refIn(eligible.map(String)) } as never,
        {
          $set: { role },
        } as never,
      );
      await AdminActionLogModel.log(
        actorId,
        role === "SBO_OFFICER" ? "Bulk promoted" : "Bulk demoted",
        `${eligible.length} student${eligible.length === 1 ? "" : "s"}`,
      );
    }
    return { updated: eligible.length, skipped };
  }

  static async resetPassword(
    actorId: string,
    userId: string,
    newPassword: string,
  ): Promise<{ success: true; message: string }> {
    if (userId === actorId) {
      throw new ApiError("FORBIDDEN", {
        message: "You cannot reset your own password through this interface.",
      });
    }

    const target = await users().findOne({ _id: userId } as never);
    if (!target)
      throw new ApiError("NOT_FOUND", { message: "User not found." });
    if (target.role !== "STUDENT") {
      throw new ApiError("FORBIDDEN", {
        message: "Password reset is only available for student accounts.",
      });
    }

    const db = getDbSync();
    const hash = await hashPassword(newPassword);
    await db
      .collection(COLLECTIONS.account)
      .deleteMany({ userId, providerId: "credential" } as never);
    await db.collection(COLLECTIONS.account).insertOne({
      _id: crypto.randomUUID(),
      userId,
      providerId: "credential",
      accountId: userId,
      password: hash,
    } as never);
    await AdminActionLogModel.log(
      actorId,
      "PASSWORD_RESET",
      `User:${userId}`,
      `Password reset for ${target.email ?? target.name}`,
    );

    return {
      success: true,
      message: `Password reset successfully for ${target.name}.`,
    };
  }
}
