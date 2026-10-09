import type { NextFunction, Request, RequestHandler } from "express";
import { ApiError } from "../config/errors.js";
import { canEnterSurface, type SurfaceId } from "../config/roles.js";
import {
  outsideTransaction,
  stampWriterReads,
} from "../lib/db/timestamp-ordering.js";
import { integrationEnabled } from "../lib/platform/integration-settings.js";
import {
  AdminGateService,
  STEP_UP_REQUIRED,
} from "../services/auth/AdminGateService.js";
import {
  AuthService,
  type AuthedRequest,
} from "../services/auth/AuthService.js";

export const requireSession: RequestHandler = async (req, _res, next) => {
  try {
    const session = await outsideTransaction(() =>
      AuthService.getSession(req),
    );
    if (!session)
      throw new ApiError("UNAUTHORIZED", { message: "Unauthorized." });
    (req as AuthedRequest).session = session;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireSurface(surface: SurfaceId): RequestHandler {
  return (req: Request, _res, next: NextFunction) => {
    try {
      if (!canEnterSurface(AuthService.sessionOf(req).user.role, surface)) {
        throw new ApiError("FORBIDDEN", { message: "Forbidden." });
      }
      if (surface !== "student") stampWriterReads();
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireStepUp: RequestHandler = async (req, _res, next) => {
  try {
    const { user } = AuthService.sessionOf(req);
    if (!(await AdminGateService.unlocked(user.id))) {
      throw new ApiError("FORBIDDEN", {
        message:
          "Confirm with the PIN, your password, the emailed code and the authenticator first.",
        data: { code: STEP_UP_REQUIRED },
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const googleSignInGuard: RequestHandler = async (_req, _res, next) => {
  if (await integrationEnabled("googleAuth")) return next();
  throw new ApiError("PRECONDITION_FAILED", {
    message: "Google sign-in is off.",
  });
};
