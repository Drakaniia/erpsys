import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { ApiError } from "../../config/errors.js";
import { createRateLimitBudget } from "../../lib/platform/rate-limit.js";
import { env } from "../../lib/platform/env.js";
import { sendMail } from "../../lib/platform/mailer.js";
import { AccountModel } from "../../models/AccountModel.js";
import {
  AdminStepUpModel,
  type AdminStepUpRow,
} from "../../models/AdminStepUpModel.js";
import { UserModel } from "../../models/UserModel.js";
import { stepUpCodeEmail } from "../../views/StepUpCodeEmailView.js";

export const STEP_WINDOW_MS = 10 * 60_000;
export const UNLOCK_MS = 5 * 60_000;
export const CODE_RESEND_MS = 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const TOTP_MAX_ATTEMPTS = 5;
export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";

export type StepName = "pin" | "password" | "code" | "totp";

const pinPerUser = createRateLimitBudget({ windowMs: 15 * 60_000, max: 8 });
const pinGlobal = createRateLimitBudget({ windowMs: 15 * 60_000, max: 60 });
const passwordPerUser = createRateLimitBudget({ windowMs: 15 * 60_000, max: 8 });

const digest = (value: string) => createHash("sha256").update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const codeHash = (userId: string, code: string) =>
  digest(`${userId}:${code}`).toString("hex");
const fresh = (at: Date | null | undefined, now: Date) =>
  !!at && now.getTime() - at.getTime() < STEP_WINDOW_MS;
const after = (now: Date, ms: number) => new Date(now.getTime() + ms);

function order(step: StepName, message: string): ApiError {
  return new ApiError("FORBIDDEN", { message, data: { code: "STEP_ORDER", step } });
}

export class AdminGateService {
  static async isAdminUser(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId);
    return user?.role === "ADMIN";
  }

  static nextStep(row: AdminStepUpRow | null, now = new Date()): StepName {
    if (!fresh(row?.pinAt, now)) return "pin";
    if (!fresh(row?.passwordAt, now)) return "password";
    if (!fresh(row?.codeAt, now)) return "code";
    return "totp";
  }

  static async status(
    userId: string,
    now = new Date(),
  ): Promise<{ unlocked: boolean; unlockedUntil: Date | null; next: StepName }> {
    const row = await AdminStepUpModel.find(userId);
    const unlocked = !!row?.unlockedUntil && row.unlockedUntil > now;
    return {
      unlocked,
      unlockedUntil: unlocked ? row!.unlockedUntil : null,
      next: AdminGateService.nextStep(row, now),
    };
  }

  static async unlocked(userId: string, now = new Date()): Promise<boolean> {
    return (await AdminGateService.status(userId, now)).unlocked;
  }

  static async submitPin(
    userId: string,
    pin: string,
    now = new Date(),
  ): Promise<void> {
    if (!/^\d{6}$/.test(env.SU_PIN)) {
      throw new ApiError("SERVICE_UNAVAILABLE", {
        message: "The administrator PIN is not configured.",
      });
    }
    if (!pinPerUser.check(userId).allowed || !pinGlobal.check("all").allowed) {
      throw new ApiError("TOO_MANY_REQUESTS", {
        message: "Too many PIN attempts. Wait a few minutes and try again.",
      });
    }
    if (!same(pin, env.SU_PIN)) {
      throw new ApiError("FORBIDDEN", { message: "Incorrect PIN." });
    }
    const passwordless = !(await AccountModel.hasPassword(userId));
    await AdminStepUpModel.begin(
      userId,
      now,
      after(now, STEP_WINDOW_MS),
      passwordless ? now : null,
    );
  }

  static async beforePassword(userId: string, now = new Date()): Promise<void> {
    const row = await AdminStepUpModel.find(userId);
    if (!fresh(row?.pinAt, now)) throw order("pin", "Enter the PIN first.");
    if (!passwordPerUser.check(userId).allowed) {
      throw new ApiError("TOO_MANY_REQUESTS", {
        message: "Too many password attempts. Wait a few minutes and try again.",
      });
    }
  }

  static async passwordAccepted(userId: string, now = new Date()): Promise<void> {
    await AdminStepUpModel.patch(
      userId,
      { passwordAt: now },
      after(now, STEP_WINDOW_MS),
    );
  }

  static async sendCode(
    user: { id: string; email: string; name?: string | null },
    now = new Date(),
  ): Promise<void> {
    const row = await AdminStepUpModel.find(user.id);
    if (!fresh(row?.passwordAt, now)) {
      throw order("password", "Confirm your password first.");
    }
    if (row?.sentAt && now.getTime() - row.sentAt.getTime() < CODE_RESEND_MS) {
      throw new ApiError("TOO_MANY_REQUESTS", {
        message: "Wait a minute before requesting another code.",
      });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await AdminStepUpModel.patch(
      user.id,
      {
        codeHash: codeHash(user.id, code),
        sentAt: now,
        attempts: 0,
        codeAt: null,
      },
      after(now, STEP_WINDOW_MS),
    );
    const delivered = await sendMail(
      stepUpCodeEmail({
        to: user.email,
        name: user.name,
        code,
        minutes: STEP_WINDOW_MS / 60_000,
      }),
    );
    if (delivered) return;
    if (env.NODE_ENV === "production") {
      await AdminStepUpModel.remove(user.id);
      throw new ApiError("SERVICE_UNAVAILABLE", {
        message: "The code email could not be sent. Check the email integration.",
      });
    }
    console.log(`[auth] integration confirmation code for ${user.email}: ${code}`);
  }

  static async verifyCode(
    userId: string,
    code: string,
    now = new Date(),
  ): Promise<void> {
    const before = await AdminStepUpModel.find(userId);
    if (!fresh(before?.passwordAt, now)) {
      throw order("password", "Confirm your password first.");
    }
    const row = await AdminStepUpModel.takeCodeAttempt(userId, CODE_MAX_ATTEMPTS);
    if (!row || !row.codeHash || !fresh(row.sentAt, now)) {
      throw new ApiError("BAD_REQUEST", {
        message: "That code expired or ran out of tries. Request a new one.",
      });
    }
    if (!same(codeHash(userId, code), row.codeHash)) {
      throw new ApiError("BAD_REQUEST", {
        message: `Incorrect code. ${CODE_MAX_ATTEMPTS - row.attempts} tries left.`,
      });
    }
    await AdminStepUpModel.patch(
      userId,
      { codeAt: now },
      after(now, STEP_WINDOW_MS),
    );
  }

  static async requireCodeStep(userId: string, now = new Date()): Promise<void> {
    const row = await AdminStepUpModel.find(userId);
    if (!fresh(row?.codeAt, now)) {
      throw order("code", "Confirm the emailed code first.");
    }
  }

  static async beforeAuthenticator(
    userId: string,
    now = new Date(),
  ): Promise<void> {
    await AdminGateService.requireCodeStep(userId, now);
    if (!(await AdminStepUpModel.takeTotpAttempt(userId, TOTP_MAX_ATTEMPTS))) {
      await AdminStepUpModel.remove(userId);
      throw new ApiError("TOO_MANY_REQUESTS", {
        message: "Too many wrong codes. Start again from the PIN.",
      });
    }
  }

  static async unlock(userId: string, now = new Date()): Promise<void> {
    const until = after(now, UNLOCK_MS);
    await AdminStepUpModel.patch(
      userId,
      {
        pinAt: null,
        passwordAt: null,
        codeHash: null,
        sentAt: null,
        attempts: 0,
        codeAt: null,
        totpAttempts: 0,
        unlockedUntil: until,
      },
      until,
    );
  }
}
