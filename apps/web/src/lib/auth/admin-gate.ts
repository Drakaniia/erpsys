import { authClient } from "$lib/auth-client";

export type GateError = { message?: string; code?: string } | null | undefined;

export type GateStatus = {
  unlocked: boolean;
  next: "pin" | "password" | "code" | "totp";
  enrolled: boolean;
};

export function gateMessage(error: GateError, fallback: string): string {
  return error?.message?.trim() || fallback;
}

async function post(
  path: string,
  body?: Record<string, unknown>,
): Promise<GateError> {
  const { error } = await authClient.$fetch(path, {
    method: "POST",
    ...(body ? { body } : {}),
  });
  return error as GateError;
}

export const submitPin = (pin: string) => post("/admin-gate/pin", { pin });
export const submitPassword = (password: string) =>
  post("/admin-gate/password", { password });
export const sendEmailCode = () => post("/admin-gate/code/send");
export const verifyEmailCode = (code: string) =>
  post("/admin-gate/code/verify", { code });

export async function fetchGateStatus(): Promise<GateStatus | null> {
  const { data } = await authClient.$fetch<GateStatus>("/admin-gate/status", {
    method: "GET",
  });
  return data ?? null;
}

export async function verifyAuthenticator(
  code: string,
  backup: boolean,
): Promise<GateError> {
  const { error } = backup
    ? await authClient.twoFactor.verifyBackupCode({ code })
    : await authClient.twoFactor.verifyTotp({ code });
  return error as GateError;
}

export async function startEnrollment(password: string): Promise<{
  error?: GateError;
  uri?: string;
  secret?: string;
  backupCodes?: string[];
}> {
  const { data, error } = await authClient.twoFactor.enable({
    ...(password ? { password } : {}),
    issuer: "ERPSYS",
  } as Parameters<typeof authClient.twoFactor.enable>[0]);
  if (error || !data) return { error: (error as GateError) ?? {} };
  return {
    uri: data.totpURI,
    secret: new URL(data.totpURI).searchParams.get("secret") ?? "",
    backupCodes: data.backupCodes,
  };
}

/** The copy-code page reads the emailed code from the URL fragment. */
export function codeFromHash(hash: string): string | null {
  const code = hash.replace(/^#/, "");
  return /^\d{6}$/.test(code) ? code : null;
}
