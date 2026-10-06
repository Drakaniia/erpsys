import { createHash, createHmac } from "node:crypto";
import { env } from "./env.js";
import type { IntegrationKey } from "./integration-settings.js";

export type CredentialFailure = { key: string; reason: string };

export type ProbeResult =
  | { ok: true }
  | { ok: false; failures: CredentialFailure[] };

const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 8_192;
const R2_ENDPOINT_PATTERN =
  /^https:\/\/([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/;

function failed(key: string, reason: string): ProbeResult {
  return { ok: false, failures: [{ key, reason }] };
}

async function readCapped(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, MAX_BODY_BYTES);
  } catch {
    return "";
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function probeGoogle(
  values: Record<string, string>,
): Promise<ProbeResult> {
  const origin = (env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL).replace(/\/+$/, "");
  const body = new URLSearchParams({
    client_id: values.GOOGLE_CLIENT_ID,
    client_secret: values.GOOGLE_CLIENT_SECRET,
    code: "erpsys-credential-probe",
    grant_type: "authorization_code",
    redirect_uri: `${origin}/api/auth/callback/google`,
  });

  let response: Response;
  try {
    response = await send("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    return failed("GOOGLE_CLIENT_ID", "could not reach Google");
  }

  const json = parseJson(await readCapped(response));
  const error = typeof json?.error === "string" ? json.error : "";

  if (response.status === 400) {
    if (error === "invalid_grant" || error === "invalid_request") {
      return { ok: true };
    }
    if (error === "invalid_client") {
      return failed("GOOGLE_CLIENT_ID", "client rejected by Google");
    }
    if (error === "redirect_uri_mismatch") {
      return failed(
        "GOOGLE_CLIENT_ID",
        "redirect URI not authorised for this client",
      );
    }
  }
  if (response.status === 401) {
    return failed("GOOGLE_CLIENT_ID", "client rejected by Google");
  }
  return failed("GOOGLE_CLIENT_ID", `Google answered ${response.status}`);
}

async function probeTurnstile(
  values: Record<string, string>,
): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await send(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: values.TURNSTILE_SECRET_KEY,
          response: "erpsys-credential-probe",
        }),
      },
    );
  } catch {
    return failed("TURNSTILE_SECRET_KEY", "could not reach Cloudflare");
  }

  if (response.status !== 200) {
    return failed("TURNSTILE_SECRET_KEY", `Cloudflare answered ${response.status}`);
  }
  const json = parseJson(await readCapped(response));
  const codes = Array.isArray(json?.["error-codes"])
    ? (json["error-codes"] as unknown[]).map(String)
    : [];

  if (
    codes.includes("invalid-input-response") ||
    codes.includes("timeout-or-duplicate")
  ) {
    return { ok: true };
  }
  if (codes.includes("invalid-input-secret")) {
    return failed("TURNSTILE_SECRET_KEY", "secret rejected by Cloudflare");
  }
  if (codes.includes("missing-input-secret")) {
    return failed("TURNSTILE_SECRET_KEY", "secret rejected by Cloudflare");
  }
  return failed("TURNSTILE_SECRET_KEY", "provider returned an unexpected response");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signedR2Headers(args: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Record<string, string> {
  const url = new URL(`${args.endpoint}/${encodeURIComponent(args.bucket)}`);
  const amzDate = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `HEAD\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;

  const kSigning = hmac(
    hmac(hmac(hmac(`AWS4${args.secretAccessKey}`, dateStamp), "auto"), "s3"),
    "aws4_request",
  );
  const signature = hmac(kSigning, stringToSign).toString("hex");

  return {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function probeR2(values: Record<string, string>): Promise<ProbeResult> {
  const endpoint = values.R2_ENDPOINT.trim().replace(/\/+$/, "");
  if (!R2_ENDPOINT_PATTERN.test(endpoint)) {
    return failed(
      "R2_ENDPOINT",
      "expected https://<32 hex characters>.r2.cloudflarestorage.com",
    );
  }
  const bucket = values.R2_BUCKET.trim();

  let response: Response;
  try {
    response = await send(
      `${endpoint}/${encodeURIComponent(bucket)}`,
      {
        method: "HEAD",
        headers: signedR2Headers({
          endpoint,
          bucket,
          accessKeyId: values.R2_ACCESS_KEY_ID,
          secretAccessKey: values.R2_SECRET_ACCESS_KEY,
        }),
      },
    );
  } catch {
    return failed("R2_ENDPOINT", "could not reach R2");
  }

  if (response.status === 200) return { ok: true };
  if (response.status === 403) {
    return failed("R2_ACCESS_KEY_ID", "key rejected");
  }
  if (response.status === 404) {
    return failed("R2_BUCKET", "bucket not found");
  }
  return failed("R2_ENDPOINT", `R2 answered ${response.status}`);
}

async function probeCloudflareChat(
  values: Record<string, string>,
): Promise<ProbeResult> {
  const account = values.CLOUDFLARE_ACCOUNT_ID.trim();
  let response: Response;
  try {
    response = await send(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/models`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${values.CLOUDFLARE_API_TOKEN}`,
          "content-type": "application/json",
        },
      },
    );
  } catch {
    return failed("CLOUDFLARE_API_TOKEN", "could not reach Cloudflare");
  }

  if (response.status === 401 || response.status === 403) {
    return failed("CLOUDFLARE_API_TOKEN", "token rejected");
  }
  if (response.status === 404) {
    return failed("CLOUDFLARE_ACCOUNT_ID", "account not found");
  }
  if (response.status !== 200) {
    return failed(
      "CLOUDFLARE_API_TOKEN",
      `provider returned an unexpected response (${response.status})`,
    );
  }
  const json = parseJson(await readCapped(response));
  if (json?.success === true) return { ok: true };
  return failed("CLOUDFLARE_API_TOKEN", "provider returned an unexpected response");
}

async function probeEmail(values: Record<string, string>): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await send("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: {
        "api-key": values.BREVO_API_KEY,
        accept: "application/json",
      },
    });
  } catch {
    return failed("BREVO_API_KEY", "could not reach Brevo");
  }

  if (response.status === 200) return { ok: true };
  if (response.status === 401) return failed("BREVO_API_KEY", "API key rejected");
  return failed("BREVO_API_KEY", `Brevo answered ${response.status}`);
}

async function probeGoogleForms(
  values: Record<string, string>,
): Promise<ProbeResult> {
  if (!env.GOOGLE_CLIENT_ID.trim() || !env.GOOGLE_CLIENT_SECRET.trim()) {
    return failed(
      "GOOGLE_FORMS_REFRESH_TOKEN",
      "set the Google sign-in client ID and secret first",
    );
  }

  let response: Response;
  try {
    response = await send("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: values.GOOGLE_FORMS_REFRESH_TOKEN.trim(),
      }),
    });
  } catch {
    return failed("GOOGLE_FORMS_REFRESH_TOKEN", "could not reach Google");
  }

  if (response.status === 200) return { ok: true };
  const json = parseJson(await readCapped(response));
  const error = typeof json?.error === "string" ? json.error : "";
  if (error === "invalid_grant") {
    return failed(
      "GOOGLE_FORMS_REFRESH_TOKEN",
      "token rejected — expired, revoked, or minted for another client",
    );
  }
  if (error === "invalid_client" || response.status === 401) {
    return failed(
      "GOOGLE_FORMS_REFRESH_TOKEN",
      "Google sign-in client rejected by Google",
    );
  }
  return failed("GOOGLE_FORMS_REFRESH_TOKEN", `Google answered ${response.status}`);
}

function probeGoogleCalendar(values: Record<string, string>): ProbeResult {
  if (values.CALENDAR_TOKEN_KEY.trim().length < 32) {
    return failed("CALENDAR_TOKEN_KEY", "use at least 32 characters");
  }
  if (!env.GOOGLE_CLIENT_ID.trim() || !env.GOOGLE_CLIENT_SECRET.trim()) {
    return failed(
      "CALENDAR_TOKEN_KEY",
      "set the Google sign-in client ID and secret first",
    );
  }
  return { ok: true };
}

export async function probeCredentials(
  key: IntegrationKey,
  values: Record<string, string>,
): Promise<ProbeResult> {
  switch (key) {
    case "googleAuth":
      return probeGoogle(values);
    case "turnstile":
      return probeTurnstile(values);
    case "r2":
      return probeR2(values);
    case "cloudflareChat":
      return probeCloudflareChat(values);
    case "email":
      return probeEmail(values);
    case "googleForms":
      return probeGoogleForms(values);
    case "googleCalendar":
      return probeGoogleCalendar(values);
  }
}
