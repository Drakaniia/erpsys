import type { IntegrationKey } from "./integration-settings.js";

export type CredentialClass = "secret" | "plain";

export type CredentialFieldSpec = {
  envKey: string;
  label: string;
  hint: string;
  helpUrl?: string;
  className: CredentialClass;
  required: boolean;
  pair?: string;
};

const GOOGLE_CONSOLE = "https://console.cloud.google.com/apis/credentials";

export const CREDENTIAL_FIELDS: Record<
  IntegrationKey,
  CredentialFieldSpec[]
> = {
  googleAuth: [
    {
      envKey: "GOOGLE_CLIENT_ID",
      label: "Client ID",
      hint: "OAuth 2.0 client ID from Google Cloud → APIs & Services → Credentials.",
      helpUrl: GOOGLE_CONSOLE,
      className: "secret",
      required: true,
      pair: "GOOGLE_CLIENT_SECRET",
    },
    {
      envKey: "GOOGLE_CLIENT_SECRET",
      label: "Client secret",
      hint: "The client's secret. Authorised redirect URI: /api/auth/callback/google on this site.",
      helpUrl: GOOGLE_CONSOLE,
      className: "secret",
      required: true,
      pair: "GOOGLE_CLIENT_ID",
    },
  ],
  turnstile: [
    {
      envKey: "TURNSTILE_SECRET_KEY",
      label: "Secret key",
      hint: "Server-side secret of the Turnstile widget.",
      helpUrl: "https://dash.cloudflare.com/?to=/:account/turnstile",
      className: "secret",
      required: true,
      pair: "VITE_TURNSTILE_SITE_KEY",
    },
    {
      envKey: "VITE_TURNSTILE_SITE_KEY",
      label: "Site key",
      hint: "Public site key of the same widget. Applies without a restart.",
      helpUrl: "https://dash.cloudflare.com/?to=/:account/turnstile",
      className: "plain",
      required: true,
      pair: "TURNSTILE_SECRET_KEY",
    },
    {
      envKey: "TURNSTILE_HOSTNAMES",
      label: "Allowed hostnames",
      hint: "Comma-separated hostnames the widget is served on. Empty uses Cloudflare's default check.",
      className: "plain",
      required: false,
    },
  ],
  r2: [
    {
      envKey: "R2_BUCKET",
      label: "Bucket",
      hint: "Standard-class bucket that stores evidence files.",
      className: "plain",
      required: true,
    },
    {
      envKey: "R2_ENDPOINT",
      label: "Endpoint",
      hint: "https://<account id>.r2.cloudflarestorage.com — no path, query or port.",
      helpUrl: "https://dash.cloudflare.com/?to=/:account/r2/api-tokens",
      className: "plain",
      required: true,
    },
    {
      envKey: "R2_ACCESS_KEY_ID",
      label: "Access key ID",
      hint: "R2 API token with Object Read & Write on this bucket only.",
      helpUrl: "https://dash.cloudflare.com/?to=/:account/r2/api-tokens",
      className: "secret",
      required: true,
      pair: "R2_SECRET_ACCESS_KEY",
    },
    {
      envKey: "R2_SECRET_ACCESS_KEY",
      label: "Secret access key",
      hint: "Secret half of the same R2 token.",
      helpUrl: "https://dash.cloudflare.com/?to=/:account/r2/api-tokens",
      className: "secret",
      required: true,
      pair: "R2_ACCESS_KEY_ID",
    },
  ],
  cloudflareChat: [
    {
      envKey: "CLOUDFLARE_ACCOUNT_ID",
      label: "Account ID",
      hint: "Cloudflare account that owns Workers AI.",
      className: "plain",
      required: true,
    },
    {
      envKey: "CLOUDFLARE_API_TOKEN",
      label: "API token",
      hint: "Token with Workers AI run permission.",
      helpUrl: "https://dash.cloudflare.com/profile/api-tokens",
      className: "secret",
      required: true,
    },
  ],
  email: [
    {
      envKey: "BREVO_API_KEY",
      label: "API key",
      hint: "Brevo transactional API key (v3).",
      helpUrl: "https://app.brevo.com/settings/keys/api",
      className: "secret",
      required: true,
    },
    {
      envKey: "MAIL_FROM",
      label: "Sender",
      hint: "A sender verified in Brevo — \"Name <addr>\" or a bare address.",
      helpUrl: "https://app.brevo.com/senders",
      className: "plain",
      required: true,
    },
  ],
  googleForms: [
    {
      envKey: "GOOGLE_FORMS_REFRESH_TOKEN",
      label: "Refresh token",
      hint: "OAuth refresh token of the account that owns the forms, minted against the Google sign-in client with the forms.body, forms.responses.readonly and drive.file scopes.",
      helpUrl: "https://developers.google.com/oauthplayground",
      className: "secret",
      required: true,
    },
  ],
  googleCalendar: [
    {
      envKey: "CALENDAR_TOKEN_KEY",
      label: "Token encryption key",
      hint: "Random secret of 32+ characters that encrypts instructors' Calendar refresh tokens. Changing it disconnects every instructor. Authorised redirect URI: /api/v1/calendar/callback on this site.",
      helpUrl: GOOGLE_CONSOLE,
      className: "secret",
      required: true,
    },
  ],
};

export const CREDENTIAL_ENV_KEYS: readonly string[] = Object.values(
  CREDENTIAL_FIELDS,
).flatMap((fields) => fields.map((field) => field.envKey));

export const MASK = "••••••••••••";

export function maskSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value.length < 6) return MASK;
  return value.slice(0, 5) + MASK;
}

export function credentialKeysOf(key: IntegrationKey): readonly string[] {
  return CREDENTIAL_FIELDS[key].map((field) => field.envKey);
}
