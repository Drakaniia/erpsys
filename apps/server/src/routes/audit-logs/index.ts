import { Router } from "express";
import { auditLogsController } from "../../controllers/audit-logs/AuditLogsController.js";
import { requireSession, requireSurface } from "../../middleware/auth.js";

/**
 * `/api/v1` — the system-wide audit trail of every signed-in write; admin-only.
 */
export const auditLogsRouter = Router();

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
  auditLogsController.list,
);
