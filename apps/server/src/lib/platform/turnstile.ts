import { env } from "./env.js";
import { integrationEnabled } from "./integration-settings.js";

type VerifyTurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
  errorCodes?: string[];
};

export async function verifyTurnstile(
  token: string,
  opts: {
    secret?: string;
    remoteIp?: string;
    expectedAction?: string;
    expectedHostnames?: Set<string> | string[];
  } = {},
): Promise<VerifyTurnstileResult> {
  const secret = opts.secret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret || !(await integrationEnabled("turnstile"))) return { success: true };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { success: false, errorCodes: ["invalid-input-response"] };
  }
  const hosts = new Set(
    [...(opts.expectedHostnames ?? env.TURNSTILE_HOSTNAMES.split(","))]
      .map((host) => host.trim())
      .filter(Boolean),
  );
  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp) body.set("remoteip", opts.remoteIp);

  let json: { success: boolean; hostname?: string; action?: string; "error-codes"?: string[] };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { success: false, errorCodes: [`siteverify-${res.status}`] };
    json = (await res.json()) as typeof json;
  } catch {
    return { success: false, errorCodes: ["siteverify-network-error"] };
  }

  const seen = { hostname: json.hostname, action: json.action };
  if (!json.success) {
    return { success: false, ...seen, errorCodes: json["error-codes"] ?? ["unknown"] };
  }
  if (opts.expectedAction && json.action !== opts.expectedAction) {
    return { success: false, ...seen, errorCodes: ["action-mismatch"] };
  }
  if (hosts.size > 0 && json.hostname && !hosts.has(json.hostname)) {
    return { success: false, ...seen, errorCodes: ["hostname-mismatch"] };
  }
  if (hosts.size > 0 && !json.hostname) {
    return { success: false, errorCodes: ["hostname-missing"] };
  }
  return { success: true, ...seen, errorCodes: json["error-codes"] };
}
