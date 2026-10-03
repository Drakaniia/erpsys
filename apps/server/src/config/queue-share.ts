import { createHmac, timingSafeEqual } from "node:crypto";

export const SHARE_TOKEN_VERSION = 1;

type ShareTokenPayload = {
  v: number;
  d: string;
  a: string;
  y: string;
};

type VerifyFailure = "MALFORMED" | "BAD_SIGNATURE" | "UNSUPPORTED_VERSION";

type VerifyResult =
  | { ok: true; payload: ShareTokenPayload }
  | { ok: false; reason: VerifyFailure };

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function hmac(payload: string, secret: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

function signaturesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function signShareToken(
  payload: ShareTokenPayload,
  secret: string,
): string {
  if (!secret) {
    throw new Error("[queue-share] refusing to sign with an empty secret");
  }
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
}

export function verifyShareToken(token: string, secret: string): VerifyResult {
  if (!token || !secret) return { ok: false, reason: "MALFORMED" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" };
  const [body, signature] = parts;
  if (!body || !signature) return { ok: false, reason: "MALFORMED" };

  if (!signaturesMatch(signature, hmac(body, secret))) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "MALFORMED" };
  }

  const p = parsed as Partial<ShareTokenPayload>;
  if (
    typeof p.v !== "number" ||
    typeof p.d !== "string" ||
    typeof p.a !== "string" ||
    typeof p.y !== "string" ||
    !p.d ||
    !p.a ||
    !p.y
  ) {
    return { ok: false, reason: "MALFORMED" };
  }
  if (p.v !== SHARE_TOKEN_VERSION) {
    return { ok: false, reason: "UNSUPPORTED_VERSION" };
  }

  return {
    ok: true,
    payload: { v: p.v, d: p.d, a: p.a, y: p.y },
  };
}

export function buildQueueShareToken(args: {
  departmentId: string;
  adviserId: string;
  academicYearId: string;
  secret: string;
}): string {
  return signShareToken(
    {
      v: SHARE_TOKEN_VERSION,
      d: args.departmentId,
      a: args.adviserId,
      y: args.academicYearId,
    },
    args.secret,
  );
}

export function buildQueueShareUrl(args: {
  token: string;
  origin: string;
}): string {
  const trimmed = args.origin.replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error(
      "[queue-share] cannot build a share URL without a public origin",
    );
  }
  return `${trimmed}/queue?s=${encodeURIComponent(args.token)}`;
}
