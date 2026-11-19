import { COLLECTIONS, getDbSync } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

type AuditLogRow = {
  _id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  role: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  createdAt: Date;
  updatedAt: Date;
};

export class AuditLogModel {
  static async insert(
    row: Omit<AuditLogRow, "_id" | "createdAt" | "updatedAt">,
  ): Promise<void> {
    const at = new Date();
    await getDbSync()
      .collection(COLLECTIONS.auditLog)
      .insertOne({
        _id: genId("audit"),
        kind: "http",
        ...row,
        createdAt: at,
        updatedAt: at,
      } as never);
  }

  static async search(
    filter: Record<string, unknown>,
    paging: { page: number; pageSize: number },
  ): Promise<AuditLogRow[]> {
    return getDbSync()
      .collection<AuditLogRow>(COLLECTIONS.auditLog)
      .find({ ...filter, kind: { $ne: "action" } } as never)
      .sort({ createdAt: -1 })
      .skip((paging.page - 1) * paging.pageSize)
      .limit(paging.pageSize)
      .toArray();
  }

  static async count(filter: Record<string, unknown>): Promise<number> {
    return getDbSync()
      .collection<AuditLogRow>(COLLECTIONS.auditLog)
      .countDocuments({ ...filter, kind: { $ne: "action" } } as never);
  }
}
