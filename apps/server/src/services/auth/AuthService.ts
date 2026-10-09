import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import type { Request } from "express";
import { ApiError } from "../../config/errors.js";
import { auth } from "../../config/auth.js";

export type SessionUser = {
  id: string;
  name?: string;
  email: string;
  role?: string;
  isOutsideOrg?: boolean;
};

export type Session = { user: SessionUser };

export type AuthedRequest = Request & { session?: Session };

export class AuthService {
  static async resolve(headers: IncomingHttpHeaders): Promise<Session | null> {
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    const user = result?.user as Record<string, unknown> | undefined;
    if (!user || typeof user.id !== "string") return null;

    return {
      user: {
        id: user.id,
        name: typeof user.name === "string" ? user.name : undefined,
        email: typeof user.email === "string" ? user.email : "",
        role: typeof user.role === "string" ? user.role : undefined,
        isOutsideOrg: user.isOutsideOrg === true,
      },
    };
  }

  static async getSession(req: Request): Promise<Session | null> {
    return AuthService.resolve(req.headers);
  }

  static sessionOf(req: Request): Session {
    const session = (req as AuthedRequest).session;
    if (!session?.user) {
      throw new ApiError("UNAUTHORIZED", { message: "Unauthorized." });
    }
    return session;
  }
}
