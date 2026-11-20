import { useRef, useState } from "react";
import { codeFromHash } from "$lib/auth/admin-gate";
import { copyText } from "$lib/clipboard";

/** `/login/copy-code#123456` — the target of the emailed "Open copy page" button. */
export function CopyCodePage() {
  const code = codeFromHash(window.location.hash);
  const codeInput = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "manual"
  >("idle");

  async function copy() {
    if (!code) return;
    const copied = await copyText(code);
    setCopyState(copied ? "copied" : "manual");
    if (!copied) {
      codeInput.current?.focus();
      codeInput.current?.select();
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
            <input
              ref={codeInput}
              aria-label="Confirmation code"
              readOnly
              value={code}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-4 w-full border-0 bg-transparent text-center font-mono text-3xl font-bold tracking-[0.4em] text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="auth-btn-primary mt-6 w-full"
            >
              {copyState === "copied" ? "Copied" : "Copy code"}
            </button>
            <p className="mt-3 text-sm text-muted" role="status">
              {copyState === "manual"
                ? "The code is selected. Copy it with your device’s menu or Ctrl+C, then paste it into the sign-in window."
                : "Paste it into the sign-in window."}
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
