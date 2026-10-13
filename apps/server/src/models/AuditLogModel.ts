import { COLLECTIONS, getDbSync } from "../lib/db/db.js";
import { genId } from "../lib/db/ids.js";

export type AuditLogRow = {
  _id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  role: string;
  method: string;
  path: string;
  status: number;
  ip: string;
  at: Date;
};

export class AuditLogModel {
  static async insert(row: Omit<AuditLogRow, "_id" | "at">): Promise<void> {
    await getDbSync()
      .collection(COLLECTIONS.auditLog)
      .insertOne({ _id: genId("audit"), ...row, at: new Date() } as never);
  }

  static async search(
    filter: Record<string, unknown>,
    paging: { page: number; pageSize: number },
  ): Promise<AuditLogRow[]> {
    return getDbSync()
      .collection<AuditLogRow>(COLLECTIONS.auditLog)
      .find(filter as never)
      .sort({ at: -1 })
      .skip((paging.page - 1) * paging.pageSize)
      .limit(paging.pageSize)
      .toArray();
  }

  static async count(filter: Record<string, unknown>): Promise<number> {
    return getDbSync()
      .collection<AuditLogRow>(COLLECTIONS.auditLog)
      .countDocuments(filter as never);
  }
}
