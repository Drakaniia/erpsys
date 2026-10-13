import { env } from "./env.js";
import {
  integrationConfigured,
  integrationEnabled,
} from "./integration-settings.js";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function sender(raw: string): { email: string; name?: string } {
  const match = /^(.*)<([^>]+)>\s*$/.exec(raw.trim());
  if (!match) return { email: raw.trim() };
  const email = match[2].trim();
  const name = match[1].trim();
  return name ? { email, name } : { email };
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
    const response = await fetch(BREVO_ENDPOINT, {
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
          message.html ??
          `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>`,
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
