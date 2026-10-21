import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { catchAsync } from "../../middleware/catchAsync.js";
import { okOne, parseBody, parseQuery } from "../../middleware/http.js";
import { clientIp } from "../../lib/platform/rate-limit.js";
import { AuthService } from "../../services/auth/AuthService.js";
import { StorageContentService } from "../../services/storage/StorageContentService.js";
import { StorageSessionService } from "../../services/storage/StorageSessionService.js";

const sessionBodySchema = z.object({
  route: z.enum(["evidenceImage", "mugshotCapture", "stampImage"]),
  stepCode: z.string().min(1).max(64).optional(),
  studentProfileId: z.string().min(1).optional(),
  mime: z.string().min(1).max(100),
  size: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
});

const completeBodySchema = z.object({
  uploadId: z.string().min(1),
  stepCode: z.string().min(1).max(64).optional(),
});

export class StorageController {
  readonly session = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(sessionBodySchema, req);
    const result = await StorageSessionService.mint({
      input,
      caller: AuthService.sessionOf(req).user,
      ip: clientIp(req),
    });

    if (result.kind === "rate-limited") {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      res.status(429).json({ error: "Too many upload requests — slow down." });
      return;
    }
    if (result.kind === "blocked") {
      res.status(503).json(result.body);
      return;
    }
    okOne(res, result.session, 201);
  });

  readonly complete = catchAsync(async (req: Request, res: Response) => {
    const input = parseBody(completeBodySchema, req);
    okOne(
      res,
      await StorageSessionService.complete(
        AuthService.sessionOf(req).user,
        input,
      ),
    );
  });

  readonly status = catchAsync(async (req: Request, res: Response) => {
    const input = parseQuery(z.object({ uploadId: z.string().min(1) }), req);
    okOne(
      res,
      await StorageSessionService.status(
        AuthService.sessionOf(req).user,
        input.uploadId,
      ),
    );
  });

  readonly content = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = parseQuery(z.object({ id: z.string().min(1) }), req);
      const result = await StorageContentService.open({
        uploadId: input.id,
        user: AuthService.sessionOf(req).user,
        range: req.headers.range,
      });
      if (result.kind === "not-storage") {
        next();
        return;
      }

      res.status(result.status);
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", "inline");
      if (result.contentLength) {
        res.setHeader("Content-Length", result.contentLength);
      }
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      if (result.contentRange) {
        res.setHeader("Content-Range", result.contentRange);
      }
      result.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}

export const storageController = new StorageController();
