import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { z } from "zod";
import { isApiError } from "../errors.js";
import { AdminGateService } from "../../services/auth/AdminGateService.js";

const TWO_FACTOR_PATHS = [
  "/two-factor/enable",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
];
const CHECK_PATHS = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
];

type SessionCtx = {
  context: {
    adapter: {
      findOne: (query: {
        model: string;
        where: Array<{ field: string; value: string }>;
      }) => Promise<{ verified?: boolean } | null>;
    };
  };
};

function rethrow(error: unknown): never {
  if (isApiError(error)) {
    throw new APIError(error.code as never, {
      message: error.message,
      code: (error.data as { code?: string } | undefined)?.code,
    });
  }
  throw error;
}

async function adminUser(ctx: unknown) {
  const session = await getSessionFromCtx(ctx as never);
  if (!session) {
    throw new APIError("UNAUTHORIZED", { message: "Unauthorized." });
  }
  if (!(await AdminGateService.isAdminUser(session.user.id))) {
    throw new APIError("FORBIDDEN", { message: "Not available." });
  }
  return session.user;
}

async function enrolled(ctx: SessionCtx, userId: string): Promise<boolean> {
  const row = await ctx.context.adapter.findOne({
    model: "twoFactor",
    where: [{ field: "userId", value: userId }],
  });
  return !!row && row.verified !== false;
}

export function createAdminGatePlugin() {
  return {
    id: "admin-gate",
    pathMethods: {
      "/admin-gate/status": "GET",
      "/admin-gate/pin": "POST",
      "/admin-gate/password": "POST",
      "/admin-gate/code/send": "POST",
      "/admin-gate/code/verify": "POST",
    } as const,
    endpoints: {
      adminGateStatus: createAuthEndpoint(
        "/admin-gate/status",
        { method: "GET" },
        async (ctx) => {
          const user = await adminUser(ctx);
          return ctx.json({
            ...(await AdminGateService.status(user.id)),
            enrolled: await enrolled(ctx as never, user.id),
          });
        },
      ),
      adminGatePin: createAuthEndpoint(
        "/admin-gate/pin",
        {
          method: "POST",
          body: z.object({ pin: z.string().regex(/^\d{6}$/) }),
        },
        async (ctx) => {
          const user = await adminUser(ctx);
          try {
            await AdminGateService.submitPin(user.id, ctx.body.pin);
          } catch (error) {
            rethrow(error);
          }
          return ctx.json({ ok: true });
        },
      ),
      adminGatePassword: createAuthEndpoint(
        "/admin-gate/password",
        { method: "POST", body: z.object({ password: z.string().min(1).max(128) }) },
        async (ctx) => {
          const user = await adminUser(ctx);
          try {
            await AdminGateService.beforePassword(user.id);
          } catch (error) {
            rethrow(error);
          }
          await ctx.context.password.checkPassword(user.id, ctx);
          await AdminGateService.passwordAccepted(user.id);
          return ctx.json({ ok: true });
        },
      ),
      adminGateCodeSend: createAuthEndpoint(
        "/admin-gate/code/send",
        { method: "POST" },
        async (ctx) => {
          const user = await adminUser(ctx);
          try {
            await AdminGateService.sendCode(user);
          } catch (error) {
            rethrow(error);
          }
          return ctx.json({ ok: true });
        },
      ),
      adminGateCodeVerify: createAuthEndpoint(
        "/admin-gate/code/verify",
        { method: "POST", body: z.object({ code: z.string().regex(/^\d{6}$/) }) },
        async (ctx) => {
          const user = await adminUser(ctx);
          try {
            await AdminGateService.verifyCode(user.id, ctx.body.code);
          } catch (error) {
            rethrow(error);
          }
          return ctx.json({ ok: true });
        },
      ),
    },
    hooks: {
      before: [
        {
          matcher: (context: { path?: string }) =>
            !!context.path?.startsWith("/two-factor/"),
          handler: createAuthMiddleware(async (ctx) => {
            if (!TWO_FACTOR_PATHS.includes(ctx.path)) {
              throw new APIError("FORBIDDEN", { message: "Not available." });
            }
            if ((ctx.body as { trustDevice?: unknown } | undefined)?.trustDevice) {
              throw new APIError("BAD_REQUEST", {
                message: "Trusted devices are not allowed.",
              });
            }
            const user = await adminUser(ctx);
            try {
              if (ctx.path === "/two-factor/enable") {
                if (await enrolled(ctx as never, user.id)) {
                  throw new APIError("FORBIDDEN", {
                    message:
                      "The authenticator is already set up. Ask for a reset if the device is lost.",
                  });
                }
                await AdminGateService.requireCodeStep(user.id);
              } else {
                await AdminGateService.beforeAuthenticator(user.id);
              }
            } catch (error) {
              rethrow(error);
            }
          }),
        },
      ],
      after: [
        {
          matcher: (context: { path?: string }) =>
            CHECK_PATHS.includes(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) return;
            const userId =
              ctx.context.newSession?.user.id ??
              (await getSessionFromCtx(ctx as never))?.user.id;
            if (userId) await AdminGateService.unlock(userId);
          }),
        },
      ],
    },
  };
}
