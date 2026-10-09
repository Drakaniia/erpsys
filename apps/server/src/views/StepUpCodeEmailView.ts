import { env } from "../lib/platform/env.js";
import { escapeHtml, type MailMessage } from "../lib/platform/mailer.js";

export function stepUpCodeEmail(input: {
  to: string;
  name?: string | null;
  code: string;
  minutes: number;
}): MailMessage {
  const origin = env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL;
  const copyUrl = `${origin.replace(/\/+$/, "")}/login/copy-code#${input.code}`;
  const who = escapeHtml(input.name?.trim() || "there");
  return {
    to: input.to,
    subject: `${input.code} is your ERPSYS confirmation code`,
    text: `Hi ${input.name?.trim() || "there"},\n\nYour ERPSYS confirmation code for changing integration settings is ${input.code}. It expires in ${input.minutes} minutes and works once.\n\nCopy it here: ${copyUrl}\n\nIf you did not start this, change your password now.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#101828">
<p style="margin:0 0 12px">Hi ${who},</p>
<p style="margin:0 0 16px">Use this code to confirm a change to the ERPSYS integration settings. It expires in ${input.minutes} minutes and works once.</p>
<p style="margin:0 0 16px;padding:16px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;background:#f2f4f7;border-radius:8px;user-select:all">${input.code}</p>
<p style="margin:0 0 16px;text-align:center"><a href="${escapeHtml(copyUrl)}" style="display:inline-block;padding:10px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Copy code</a></p>
<p style="margin:0;font-size:13px;color:#667085">If you did not start this, change your password now.</p>
</div>`,
  };
}
