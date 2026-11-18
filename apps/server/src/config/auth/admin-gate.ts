import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors.js";
import { COLLECTIONS, getDbSync, idIn, refIn } from "../../lib/db/db.js";
import { env } from "../../lib/platform/env.js";
import { escapeHtml, sendMail } from "../../lib/platform/mailer.js";
import { createRateLimitBudget } from "../../lib/platform/rate-limit.js";
import { AccountModel } from "../../models/AccountModel.js";
import { AdminStepUpModel, type AdminStepUpRow } from "../../models/AdminStepUpModel.js";
import { UserModel } from "../../models/UserModel.js";

const STEP_WINDOW_MS = 10 * 60_000;
const UNLOCK_MS = 5 * 60_000;
const CODE_RESEND_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;
const TOTP_MAX_ATTEMPTS = 5;
export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";

type StepName = "pin" | "password" | "code" | "totp";

const pinPerUser = createRateLimitBudget({ windowMs: 15 * 60_000, max: 8 });
const pinGlobal = createRateLimitBudget({ windowMs: 15 * 60_000, max: 60 });
const passwordPerUser = createRateLimitBudget({ windowMs: 15 * 60_000, max: 8 });

const digest = (value: string) => createHash("sha256").update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
const codeHash = (userId: string, code: string) => digest(`${userId}:${code}`).toString("hex");
const fresh = (at: Date | null | undefined, now: Date) =>
  !!at && now.getTime() - at.getTime() < STEP_WINDOW_MS;
const after = (now: Date, ms: number) => new Date(now.getTime() + ms);
const order = (step: StepName, message: string) =>
  new ApiError("FORBIDDEN", { message, data: { code: "STEP_ORDER", step } });

function nextStep(row: AdminStepUpRow | null, now: Date): StepName {
  if (!fresh(row?.pinAt, now)) return "pin";
  if (!fresh(row?.passwordAt, now)) return "password";
  if (!fresh(row?.codeAt, now)) return "code";
  return "totp";
}

export async function isAdminUser(userId: string): Promise<boolean> {
  return (await UserModel.findById(userId))?.role === "ADMIN";
}

export async function stepUpStatus(userId: string, now = new Date()) {
  const row = await AdminStepUpModel.find(userId);
  const unlocked = !!row?.unlockedUntil && row.unlockedUntil > now;
  return {
    unlocked,
    unlockedUntil: unlocked ? row!.unlockedUntil : null,
    next: nextStep(row, now),
  };
}

export async function submitPin(userId: string, pin: string, now = new Date()): Promise<void> {
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
  if (!same(pin, env.SU_PIN)) throw new ApiError("FORBIDDEN", { message: "Incorrect PIN." });
  const passwordless = !(await AccountModel.hasPassword(userId));
  await AdminStepUpModel.begin(userId, now, after(now, STEP_WINDOW_MS), passwordless ? now : null);
}

export async function beforePassword(userId: string, now = new Date()): Promise<void> {
  const row = await AdminStepUpModel.find(userId);
  if (!fresh(row?.pinAt, now)) throw order("pin", "Enter the PIN first.");
  if (!passwordPerUser.check(userId).allowed) {
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "Too many password attempts. Wait a few minutes and try again.",
    });
  }
}

export async function passwordAccepted(userId: string, now = new Date()): Promise<void> {
  await AdminStepUpModel.patch(userId, { passwordAt: now }, after(now, STEP_WINDOW_MS));
}

function codeEmail(to: string, name: string | null | undefined, code: string) {
  const minutes = STEP_WINDOW_MS / 60_000;
  const copyUrl = `${(env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL).replace(/\/+$/, "")}/login/copy-code#${code}`;
  const who = name?.trim() || "there";
  return {
    to,
    subject: `${code} is your ERPSYS confirmation code`,
    text: `Hi ${who},\n\nYour ERPSYS confirmation code for changing integration settings is ${code}. It expires in ${minutes} minutes and works once.\n\nCopy it here: ${copyUrl}\n\nIf you did not start this, change your password now.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#101828">
<p style="margin:0 0 12px">Hi ${escapeHtml(who)},</p>
<p style="margin:0 0 16px">Use this code to confirm a change to the ERPSYS integration settings. It expires in ${minutes} minutes and works once.</p>
<p style="margin:0 0 16px;padding:16px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;background:#f2f4f7;border-radius:8px;user-select:all">${code}</p>
<p style="margin:0 0 16px;text-align:center"><a href="${escapeHtml(copyUrl)}" style="display:inline-block;padding:10px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Copy code</a></p>
<p style="margin:0;font-size:13px;color:#667085">If you did not start this, change your password now.</p>
</div>`,
  };
}

export async function sendCode(
  user: { id: string; email: string; name?: string | null },
  now = new Date(),
): Promise<void> {
  const row = await AdminStepUpModel.find(user.id);
  if (!fresh(row?.passwordAt, now)) throw order("password", "Confirm your password first.");
  if (row?.sentAt && now.getTime() - row.sentAt.getTime() < CODE_RESEND_MS) {
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "Wait a minute before requesting another code.",
    });
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await AdminStepUpModel.patch(
    user.id,
    { codeHash: codeHash(user.id, code), sentAt: now, attempts: 0, codeAt: null },
    after(now, STEP_WINDOW_MS),
  );
  if (await sendMail(codeEmail(user.email, user.name, code))) return;
  if (env.NODE_ENV === "production") {
    await AdminStepUpModel.remove(user.id);
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "The code email could not be sent. Check the email integration.",
    });
  }
  console.log(`[auth] integration confirmation code for ${user.email}: ${code}`);
}

export async function verifyCode(userId: string, code: string, now = new Date()): Promise<void> {
  const before = await AdminStepUpModel.find(userId);
  if (!fresh(before?.passwordAt, now)) throw order("password", "Confirm your password first.");
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
  await AdminStepUpModel.patch(userId, { codeAt: now }, after(now, STEP_WINDOW_MS));
}

export async function requireCodeStep(userId: string, now = new Date()): Promise<void> {
  const row = await AdminStepUpModel.find(userId);
  if (!fresh(row?.codeAt, now)) throw order("code", "Confirm the emailed code first.");
}

export async function beforeAuthenticator(userId: string, now = new Date()): Promise<void> {
  await requireCodeStep(userId, now);
  if (!(await AdminStepUpModel.takeTotpAttempt(userId, TOTP_MAX_ATTEMPTS))) {
    await AdminStepUpModel.remove(userId);
    throw new ApiError("TOO_MANY_REQUESTS", {
      message: "Too many wrong codes. Start again from the PIN.",
    });
  }
}

export async function resetAuthenticator(userId: string): Promise<void> {
  const db = getDbSync();
  await db.collection("twoFactor").deleteMany({ userId: refIn([userId]) } as never);
  await AdminStepUpModel.remove(userId);
  await db
    .collection(COLLECTIONS.user)
    .updateOne(idIn([userId]) as never, { $set: { twoFactorEnabled: false } });
}

export async function unlockStepUp(userId: string, now = new Date()): Promise<void> {
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
