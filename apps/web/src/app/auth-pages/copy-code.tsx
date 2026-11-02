import { useState } from "react";
import { codeFromHash } from "$lib/auth/admin-gate";

/** `/login/copy-code#123456` — the target of the emailed "Copy code" button. */
export function CopyCodePage() {
  const code = codeFromHash(window.location.hash);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div className="w-full max-w-[400px] rounded-xl border border-auth-border bg-white p-8 text-center shadow-[0_8px_24px_rgba(16,24,40,0.12),0_1px_2px_rgba(16,24,40,0.08)]">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Your sign-in code
        </h1>
        {code ? (
          <>
            <p className="mt-4 font-mono text-3xl font-bold tracking-[0.4em] text-ink select-all">
              {code}
            </p>
            <button
              type="button"
              onClick={() => void copy()}
              className="auth-btn-primary mt-6 w-full"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <p className="mt-3 text-sm text-muted">
              Paste it into the sign-in window.
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">
            This link has no code. Open the latest email from ERPSYS.
          </p>
        )}
      </div>
    </div>
  );
}
