import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, RequestHandler } from "express";
import { auth } from "../config/auth.js";
import { STEP_UP_REQUIRED, stepUpStatus } from "../config/auth/admin-gate.js";
import { ApiError } from "../config/errors.js";
import { canEnterSurface, type SurfaceId } from "../config/roles.js";
import {
  outsideTransaction,
  stampWriterReads,
} from "../lib/db/timestamp-ordering.js";
import { integrationEnabled } from "../lib/platform/integration-settings.js";
export type SessionUser = {
  id: string;
  name?: string;
  email: string;
  emailVerified?: boolean;
  role?: string;
  isOutsideOrg?: boolean;
};

type Session = { user: SessionUser; sessionId: string };

export type AuthedRequest = Request & { session?: Session };

export async function getSession(req: Request): Promise<Session | null> {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  const user = result?.user as Record<string, unknown> | undefined;
  if (!user || typeof user.id !== "string") return null;

  return {
    sessionId: typeof result?.session?.id === "string" ? result.session.id : "",
    user: {
      id: user.id,
      name: typeof user.name === "string" ? user.name : undefined,
      email: typeof user.email === "string" ? user.email : "",
      emailVerified: user.emailVerified === true,
      role: typeof user.role === "string" ? user.role : undefined,
      isOutsideOrg: user.isOutsideOrg === true,
    },
  };
}

function sessionOf(req: Request): Session {
  const session = (req as AuthedRequest).session;
  if (!session?.user) {
    throw new ApiError("UNAUTHORIZED", { message: "Unauthorized." });
  }
  return session;
}

export const sessionUser = (req: Request): SessionUser => sessionOf(req).user;
export const sessionId = (req: Request): string => sessionOf(req).sessionId;

export const requireSession: RequestHandler = async (req, _res, next) => {
  try {
    const session = await outsideTransaction(() => getSession(req));
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
      if (!canEnterSurface(sessionOf(req).user.role, surface)) {
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
  if ((await stepUpStatus(sessionUser(req).id, sessionId(req))).unlocked) return next();
  throw new ApiError("FORBIDDEN", {
    message:
      "Confirm with the PIN, your password, the emailed code and the authenticator first.",
    data: { code: STEP_UP_REQUIRED },
  });
};

export const googleSignInGuard: RequestHandler = async (_req, _res, next) => {
  if (await integrationEnabled("googleAuth")) return next();
  throw new ApiError("PRECONDITION_FAILED", {
    message: "Google sign-in is off.",
  });
};
