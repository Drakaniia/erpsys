import { COLLECTIONS, getDbSync } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

export type AdminActionRow = {
  _id: string;
  actorId: string;
  action: string;
  targetRef: string;
  at: Date;
};

export class AdminActionLogModel {
  static async recent(limit: number): Promise<AdminActionRow[]> {
    return getDbSync()
      .collection<AdminActionRow>(COLLECTIONS.adminActionLog)
      .find({} as never)
      .sort({ at: -1 })
      .limit(limit)
      .toArray();
  }

  static async log(
    actorId: string,
    action: string,
    targetRef: string,
    reason?: string,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.adminActionLog)
      .insertOne({
        _id: genId("admin-action"),
        actorId,
        action,
        targetRef,
        ...(reason ? { reason } : {}),
        at: new Date(),
      } as never);
  }
}
