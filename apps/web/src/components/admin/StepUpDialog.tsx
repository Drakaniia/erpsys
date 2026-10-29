import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { dialogTrap } from "$lib/ui/dialog-trap";
import {
  fetchGateStatus,
  gateMessage,
  sendEmailCode,
  startEnrollment,
  submitPassword,
  submitPin,
  verifyAuthenticator,
  verifyEmailCode,
} from "$lib/auth/admin-gate";

type Step = "pin" | "password" | "code" | "totp" | "enroll";

const COPY: Record<Step, { title: string; body: string }> = {
  pin: {
    title: "Administrator PIN",
    body: "Changing integration settings needs extra confirmation. Enter the 6-digit administrator PIN.",
  },
  password: {
    title: "Confirm your password",
    body: "Enter your admin account password.",
  },
  code: {
    title: "Check your email",
    body: "We emailed a 6-digit code to your admin address. It expires in 10 minutes.",
  },
  totp: {
    title: "Authenticator code",
    body: "Enter the 6-digit code from Google Authenticator or Microsoft Authenticator.",
  },
  enroll: {
    title: "Set up your authenticator",
    body: "Scan the QR code with Google Authenticator or Microsoft Authenticator, then enter the 6-digit code it shows.",
  },
};

export default function StepUpDialog({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<Step>("pin");
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [setup, setSetup] = useState<{
    qr: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const trap = dialogTrap(panel, { onEscape: onCancel });
    return () => trap.destroy();
  }, [onCancel]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true);
    setError("");
    const failure = await sendEmailCode();
    setBusy(false);
    if (failure) setError(gateMessage(failure, "Could not send the code."));
    else setCooldown(60);
  }

  const sentOnce = useRef(false);
  useEffect(() => {
    if (step !== "code" || sentOnce.current) return;
    sentOnce.current = true;
    void sendCode();
  }, [step]);

  useEffect(() => {
    if (step !== "enroll") return;
    let cancelled = false;
    void (async () => {
      const result = await startEnrollment(password);
      if (cancelled) return;
      if (!result.uri) {
        setError(gateMessage(result.error, "Could not start setup."));
        return;
      }
      setSetup({
        qr: await QRCode.toDataURL(result.uri, { margin: 1, width: 192 }),
        secret: result.secret ?? "",
        backupCodes: result.backupCodes ?? [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [step, password]);

  function go(next: Step) {
    setStep(next);
    setValue("");
    setBackup(false);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (step === "pin") {
        const failure = await submitPin(value);
        if (failure) return setError(gateMessage(failure, "Incorrect PIN."));
        const status = await fetchGateStatus();
        return go(status?.next === "code" ? "code" : "password");
      }
      if (step === "password") {
        const failure = await submitPassword(value);
        if (failure) return setError(gateMessage(failure, "Incorrect password."));
        setPassword(value);
        return go("code");
      }
      if (step === "code") {
        const failure = await verifyEmailCode(value);
        if (failure) return setError(gateMessage(failure, "Incorrect code."));
        const status = await fetchGateStatus();
        return go(status?.enrolled ? "totp" : "enroll");
      }
      const failure = await verifyAuthenticator(value.trim(), backup);
      if (failure) {
        return setError(gateMessage(failure, "That code did not work."));
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[step];
  const isPassword = step === "password";
  const codeLike = !isPassword && !backup;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full max-w-[420px] overflow-y-auto rounded-xl border border-auth-border bg-surface-raised p-6 shadow-[0_8px_24px_rgba(16,24,40,0.12),0_1px_2px_rgba(16,24,40,0.08)] outline-none"
      >
        <span className="inline-flex items-center rounded-full bg-gold/15 px-3 py-0.5 text-xs font-semibold tracking-wide text-[#9a6700] uppercase">
          Confirm change
        </span>
        <h2
          id="step-up-title"
          className="mt-3 text-lg font-semibold tracking-[-0.02em] text-ink"
        >
          {copy.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">{copy.body}</p>

        {step === "enroll" && setup ? (
          <div className="mt-4 space-y-3">
            <img
              src={setup.qr}
              alt="Authenticator QR code"
              width={192}
              height={192}
              className="mx-auto rounded-lg border border-auth-border"
            />
            <p className="text-center text-xs break-all text-muted">
              Can't scan? Enter this key:{" "}
              <code className="font-mono text-ink select-all">
                {setup.secret}
              </code>
            </p>
            <div className="rounded-lg border border-auth-border bg-surface p-3">
              <p className="text-xs font-semibold text-ink">
                Backup codes — save them now, each works once
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-ink select-all">
                {setup.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-auth-blue"
                onClick={() =>
                  void navigator.clipboard?.writeText(setup.backupCodes.join("\n"))
                }
              >
                Copy backup codes
              </button>
            </div>
          </div>
        ) : null}

        {step !== "enroll" || setup ? (
          <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
            <input
              autoFocus
              required
              type={isPassword ? "password" : "text"}
              inputMode={codeLike ? "numeric" : "text"}
              autoComplete={isPassword ? "current-password" : "one-time-code"}
              aria-label={copy.title}
              maxLength={isPassword ? 128 : backup ? 12 : 6}
              value={value}
              onChange={(e) => {
                setValue(
                  codeLike
                    ? e.target.value.replace(/\D/g, "").slice(0, 6)
                    : e.target.value,
                );
                setError("");
              }}
              className={`auth-input w-full ${
                isPassword ? "" : "text-center font-mono text-xl tracking-[0.4em]"
              }`}
              placeholder={isPassword ? "Password" : backup ? "Backup code" : "000000"}
            />
            {error ? (
              <p className="auth-alert" role="alert" aria-live="polite">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="auth-btn-primary w-full"
              disabled={
                busy || value.length < (isPassword ? 1 : backup ? 8 : 6)
              }
            >
              {busy
                ? "Checking…"
                : step === "enroll"
                  ? "Turn on and continue"
                  : "Continue"}
            </button>
          </form>
        ) : error ? (
          <p className="auth-alert mt-4" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted">Preparing…</p>
        )}

        <div className="mt-4 flex items-center justify-between text-[13px]">
          {step === "code" ? (
            <button
              type="button"
              className="font-medium text-auth-blue disabled:opacity-50"
              disabled={busy || cooldown > 0}
              onClick={() => void sendCode()}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          ) : step === "totp" ? (
            <button
              type="button"
              className="font-medium text-auth-blue"
              onClick={() => {
                setBackup((b) => !b);
                setValue("");
                setError("");
              }}
            >
              {backup ? "Use authenticator app" : "Use a backup code"}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="font-medium text-muted hover:text-ink"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
