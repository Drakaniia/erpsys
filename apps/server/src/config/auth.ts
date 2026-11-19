import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { emailOTP, twoFactor } from "better-auth/plugins";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { AdviserAvailabilityModel } from "../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { UserModel } from "../models/UserModel.js";
import { COLLECTIONS, getDbSync, idIn } from "../lib/db/db.js";
import {
  integrationConfigured,
  integrationEnabled,
} from "../lib/platform/integration-settings.js";
import { env, webOrigins } from "../lib/platform/env.js";
import { sendMail } from "../lib/platform/mailer.js";
import { verifyTurnstile } from "../lib/platform/turnstile.js";
import { createAdminGatePlugin } from "./auth/AdminGatePlugin.js";
import { createStudentSignUpPlugin } from "./auth/StudentSignUpPlugin.js";

const ADMIN_EMAILS = env.ADMIN_EMAILS.split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const { hooks: _signInRedirect, ...twoFactorPlugin } = twoFactor({
  issuer: "ERPSYS",
  allowPasswordless: true,
});

const TURNSTILE_PATHS: Record<string, string> = {
  "/sign-in/email": "login",
  "/sign-up/student": "signup",
  "/email-otp/send-verification-otp": "login",
};

async function requireTurnstile(ctx: {
  path: string;
  body?: Record<string, unknown>;
  request?: { headers: Headers };
}): Promise<void> {
  const action = TURNSTILE_PATHS[ctx.path];
  if (
    !action ||
    !env.TURNSTILE_SECRET_KEY ||
    !(await integrationEnabled("turnstile"))
  )
    return;
  if (
    ctx.path === "/email-otp/send-verification-otp" &&
    ctx.body?.type !== "sign-in"
  )
    return;
  const headers = ctx.request?.headers;
  const token =
    ctx.body?.["cf-turnstile-response"] ??
    ctx.body?.turnstileToken ??
    headers?.get("cf-turnstile-response");
  if (typeof token !== "string" || token.length === 0) {
    throw new APIError("BAD_REQUEST", {
      message: "Verification required. Please complete the challenge.",
    });
  }
  const result = await verifyTurnstile(token, {
    remoteIp:
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-real-ip") ??
      undefined,
    expectedAction: action,
  });
  if (!result.success) {
    throw new APIError("BAD_REQUEST", {
      message: "Verification failed. Please try again.",
    });
  }
}

function deriveRole(
  email: string,
  emailVerified: boolean,
): {
  role: "STUDENT" | "ENROLLMENT_ADVISER" | "ADMIN";
  isOutsideOrg: boolean;
} {
  const normalized = email.toLowerCase();
  if (emailVerified && ADMIN_EMAILS.includes(normalized))
    return { role: "ADMIN", isOutsideOrg: false };
  if (emailVerified && normalized.endsWith("@buksu.edu.ph"))
    return { role: "ENROLLMENT_ADVISER", isOutsideOrg: false };
  if (normalized.endsWith("@student.buksu.edu.ph"))
    return { role: "STUDENT", isOutsideOrg: false };
  return { role: "STUDENT", isOutsideOrg: true };
}

export const auth = betterAuth({
  database: mongodbAdapter(getDbSync()),
  plugins: [
    createStudentSignUpPlugin(),
    emailOTP({
      disableSignUp: true,
      storeOTP: "hashed",
      expiresIn: 300,
      allowedAttempts: 3,
      overrideDefaultEmailVerification: true,
      sendVerificationOTP: async ({ email, otp, type }) => {
        const purpose =
          type === "sign-in"
            ? "sign in"
            : type === "forget-password"
              ? "reset your password"
              : "verify your email";
        const delivered = await sendMail({
          to: email,
          subject: "Your ERPSYS email code",
          text: `Use ${otp} to ${purpose}. This code expires in 5 minutes and works once. If you did not request it, ignore this email.`,
        });
        if (!delivered) {
          throw new APIError("SERVICE_UNAVAILABLE", {
            message:
              "The code email could not be sent. Please try again later.",
          });
        }
      },
    }),
    twoFactorPlugin,
    createAdminGatePlugin(),
  ],
  trustedOrigins: [env.BETTER_AUTH_URL, ...webOrigins()],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ token, user }) => {
      const url = new URL("/login/reset-password", env.BETTER_AUTH_URL);
      url.searchParams.set("token", token);
      const delivered = await sendMail({
        to: user?.email ?? "",
        subject: "Reset your ERPSYS password",
        text: `Hi ${user?.name ?? "there"},\n\nUse this link to choose a new ERPSYS password. It expires in one hour and works only once:\n\n${url}\n\nIf you did not ask for this, ignore this email — your password stays the same.`,
      });
      if (delivered) return;
      if (env.NODE_ENV === "production") {
        console.warn(
          `[auth] password reset requested for ${user?.email ?? "unknown"} — no email was delivered. Set BREVO_API_KEY and MAIL_FROM, and keep the email integration on, or self-service resets stay broken.`,
        );
        return;
      }
      console.log(`[auth] password reset link for ${user?.email}: ${url}`);
    },
  },
  emailVerification: {
    beforeEmailVerification: async (user): Promise<void> => {
      if (user.emailVerified || deriveRole(user.email, true).role === "STUDENT")
        return;
      const { internalAdapter } = await auth.$context;
      const accounts = await internalAdapter.findAccounts(user.id);
      for (const account of accounts) {
        if (account.providerId === "credential")
          await internalAdapter.deleteAccount(account.id);
      }
      await internalAdapter.deleteUserSessions(user.id);
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  socialProviders: env.LOCAL_ONLY
    ? {}
    : {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      },
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      requireLocalEmailVerified: false,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "STUDENT",
        input: false,
        returned: true,
      },
      isOutsideOrg: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
        returned: true,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/email-otp/send-verification-otp" ||
        ctx.path === "/email-otp/request-password-reset" ||
        ctx.path === "/forget-password/email-otp" ||
        ctx.path === "/send-verification-email"
      ) {
        if (
          !integrationConfigured("email") ||
          !(await integrationEnabled("email"))
        ) {
          throw new APIError("SERVICE_UNAVAILABLE", {
            message:
              "Email delivery is unavailable. Use another sign-in method or contact the office.",
          });
        }
      }
      await requireTurnstile(ctx as never);
      if (ctx.path === "/sign-up/email" && ctx.request) {
        throw new APIError("BAD_REQUEST", {
          message:
            "Password registration is done on the register page with a student number.",
        });
      }
      if (ctx.path === "/sign-out") {
        const session = await getSessionFromCtx(ctx);
        if (session?.user?.id) {
          await AdviserAvailabilityModel.closeOpenForAdviser(session.user.id);
          await EnrollmentQueueModel.releaseServingExcept(session.user.id, []);
          await AdviserDepartmentModel.deleteForAdviser(session.user.id);
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const derived = deriveRole(user.email, user.emailVerified === true);
          return {
            data: {
              ...user,
              role: derived.role,
              isOutsideOrg: derived.isOutsideOrg,
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          if (session.userId) {
            const user = await UserModel.findById(session.userId);
            if (user?.blockedAt) {
              throw new APIError("FORBIDDEN", {
                message:
                  "This account has been disabled. Contact an administrator.",
              });
            }
            if (user?.email && user.emailVerified === true) {
              const derived = deriveRole(user.email, true);
              if (
                (derived.role === "ADMIN" && user.role !== "ADMIN") ||
                (derived.role === "ENROLLMENT_ADVISER" &&
                  user.role === "STUDENT")
              ) {
                await getDbSync()
                  .collection(COLLECTIONS.user)
                  .updateOne(idIn([session.userId]) as never, {
                    $set: { role: derived.role, isOutsideOrg: false },
                  });
              }
            }
          }
          return { data: session };
        },
      },
    },
  },
});
