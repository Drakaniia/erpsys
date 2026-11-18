import { useEffect, useId, useRef, useState } from "react";
import { authClient } from "$lib/auth-client";
import { useIntegrations } from "$lib/integrations/use-integrations";
import Turnstile, { type TurnstileHandle } from "./Turnstile";

export default function EmailCodeForm({ email: accountEmail, onSuccess }: {
  email?: string;
  onSuccess: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState(accountEmail ?? "");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [token, setToken] = useState("");
  const turnstile = useRef<TurnstileHandle | null>(null);
  const { flags, turnstileSiteKey } = useIntegrations();
  const verification = accountEmail !== undefined;
  const challenge = !verification && flags.turnstile && !!turnstileSiteKey;

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    if (busy || cooldown) return;
    setError("");
    if (challenge && !token) {
      setError("Please complete the verification challenge.");
      return;
    }
    setBusy(true);
    try {
      const target = email.trim();
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: target,
        type: verification ? "email-verification" : "sign-in",
        fetchOptions: { headers: { "cf-turnstile-response": token } },
      });
      if (result.error) {
        setError(result.error.message || "Could not send the code. Please try again.");
        return;
      }
      setSentTo(target);
      setCode("");
      setCooldown(60);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
      setToken("");
      try { turnstile.current?.reset(); } catch { /* The widget may have unmounted. */ }
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = verification
        ? await authClient.emailOtp.verifyEmail({ email: sentTo, otp: code })
        : await authClient.signIn.emailOtp({ email: sentTo, otp: code });
      if (result.error) {
        setError(result.error.message || "The code could not be verified. Request a new one if it expired.");
        return;
      }
      onSuccess();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        {verification ? <p className="text-sm text-muted">{email}</p> : (
          <div>
            <label htmlFor={`${id}-email`} className="text-sm font-medium">Email</label>
            <input id={`${id}-email`} type="email" autoComplete="email" required value={email}
              disabled={busy} onChange={(event) => { setEmail(event.target.value); setSentTo(""); setError(""); }}
              className="mt-1 w-full rounded-lg border border-auth-border px-3 py-2" />
          </div>
        )}
        {challenge ? <Turnstile ref={turnstile} sitekey={turnstileSiteKey} action="login"
          onToken={setToken} onExpire={() => setToken("")} onError={() => { setToken(""); setError("Verification failed. Please retry the challenge."); }} /> : null}
        <button type="submit" className="auth-btn-secondary" disabled={busy || cooldown > 0}>
          {cooldown ? `Resend in ${cooldown}s` : sentTo ? "Resend code" : "Send email code"}
        </button>
      </form>
      {sentTo ? (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void verify(); }}>
          <p role="status" className="text-sm text-muted">
            {verification ? "Check your inbox for a code." : "If an account exists, a code has been sent."} It expires in 5 minutes.
          </p>
          <div>
            <label htmlFor={`${id}-code`} className="text-sm font-medium">Email code</label>
            <input id={`${id}-code`} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}"
              maxLength={6} required value={code} disabled={busy} onChange={(event) => setCode(event.target.value)}
              className="mt-1 w-full rounded-lg border border-auth-border px-3 py-2" />
          </div>
          <button type="submit" className="auth-btn-primary" disabled={busy}>
            {busy ? "Checking…" : verification ? "Verify email" : "Sign in with code"}
          </button>
        </form>
      ) : null}
      {error ? <p className="auth-alert" role="alert">{error}</p> : null}
    </div>
  );
}
