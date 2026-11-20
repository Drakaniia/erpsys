import type { Document, Filter, ObjectId } from "mongodb";
import { ApiError } from "../config/errors.js";
import { rawDb, type CollectionName } from "./db/db.js";

export type PresenceDocument = Document & { _id: string | ObjectId };
export type Editor = { userId: string; name: string; expiresAt: Date };
export type PresenceTarget = {
  collection: CollectionName;
  filter: Filter<PresenceDocument>;
  marker?: PresenceDocument;
};

type PresenceUser = { id: string; name?: string };
const TTL_MS = 30_000;

export function presenceOwner(editors: unknown, now = Date.now()): (Editor & { leaseId: string }) | undefined {
  if (!Array.isArray(editors)) return;
  return editors.find((entry) => entry && typeof entry.userId === "string"
    && typeof entry.name === "string" && typeof entry.leaseId === "string"
    && new Date(entry.expiresAt).getTime() > now);
}

async function updatePresence(
  target: PresenceTarget,
  leaseId: string,
  user: PresenceUser,
  join: boolean,
): Promise<Editor[]> {
  const collection = rawDb().collection<PresenceDocument>(target.collection);
  if (join && target.marker) {
    try {
      await collection.updateOne(target.filter, { $setOnInsert: { ...target.marker, activeEditors: [] } }, { upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  const now = new Date();
  const mine = {
    $and: [
      { $eq: ["$$editor.leaseId", { $literal: leaseId }] },
      { $eq: ["$$editor.userId", { $literal: user.id }] },
    ],
  };
  const live = {
    $filter: {
      input: { $ifNull: ["$activeEditors", []] },
      as: "editor",
      cond: { $gt: ["$$editor.expiresAt", now] },
    },
  };
  const renewed = {
    userId: user.id,
    name: user.name?.trim() || "Staff member",
    leaseId,
    expiresAt: new Date(now.getTime() + TTL_MS),
  };
  const existing = { $filter: { input: live, as: "editor", cond: mine } };
  const activeEditors = join
    ? {
        $slice: [{
          $concatArrays: [
            { $map: { input: live, as: "editor", in: { $cond: [mine, { $literal: renewed }, "$$editor"] } } },
            { $cond: [{ $eq: [existing, []] }, { $literal: [renewed] }, []] },
          ],
        }, 100],
      }
    : { $filter: { input: live, as: "editor", cond: { $not: [mine] } } };
  const row = await collection.findOneAndUpdate(
    target.filter,
    [{ $set: { activeEditors } }],
    { returnDocument: "after", projection: { activeEditors: 1 } },
  );
  if (!row) throw new ApiError("NOT_FOUND", { message: "Presence target not found." });
  const owner = presenceOwner(row.activeEditors, now.getTime());
  if (!owner || (owner.userId === user.id && owner.leaseId === leaseId)) return [];
  return [{ userId: owner.userId, name: owner.name, expiresAt: owner.expiresAt }];
}

export function touchPresence(target: PresenceTarget, leaseId: string, user: PresenceUser): Promise<Editor[]> {
  return updatePresence(target, leaseId, user, true);
}

export function leavePresence(target: PresenceTarget, leaseId: string, user: PresenceUser): Promise<Editor[]> {
  return updatePresence(target, leaseId, user, false);
}
