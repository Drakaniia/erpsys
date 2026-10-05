import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { RequestHandler } from "express";
import { env } from "./env.js";
import { nsToMs, recordRequest } from "./metrics.js";

export const REDACTED = "[redacted]";

export const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "better-auth.session-token",
]);

export function redactHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    safe[name] = SENSITIVE_HEADERS.has(name.toLowerCase())
      ? REDACTED
      : "[omitted]";
  }
  return safe;
}

export function logPath(path: string): string {
  const queryStart = path.indexOf("?");
  return queryStart === -1 ? path : path.slice(0, queryStart);
}

export function attachRequestId(res: Parameters<RequestHandler>[1]): string {
  const id = randomUUID();
  (res as { locals: Record<string, unknown> }).locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  return id;
}

export let structuredOverride: boolean | undefined;

export function setStructuredLogForTest(value: boolean | undefined): void {
  structuredOverride = value;
}

export const requestLogMiddleware: RequestHandler = (req, res, next) => {
  const requestId = attachRequestId(res);
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = nsToMs(Number(process.hrtime.bigint() - startedAt), 2);
    const method = req.method;
    const path = logPath(req.originalUrl || req.url || "/");
    const status = res.statusCode;

    recordRequest({ method, path, status, durationMs });

    if (structuredOverride ?? env.NODE_ENV === "production") {
      console.log(
        JSON.stringify({
          level: "info",
          msg: "request",
          requestId,
          method,
          path,
          status,
          durationMs,
        }),
      );
    } else {
      console.log(
        `[http] ${method} ${path} ${status} ${durationMs}ms rid=${requestId}`,
      );
    }
  });

  next();
};
