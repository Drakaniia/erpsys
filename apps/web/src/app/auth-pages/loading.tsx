import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import { isInternalPath } from "$lib/auth/completion-gate";
import { api } from "$lib/api";
import type { CalendarStatus } from "$lib/domain/types";
import { notify } from "$lib/notifications";
import DitherLoader from "../../components/ui/DitherLoader";

/** The post-sign-in hop: resolves the session, then sends the user on. */
export function LoadingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const message = params.get("message") ?? "Signing you in…";
  const dest = params.get("dest");
  const googleLogin = params.get("provider") === "google";

  useEffect(() => {
    document.title = `${message} — ERPSYS`;
    let cancelled = false;

    void (async () => {
      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return;

      let role: string | undefined;
      try {
        const session = await authClient.getSession();
        role = (session.data?.user as { role?: string } | undefined)?.role;
      } catch {
        role = undefined;
      }
      if (cancelled) return;
      if (!role) {
        navigate("/login", { replace: true });
        return;
      }

      const finalDest = isInternalPath(dest) ? dest! : homeRouteForRole(role);
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
      await new Promise((r) => setTimeout(r, 600));
      if (!cancelled) navigate(finalDest, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [message, dest, googleLogin, navigate]);

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
