import { escapeQueryRegex } from "../../config/queue.js";
import {
  AuditLogModel,
  type AuditLogRow,
} from "../../models/AuditLogModel.js";

export const AUDITED_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

export type AuditFilter = {
  role?: string;
  method?: (typeof AUDITED_METHODS)[number];
  q?: string;
};

export class AuditLogService {
  static async record(row: Omit<AuditLogRow, "_id" | "at">): Promise<void> {
    await AuditLogModel.insert(row);
  }

  static async list(
    input: AuditFilter,
    paging: { page: number; pageSize: number },
  ) {
    const filter: Record<string, unknown> = {};
    if (input.role) filter.role = input.role;
    if (input.method) filter.method = input.method;
    if (input.q) {
      const pattern = { $regex: escapeQueryRegex(input.q), $options: "i" };
      filter.$or = [
        { actorName: pattern },
        { actorEmail: pattern },
        { path: pattern },
      ];
    }
    const [rows, total] = await Promise.all([
      AuditLogModel.search(filter, paging),
      AuditLogModel.count(filter),
    ]);
    return {
      total,
      rows: rows.map((row) => ({
        id: String(row._id),
        actorId: row.actorId,
        actorName: row.actorName,
        actorEmail: row.actorEmail,
        role: row.role,
        method: row.method,
        path: row.path,
        status: row.status,
        ip: row.ip,
        at: new Date(row.at).toISOString(),
      })),
    };
  }
}
