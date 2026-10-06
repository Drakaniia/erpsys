import type { Db } from "mongodb";
import { COLLECTIONS } from "./db.js";
import { genId } from "./ids.js";

type NotificationAction = { kind: string; label: string };

export async function notifyUser(
  db: Db,
  userId: string,
  type: string,
  title: string,
  body: string,
  options?: { action?: NotificationAction | null },
): Promise<void> {
  await db.collection(COLLECTIONS.notification).insertOne({
    _id: genId("notification"),
    userId,
    type,
    title,
    body,
    action: options?.action ?? null,
    createdAt: new Date(),
  } as never);
}
