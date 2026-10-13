import type { RequestHandler } from "express";
import { logPath } from "../lib/platform/request-log.js";
import {
  AUDITED_METHODS,
  AuditLogService,
} from "../services/audit-logs/AuditLogService.js";
import type { AuthedRequest } from "../services/auth/AuthService.js";

const audited = new Set<string>(AUDITED_METHODS);

export const auditTrail: RequestHandler = (req, res, next) => {
  if (!audited.has(req.method)) return next();
  res.on("finish", () => {
    const user = (req as AuthedRequest).session?.user;
    if (!user) return;
    AuditLogService.record({
      actorId: user.id,
      actorName: user.name ?? "",
      actorEmail: user.email,
      role: user.role ?? "",
      method: req.method,
      path: logPath(req.originalUrl || req.url || "/"),
      status: res.statusCode,
      ip: req.ip ?? "",
    }).catch((error: unknown) => console.error("[audit] write failed", error));
  });
  next();
};
