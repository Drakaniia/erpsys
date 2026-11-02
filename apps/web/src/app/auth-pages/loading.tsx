import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import DitherLoader from "../../components/ui/DitherLoader";

/** `routes/auth/loading/+page.svelte` — the post-sign-in hop. */
export function LoadingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const message = params.get("message") ?? "Signing you in…";
  const dest = params.get("dest") ?? "";

  useEffect(() => {
    document.title = `${message} — ERPSYS`;
    let cancelled = false;

    void (async () => {
      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return;

      const session = await authClient.getSession();
      const user = session.data?.user as { role?: string } | undefined;
      if (!user?.role) return;

      const finalDest = dest || homeRouteForRole(user.role);
      await new Promise((r) => setTimeout(r, 600));
      if (!cancelled) navigate(finalDest);
    })();

    return () => {
      cancelled = true;
    };
  }, [message, dest, navigate]);

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-white">
      <DitherLoader size="lg" />
      <p className="mt-6 text-sm font-medium text-muted">{message}</p>
    </div>
  );
}
