import { randomBytes } from "node:crypto";
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
import { ApiError } from "./errors.js";
import { newPasswordSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from "./password.js";

const PASSWORD_LINK_EXPIRY_SECONDS = 3600;
const PASSWORD_FIELDS: Record<string, string> = {
  "/sign-up/email": "password",
  "/sign-up/student": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
  "/set-password": "newPassword",
  "/email-otp/reset-password": "password",
};

function passwordLink(token: string): URL {
  const url = new URL("/login/reset-password", env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL);
  url.searchParams.set("token", token);
  return url;
}

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
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    resetPasswordTokenExpiresIn: PASSWORD_LINK_EXPIRY_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ token, user }) => {
      const url = passwordLink(token);
      const delivered = await sendMail({
        to: user?.email ?? "",
        subject: "Reset your ERPSYS password",
        text: `Hi ${user?.name ?? "there"},\n\nUse this link to choose a new ERPSYS password. It expires in one hour and works only once:\n\n${url}\n\nIf you did not ask for this, ignore this email — your password stays the same.`,
      });
      if (!delivered) console.warn("[auth] Password reset email was not delivered.");
    },
  },
  verification: {
    storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } },
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
      const passwordField = PASSWORD_FIELDS[ctx.path];
      if (passwordField && !newPasswordSchema.safeParse(ctx.body?.[passwordField]).success) {
        throw new APIError("BAD_REQUEST", { message: PASSWORD_REQUIREMENTS });
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

export async function inviteAccount(name: string, email: string): Promise<string> {
  const unavailable = () => new ApiError("SERVICE_UNAVAILABLE", {
    message: "The invitation could not be sent. Check the Email delivery integration and try again.",
  });
  if (!integrationConfigured("email") || !(await integrationEnabled("email")))
    throw unavailable();

  const { internalAdapter } = await auth.$context;
  const duplicate = () => new ApiError("CONFLICT", {
    message: "An account with that email already exists.",
  });
  if (await internalAdapter.findUserByEmail(email)) throw duplicate();

  const token = randomBytes(32).toString("base64url");
  const url = passwordLink(token);
  const identifier = `reset-password:${token}`;
  let user: Awaited<ReturnType<typeof internalAdapter.createUser>>;
  try {
    user = await internalAdapter.createUser({ name, email, emailVerified: false });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 11000) throw duplicate();
    throw error;
  }

  try {
    await internalAdapter.createVerificationValue({
      identifier,
      value: user.id,
      expiresAt: new Date(Date.now() + PASSWORD_LINK_EXPIRY_SECONDS * 1000),
    });
    if (!(await sendMail({
      to: user.email,
      subject: "Your ERPSYS account invitation",
      text: `You’ve been invited to ERPSYS. Choose your password with this one-time link. It expires in one hour.\n\n${url}\n\nIf you were not expecting this email, ignore it.`,
    }))) throw unavailable();
    return user.id;
  } catch (error) {
    try {
      await internalAdapter.deleteVerificationByIdentifier(identifier);
    } finally {
      await internalAdapter.deleteUser(user.id);
    }
    throw error;
  }
}
