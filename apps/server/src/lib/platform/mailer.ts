import { COLLECTIONS, getDbSync, idIn } from "../db/db.js";
import { env } from "./env.js";
import { integrationConfigured, integrationEnabled } from "./integration-settings.js";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function sender(raw: string): { email: string; name?: string } {
  const match = /^(.*)<([^>]+)>\s*$/.exec(raw.trim());
  if (!match) return { email: raw.trim() };
  const name = match[1].trim();
  return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendMail(message: MailMessage): Promise<boolean> {
  const to = message.to.trim();
  if (!to || !integrationConfigured("email")) return false;
  if (!(await integrationEnabled("email"))) return false;
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: sender(env.MAIL_FROM),
        to: [{ email: to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent:
          message.html ?? `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>`,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      console.error(
        `[mailer] Brevo rejected "${message.subject}" with ${response.status}: ${detail}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[mailer] could not send "${message.subject}"`, error);
    return false;
  }
}

export const siteOrigin = () => env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL;

export function mailUser(userId: string, subject: string, text: string): void {
  void getDbSync()
    .collection<{ email?: string }>(COLLECTIONS.user)
    .findOne(idIn([userId]) as never)
    .then((user) =>
      user?.email?.trim()
        ? sendMail({ to: user.email.trim(), subject, text })
        : false,
    )
    .catch((error) => console.error(`[mailer] could not mail "${subject}"`, error));
}
