import { toNodeHandler } from "better-auth/node";
import type { RequestHandler } from "express";
import { auth } from "../../config/auth.js";
import { googleSignInGuard } from "../../middleware/auth.js";

export class AuthController {
  readonly handler = toNodeHandler(auth) as unknown as RequestHandler;
  readonly googleGuard: RequestHandler = googleSignInGuard;
}

export const authController = new AuthController();
