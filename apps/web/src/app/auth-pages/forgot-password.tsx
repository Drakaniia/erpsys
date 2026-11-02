import { useEffect } from "react";
import { Link } from "react-router";

/** `routes/auth/login/forgot-password/+page.svelte` — static guidance page. */
export function ForgotPasswordPage() {
  useEffect(() => {
    document.title = "Forgot Password — ERPSYS";
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content =
      "Request a password reset link for your ERPSYS account using your BukSU institutional email.";
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = window.location.origin + "/login/forgot-password";
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4 py-10">
      <div className="auth-enter w-full max-w-[440px]">
        <div className="rounded-lg border border-auth-border bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.08)]">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-auth-ink">
            Forgot your password?
          </h1>

          <div className="mt-6 rounded-lg bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-auth-blue"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <div>
                <p className="text-sm font-medium text-auth-ink">
                  Contact your administrator
                </p>
                <p className="mt-1 text-sm text-muted">
                  Please contact your SBO Officer or administrator for password
                  reset assistance.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-auth-blue hover:underline"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
