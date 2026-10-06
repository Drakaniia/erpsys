type VerifyTurnstileOptions = {
  secret?: string;
  remoteIp?: string;
  expectedAction?: string;
  expectedHostnames?: Set<string> | string[];
};

type VerifyTurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
  errorCodes?: string[];
};

export async function verifyTurnstile(
  token: string,
  opts: VerifyTurnstileOptions = {},
): Promise<VerifyTurnstileResult> {
  const { env } = await import("./env.js");
  const secret = opts.secret ?? env.TURNSTILE_SECRET_KEY ?? "";
  const { integrationEnabled } = await import("./integration-settings.js");
  if (!secret || !(await integrationEnabled("turnstile"))) {
    return { success: true };
  }

  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { success: false, errorCodes: ["invalid-input-response"] };
  }

  const rawHostnames =
    opts.expectedHostnames ?? env.TURNSTILE_HOSTNAMES.split(",");
  const hostSet =
    rawHostnames instanceof Set
      ? rawHostnames
      : new Set(rawHostnames.map((h) => h.trim()).filter(Boolean));

  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp) body.set("remoteip", opts.remoteIp);

  let json: {
    success: boolean;
    hostname?: string;
    action?: string;
    "error-codes"?: string[];
  };
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok)
      return { success: false, errorCodes: [`siteverify-${res.status}`] };
    json = (await res.json()) as typeof json;
  } catch {
    return { success: false, errorCodes: ["siteverify-network-error"] };
  }

  if (!json.success) {
    return {
      success: false,
      hostname: json.hostname,
      action: json.action,
      errorCodes: json["error-codes"] ?? ["unknown"],
    };
  }
  if (opts.expectedAction && json.action !== opts.expectedAction) {
    return {
      success: false,
      hostname: json.hostname,
      action: json.action,
      errorCodes: ["action-mismatch"],
    };
  }
  if (hostSet.size > 0 && json.hostname && !hostSet.has(json.hostname)) {
    return {
      success: false,
      hostname: json.hostname,
      action: json.action,
      errorCodes: ["hostname-mismatch"],
    };
  }
  if (hostSet.size > 0 && !json.hostname) {
    return { success: false, errorCodes: ["hostname-missing"] };
  }
  return {
    success: true,
    hostname: json.hostname,
    action: json.action,
    errorCodes: json["error-codes"],
  };
}
