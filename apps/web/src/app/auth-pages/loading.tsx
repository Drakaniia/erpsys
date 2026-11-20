import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole, surfaceForAppPath } from "$lib/auth/redirect";
import { isInternalPath } from "$lib/auth/completion-gate";
import { loginWithReason, markSignedOut } from "$lib/auth/session-guard";
import { roleLabel } from "$lib/auth/role-label";
import { api, queryClient } from "$lib/api";
import { canEnterSurface } from "$lib/domain/roles";
import type { CalendarStatus } from "$lib/domain/types";
import { notify } from "$lib/notifications";
import { clearPersistedCache } from "$lib/perf/persist";
import { dialogTrap } from "$lib/ui/dialog-trap";
import DitherLoader from "../../components/ui/DitherLoader";

/** The post-sign-in hop: resolves the session, then sends the user on. */
export function LoadingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const message = params.get("message") ?? "Signing you in…";
  const rawDest = params.get("dest");
  const dest = rawDest && isInternalPath(rawDest) ? rawDest : null;
  const googleLogin = params.get("provider") === "google";
  const [role, setRole] = useState<string | null>(null);
  const [acceptedRole, setAcceptedRole] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const surface = surfaceForAppPath(dest);
  const wrongDoor = !!(role && surface && !canEnterSurface(role, surface));
  const confirming = wrongDoor && acceptedRole !== role;

  useEffect(() => {
    document.title = `${message} — ERPSYS`;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let signedInRole: string | undefined;
      try {
        const session = await authClient.getSession();
        signedInRole = (session.data?.user as { role?: string } | undefined)
          ?.role;
      } catch {
        signedInRole = undefined;
      }
      if (cancelled) return;
      if (signedInRole) setRole(signedInRole);
      else navigate(loginWithReason(undefined, dest), { replace: true });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [message, dest, navigate]);

  useEffect(() => {
    if (!confirming || !dialog.current) return;
    const trap = dialogTrap(dialog.current, { initialFocus: "panel" });
    return () => trap.destroy();
  }, [confirming]);

  useEffect(() => {
    if (!role || confirming) return;
    let cancelled = false;
    const finalDest = (!wrongDoor && dest) || homeRouteForRole(role);
    void (async () => {
      if (googleLogin && role === "ENROLLMENT_ADVISER") {
        try {
          const calendar =
            (await api.instructor.getMyCalendar.call()) as CalendarStatus;
          if (cancelled) return;
          if (calendar.available && calendar.status !== "CONNECTED") {
            const { url } = (await api.instructor.connectCalendar.call()) as {
              url: string;
            };
            if (!cancelled) window.location.assign(url);
            return;
          }
        } catch {
          if (cancelled) return;
          notify.warning(
            "Signed in. Calendar could not connect; retry from Department → Schedule.",
          );
        }
      }
      if (!cancelled) navigate(finalDest, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [role, confirming, wrongDoor, dest, googleLogin, navigate]);

  async function chooseAnotherAccount() {
    setError("");
    setSwitching(true);
    try {
      await queryClient.cancelQueries().catch(() => undefined);
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      queryClient.clear();
      clearPersistedCache();
      markSignedOut();
      navigate(loginWithReason("signed-out", dest), { replace: true });
    } catch {
      setError("Could not sign out. Please try again.");
      setSwitching(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <div
          ref={dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wrong-door-title"
          aria-describedby="wrong-door-description"
          tabIndex={-1}
          className="w-full max-w-md rounded-xl border border-auth-border bg-white p-6 shadow-lg outline-none"
        >
          <h1 id="wrong-door-title" className="text-lg font-semibold text-ink">
            Continue with this account?
          </h1>
          <p
            id="wrong-door-description"
            className="mt-2 text-sm leading-6 text-muted"
          >
            You signed in as{" "}
            <strong className="text-ink">{roleLabel(role)}</strong>. This
            account cannot open the requested console. Continue to your own
            console, or choose another account.
          </p>
          {error ? (
            <p role="alert" className="auth-alert mt-4">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              className="auth-btn-primary"
              disabled={switching}
              onClick={() => setAcceptedRole(role)}
            >
              Continue
            </button>
            <button
              type="button"
              className="auth-btn-secondary"
              disabled={switching}
              onClick={() => void chooseAnotherAccount()}
            >
              {switching ? "Signing out…" : "Choose another account"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex min-h-dvh w-full flex-col items-center justify-center bg-white"
    >
      <DitherLoader size="lg" />
      <p className="mt-6 text-sm font-medium text-muted">{message}</p>
    </div>
  );
}
