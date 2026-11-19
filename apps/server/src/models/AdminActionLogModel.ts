import { COLLECTIONS, getDbSync } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

type AdminActionRow = {
  _id: string;
  actorId: string;
  action: string;
  targetRef: string;
  createdAt: Date;
  updatedAt: Date;
};

export class AdminActionLogModel {
  static async recent(limit: number): Promise<AdminActionRow[]> {
    return getDbSync()
      .collection<AdminActionRow>(COLLECTIONS.auditLog)
      .find({ action: { $exists: true } } as never)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async log(
    actorId: string,
    action: string,
    targetRef: string,
    reason?: string,
  ): Promise<void> {
    const at = new Date();
    await getDbSync()
      .collection(COLLECTIONS.auditLog)
      .insertOne({
        _id: genId("admin-action"),
        kind: "action",
        actorId,
        action,
        targetRef,
        ...(reason ? { reason } : {}),
        createdAt: at,
        updatedAt: at,
      } as never);
  }
}
