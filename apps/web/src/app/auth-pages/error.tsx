import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { prefersReducedMotion, UI_SPRING } from "$lib/motion";
import { useSpring } from "$lib/ui/use-spring";
import { authClient } from "$lib/auth-client";
import { linkFlowStep } from "$lib/auth/link-flow";
import { homeRouteForRole } from "$lib/auth/redirect";

/** `routes/auth/auth/error/+page.svelte` — the OAuth failure surface. */
export function AuthErrorPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionQuery = authClient.useSession();

  const [accounts, setAccounts] = useState<
    { id: string; providerId: string }[]
  >([]);
  const signedIn = !!sessionQuery.data?.user;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void authClient.listAccounts().then((res) => {
      if (!cancelled && res.data) setAccounts(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const error = params.get("error");
  const errorDescription = params.get("error_description");

  const dest = params.get("dest");
  const linkedProviders = accounts.map((a) => a.providerId);

  const step = linkFlowStep({
    error,
    errorDescription,
    signedIn,
    hasGoogleAccount: linkedProviders.includes("google"),
    dest,
  });

  const copy = (() => {
    switch (step.kind) {
      case "confirm-password":
        return {
          title: "One more step",
          description:
            "An account already exists for this email. Sign in with your password first, then connect Google from your account settings.",
        };
      case "link-google":
        return {
          title: "Connect Google",
          description:
            "You're signed in. Connect your Google account to finish setting up sign-in — you can unlink it later.",
        };
      default:
        return { title: "Sign-in problem", description: step.description };
    }
  })();

  const [reduced, setReduced] = useState(false);
  const [panelIn, setPanelIn] = useSpring(0, UI_SPRING);

  useEffect(() => {
    document.title = `${copy.title} — ERPSYS`;
    setReduced(prefersReducedMotion());
    setPanelIn(0, true);
    const raf = requestAnimationFrame(() => setPanelIn(1));
    return () => cancelAnimationFrame(raf);
  }, [copy.title, setPanelIn]);

  const panelStyle = reduced
    ? { opacity: panelIn }
    : { opacity: panelIn, transform: `scale(${0.96 + 0.04 * panelIn})` };

  function goToLogin() {
    navigate(dest ? `/login?dest=${encodeURIComponent(dest)}` : "/login");
  }

  function goToAccounts() {
    navigate("/settings/accounts");
  }

  function goHome() {
    const role = (sessionQuery.data?.user as { role?: string } | undefined)
      ?.role;
    navigate(dest ?? homeRouteForRole(role));
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-4">
      <div
        className="w-full max-w-[400px] rounded-xl border border-auth-border bg-white p-8 shadow-[0_8px_24px_rgba(16,24,40,0.12),0_1px_2px_rgba(16,24,40,0.08)]"
        style={panelStyle}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-6 w-6 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 3.132-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-ink">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.description}</p>

        <div className="mt-6 flex flex-col gap-3">
          {step.kind === "confirm-password" ? (
            <button
              type="button"
              onClick={goToLogin}
              className="press h-11 rounded-lg bg-auth-blue px-4 text-[15px] font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97]"
            >
              Sign in with password
            </button>
          ) : step.kind === "link-google" ? (
            <>
              <button
                type="button"
                onClick={goToAccounts}
                className="press h-11 rounded-lg bg-auth-blue px-4 text-[15px] font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97]"
              >
                Connect Google account
              </button>
              <button
                type="button"
                onClick={goHome}
                className="h-11 rounded-lg border border-auth-border bg-white px-4 text-[15px] font-semibold text-auth-ink transition-colors duration-100 hover:bg-surface"
              >
                Skip for now
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={goToLogin}
              className="press h-11 rounded-lg bg-auth-blue px-4 text-[15px] font-semibold text-white transition-transform duration-100 ease-out active:scale-[0.97]"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
