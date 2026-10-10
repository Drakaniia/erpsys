import { COLLECTIONS, getDbSync } from "../lib/db/db.js";

export type NotificationRow = {
  _id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  action?: { kind?: unknown; label?: unknown } | null;
  readAt?: Date | null;
  createdAt: Date;
};

export class NotificationModel {
  static async listRecent(
    userId: string,
    limit: number,
  ): Promise<NotificationRow[]> {
    return getDbSync()
      .collection<NotificationRow>(COLLECTIONS.notification)
      .find({ userId } as never)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  static async markAllRead(userId: string, now: Date): Promise<number> {
    const result = await getDbSync()
      .collection<NotificationRow>(COLLECTIONS.notification)
      .updateMany(
        { userId, readAt: null } as never,
        {
          $set: { readAt: now },
        } as never,
      );
    return result.modifiedCount;
  }

  static async findLatestByType(
    userId: string,
    type: string,
  ): Promise<NotificationRow | null> {
    return getDbSync()
      .collection<NotificationRow>(COLLECTIONS.notification)
      .findOne({ userId, type } as never, { sort: { createdAt: -1 } });
  }

  static async updateById(
    id: string,
    patch: Partial<NotificationRow>,
  ): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.notification)
      .updateOne({ _id: id } as never, { $set: patch } as never);
  }

  static async insert(row: NotificationRow): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.notification)
      .insertOne(row as never);
  }

  static async insertMany(rows: NotificationRow[]): Promise<void> {
    if (rows.length === 0) return;
    await getDbSync()
      .collection<NotificationRow>(COLLECTIONS.notification)
      .insertMany(rows as never);
  }
}
