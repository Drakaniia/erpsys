import { NOTIFICATION_PAGE_SIZE } from "../../config/constants.js";
import { NotificationModel } from "../../models/NotificationModel.js";

export type NotificationWire = {
  id: string;
  type: string;
  title: string;
  body: string;
  action: { kind: string; label: string } | null;
  readAt: string | null;
  createdAt: string;
};

function readAction(
  action: { kind?: unknown; label?: unknown } | null | undefined,
): { kind: string; label: string } | null {
  if (!action || typeof action !== "object") return null;
  const { kind, label } = action;
  if (typeof kind !== "string" || typeof label !== "string") return null;
  return { kind, label };
}

export class NotificationService {
  static async listMine(userId: string): Promise<NotificationWire[]> {
    const rows = await NotificationModel.listRecent(
      userId,
      NOTIFICATION_PAGE_SIZE,
    );
    return rows.map((row) => ({
      id: String(row._id),
      type: row.type,
      title: row.title,
      body: row.body,
      action: readAction(row.action),
      readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  static async markAllRead(userId: string): Promise<{ count: number }> {
    return { count: await NotificationModel.markAllRead(userId, new Date()) };
  }
}
