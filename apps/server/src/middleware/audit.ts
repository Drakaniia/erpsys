import type { RequestHandler } from "express";
import { AuditLogModel } from "../models/AuditLogModel.js";
import type { AuthedRequest } from "./auth.js";
import { background } from "../lib/platform/background.js";

export const AUDITED_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

const audited = new Set<string>(AUDITED_METHODS);

export const auditTrail: RequestHandler = (req, res, next) => {
  if (!audited.has(req.method)) return next();
  res.on("finish", () => {
    const user = (req as AuthedRequest).session?.user;
    if (!user) return;
    background(AuditLogModel.insert({
      actorId: user.id,
      actorName: user.name ?? "",
      actorEmail: user.email,
      role: user.role ?? "",
      method: req.method,
      path: (req.originalUrl || req.url || "/").split("?")[0],
      status: res.statusCode,
      ip: req.ip ?? "",
    }).catch((error: unknown) => console.error("[audit] write failed", error)));
  });
  next();
};
