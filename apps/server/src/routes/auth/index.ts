import { Router } from "express";
import { authController } from "../../controllers/auth/AuthController.js";
import { authRateLimit } from "../../lib/platform/rate-limit.js";

/**
 * `/api/auth` — Better Auth's own surface, mounted ahead of the JSON parsers.
 * The Google path is registered before the splat because Express matches in
 * order.
 */
export const authRouter = Router();

/**
 * `ALL /api/auth/sign-in/social`
 * Access: public.
 * Use: social sign-in entry; answers `412` while the Google integration is off.
 * Returns: Better Auth's own response (redirect).
 */
authRouter.all("/sign-in/social", authController.googleGuard);

/**
 * `ALL /api/auth/*`
 * Access: public.
 * Use: everything else Better Auth serves: session, sign-up, callback, sign-out
 * (behind `authRateLimit`). It includes the confirmation an administrator
 * passes before changing integrations (all need a session):
 * `GET /admin-gate/status`, `POST /admin-gate/pin` `{ pin }`,
 * `POST /admin-gate/password` `{ password }` (skipped when the admin has no
 * password, e.g. Google-only), `POST /admin-gate/code/send`,
 * `POST /admin-gate/code/verify` `{ code }`, and the authenticator calls
 * `POST /two-factor/enable|verify-totp|verify-backup-code`.
 * Returns: Better Auth's own response.
 */
authRouter.all("/*splat", authRateLimit, authController.handler);
