import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { twoFactor } from "better-auth/plugins";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { AdviserAvailabilityModel } from "../models/AdviserAvailabilityModel.js";
import { AdviserDepartmentModel } from "../models/AdviserDepartmentModel.js";
import { EnrollmentQueueModel } from "../models/EnrollmentQueueModel.js";
import { UserModel } from "../models/UserModel.js";
import { getDbSync } from "../lib/db/db.js";
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

function deriveRole(email: string): {
  role: "STUDENT" | "ENROLLMENT_ADVISER" | "ADMIN";
  isOutsideOrg: boolean;
} {
  const normalized = email.toLowerCase();
  if (ADMIN_EMAILS.includes(normalized))
    return { role: "ADMIN", isOutsideOrg: false };
  if (normalized.endsWith("@buksu.edu.ph"))
    return { role: "ENROLLMENT_ADVISER", isOutsideOrg: false };
  if (normalized.endsWith("@student.buksu.edu.ph"))
    return { role: "STUDENT", isOutsideOrg: false };
  return { role: "STUDENT", isOutsideOrg: true };
}

function turnstileToken(ctx: {
  body?: Record<string, unknown>;
  request?: { headers: Headers };
}): string | undefined {
  const headerToken =
    (ctx.request?.headers.get("cf-turnstile-response") as string | null) ??
    undefined;
  return (
    (ctx.body?.["cf-turnstile-response"] as string | undefined) ??
    (ctx.body?.["turnstileToken"] as string | undefined) ??
    headerToken
  );
}

function remoteIp(ctx: { request?: { headers: Headers } }): string | undefined {
  return (
    ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    ctx.request?.headers.get("cf-connecting-ip") ??
    ctx.request?.headers.get("x-real-ip") ??
    undefined
  );
}

const db = getDbSync();

export const auth = betterAuth({
  database: mongodbAdapter(db),
  plugins: [
    createStudentSignUpPlugin(db),
    twoFactorPlugin,
    createAdminGatePlugin(),
  ],
  trustedOrigins: [env.BETTER_AUTH_URL, ...webOrigins()],
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ token, user }) => {
      const url = new URL("/login/reset-password", env.BETTER_AUTH_URL);
      url.searchParams.set("token", token);

      const delivered = await sendMail({
        to: user?.email ?? "",
        subject: "Reset your ERPSYS password",
        text: `Hi ${user?.name ?? "there"},\n\nUse this link to choose a new ERPSYS password. It expires in one hour and works only once:\n\n${url.toString()}\n\nIf you did not ask for this, ignore this email — your password stays the same.`,
      });
      if (delivered) return;

      if (env.NODE_ENV === "production") {
        console.warn(
          `[auth] password reset requested for ${user?.email ?? "unknown"} — no email was delivered. Set BREVO_API_KEY and MAIL_FROM, and keep the email integration on, or self-service resets stay broken.`,
        );
        return;
      }
      console.log(`[auth] password reset link: ${url.toString()}`);
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  socialProviders: {
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
      if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/student") {
        if (env.TURNSTILE_SECRET_KEY) {
          const token = turnstileToken(
            ctx as { body?: Record<string, unknown> },
          );
          if (!token || typeof token !== "string" || token.length === 0) {
            throw new APIError("BAD_REQUEST", {
              message: "Verification required. Please complete the challenge.",
            });
          }
          const result = await verifyTurnstile(token, {
            secret: env.TURNSTILE_SECRET_KEY,
            remoteIp: remoteIp(ctx),
            expectedAction: ctx.path === "/sign-in/email" ? "login" : "signup",
            expectedHostnames: new Set(
              env.TURNSTILE_HOSTNAMES.split(",")
                .map((host) => host.trim())
                .filter(Boolean),
            ),
          });
          if (!result.success) {
            throw new APIError("BAD_REQUEST", {
              message: "Verification failed. Please try again.",
            });
          }
        }
      }
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
          const derived = deriveRole(user.email);
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
            if (
              typeof user?.email === "string" &&
              ADMIN_EMAILS.includes(user.email.toLowerCase()) &&
              user.role !== "ADMIN"
            ) {
              await UserModel.promoteToAdmin(session.userId);
            }
          }
          return { data: session };
        },
      },
    },
  },
});
