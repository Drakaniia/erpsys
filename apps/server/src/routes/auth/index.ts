import { toNodeHandler } from "better-auth/node";
import { Router, type RequestHandler } from "express";
import { auth } from "../../config/auth.js";
import { authRateLimit } from "../../lib/platform/rate-limit.js";
import { googleSignInGuard } from "../../middleware/auth.js";

/**
 * `/api/auth` — Better Auth's own surface, mounted ahead of the JSON parsers.
 */
export const authRouter = Router();

const betterAuth = toNodeHandler(auth) as unknown as RequestHandler;

/**
 * `ALL /api/auth/sign-in/social`
 * Access: public.
 * Use: Google sign-in entry; answers `412` while the Google integration is off.
 * Returns: Better Auth's own response (redirect).
 */
authRouter.all("/sign-in/social", authRateLimit, googleSignInGuard, betterAuth);

/**
 * `ALL /api/auth/*`
 * Access: public.
 * Use: everything else Better Auth serves: session, email sign-in (Turnstile
 * token in body `cf-turnstile-response` / `turnstileToken` or the header of
 * that name while bot protection is on), sign-up, callback, sign-out (behind
 * `authRateLimit`). Native email codes use `POST /email-otp/send-verification-otp`
 * with `{ email, type: "sign-in" | "email-verification" }`; sign-in sends need
 * the same Turnstile header. `POST /sign-in/email-otp` accepts `{ email, otp }`;
 * `POST /email-otp/verify-email` accepts `{ email, otp }` without signing in.
 * Codes expire after 5 minutes, allow 3 wrong attempts and work once.
 * OTP sign-in never creates accounts. Email verification is optional; public
 * password signup creates only students. Privileged email-derived roles need
 * verified ownership and a new sign-in. First verification of a privileged
 * address clears unproven password credentials and sessions; use code login
 * afterward. Password reset ends every session.
 * It includes the administrator step-up before integration
 * changes (all need a session): `GET /admin-gate/status`,
 * `POST /admin-gate/pin` `{ pin }`, `POST /admin-gate/password` `{ password }`
 * (skipped when the admin has no password, e.g. Google-only),
 * `POST /admin-gate/code/send`, `POST /admin-gate/code/verify` `{ code }`, and
 * the authenticator calls `POST /two-factor/enable|verify-totp|verify-backup-code`.
 * Returns: Better Auth's own response.
 */
authRouter.all("/*splat", authRateLimit, betterAuth);
