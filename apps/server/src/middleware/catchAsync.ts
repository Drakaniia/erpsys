import type { NextFunction, Request, Response } from "express";
import { restartAborted } from "../lib/db/timestamp-ordering.js";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Concurrency: timestamp ordering — restart point.
 * Rule: a handler whose transaction aborted runs again with a new TS while
 * `restartAborted` allows it and nothing has been sent.
 * Abort: anything else reaches the error handler as `409` `TS_ABORTED`.
 */
export function catchAsync(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const attempt = (n: number): Promise<unknown> =>
      handler(req, res, next).catch((error: unknown) =>
        !res.headersSent && restartAborted(error, n)
          ? attempt(n + 1)
          : next(error),
      );
    void attempt(0);
  };
}
