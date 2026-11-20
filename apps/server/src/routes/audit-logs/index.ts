import { Router } from "express";
import { z } from "zod";
import { escapeQueryRegex } from "../../config/queue.js";
import { AUDITED_METHODS } from "../../middleware/audit.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okList, parsePagination, parseQuery } from "../../middleware/http.js";
import { AuditLogModel } from "../../models/AuditLogModel.js";

/**
 * `/api/v1` — the system-wide audit trail of every signed-in write; admin-only.
 */
export const auditLogsRouter = Router();

const filterQuery = z.object({
  role: z.string().trim().max(40).optional(),
  method: z.enum(AUDITED_METHODS).optional(),
  q: z.string().trim().max(200).optional(),
});

/**
 * `GET /api/v1/audit-logs`
 * Access: session + admin surface.
 * Use: page through recorded POST/PUT/PATCH/DELETE calls, newest first —
 * query `role?`, `method?`, `q?` (actor name, email or path), `page`,
 * `pageSize`.
 * Returns: `{ data, page, pageSize, total }`.
 */
auditLogsRouter.get(
  "/audit-logs",
  requireSession,
  requireSurface("admin"),
  catchAsync(async (req, res) => {
    const input = parseQuery(filterQuery, req);
    const paging = parsePagination(req);
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
    okList(
      res,
      rows.map((row) => ({
        id: String(row._id),
        actorId: row.actorId,
        actorName: row.actorName,
        actorEmail: row.actorEmail,
        role: row.role,
        method: row.method,
        path: row.path,
        status: row.status,
        ip: row.ip,
        at: new Date(row.createdAt).toISOString(),
      })),
      paging.page,
      paging.pageSize,
      total,
    );
  }),
);
