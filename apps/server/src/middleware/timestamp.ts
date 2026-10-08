import type { RequestHandler } from "express";
import { ApiError } from "../config/errors.js";
import {
  beginTransaction,
  isIssuedTs,
} from "../lib/db/timestamp-ordering.js";

/**
 * Concurrency: timestamp ordering — one transaction per `/api/v1` request.
 * Rule: body `ts` (the `ts` of the response the client edited from) makes T
 * client-anchored; no `ts` means server-anchored with a fresh TS. `ts` is removed
 * from the body before any handler parses it.
 * Abort: `400` when `ts` is not a TS this server could have issued.
 */
export const timestampOrdering: RequestHandler = (req, _res, next) => {
  const body = req.body as Record<string, unknown> | undefined;
  const clientTs = body?.ts;
  if (body && "ts" in body) delete body.ts;
  if (clientTs !== undefined && !isIssuedTs(clientTs)) {
    next(
      new ApiError("BAD_REQUEST", {
        message: "`ts` must be a timestamp this server issued.",
      }),
    );
    return;
  }
  beginTransaction(clientTs as number | undefined, req.method, next);
};
