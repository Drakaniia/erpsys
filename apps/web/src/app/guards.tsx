import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { loginRouteForSessionLoss } from "$lib/auth/session-guard";
import { homeRouteForRole } from "$lib/auth/redirect";
import {
  COMPLETION_ALLOWED_PATHS,
  COMPLETION_DEST_KEY,
  COMPLETION_PATH,
  completionGate,
  isInternalPath,
} from "$lib/auth/completion-gate";
import { api, queryClient } from "$lib/api";
import { markLaunch } from "$lib/perf/launch-metrics";
import { clearPersistedCache } from "$lib/perf/persist";
import {
  persistedOwnerId,
  writeSessionSnapshot,
} from "$lib/perf/session-cache";
import { useLaunchSession } from "$lib/perf/use-launch-session";
import PageLoader from "../components/ui/PageLoader";

// ponytail: component guards instead of Data Router loaders — one redirect
// mechanism matching App.svelte $effect semantics; upgrade to loaders when
// route prefetch measurably matters.
export function HashRedirect() {
  const { hash, search } = window.location;
  if (hash.startsWith("#/")) {
    const target = hash.slice(1) + (hash.includes("?") ? "" : search);
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}

export function RootGate() {
  const { data, isPending, usingFallback } = useLaunchSession();
  const location = useLocation();
  const p = location.pathname;

  const user = data?.user;
  const role = user?.role;

  // The snapshot may choose what renders; it never decides what is allowed.
  // A different live account clears the persisted cache before its data paints.
  useEffect(() => {
    if (isPending || !user?.id) return;
    const owner = persistedOwnerId();
    if (owner && owner !== user.id) {
      queryClient.clear();
      clearPersistedCache();
      // The live account is the one that may be cached next time.
      writeSessionSnapshot(user as unknown as Record<string, unknown>);
    }
  }, [isPending, user?.id]);

  const profile = useQuery({
    ...api.student.profileStatus.queryOptions({
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }),
    enabled: role === "STUDENT",
  });
  const hasProfile = (profile.data as { hasProfile?: boolean } | undefined)
    ?.hasProfile;

  // First settle wins: if the cached session rendered the shell, the mark
  // records a warm session even though the live value replaces it later.
  useEffect(() => {
    if (usingFallback) markLaunch("session", { cached: true });
    else if (!isPending) markLaunch("session", { cached: false });
  }, [usingFallback, isPending]);

  useEffect(() => {
    if (isPending) return;
    if (
      role === "STUDENT" &&
      hasProfile === false &&
      !COMPLETION_ALLOWED_PATHS.has(p) &&
      completionGate({ path: p, role, hasProfile }) === "redirect-to-completion"
    ) {
      if (isInternalPath(p)) {
        try {
          sessionStorage.setItem(COMPLETION_DEST_KEY, p);
        } catch {
          /* storage blocked */
        }
      }
    }
  }, [isPending, role, hasProfile, p]);

  if (isPending) return <PageLoader label="Loading session" />;
  if (!user) {
    if (
      p.startsWith("/student") ||
      p.startsWith("/queue") ||
      p.startsWith("/officer") ||
      p.startsWith("/instructor") ||
      p.startsWith("/admin") ||
      p === COMPLETION_PATH ||
      p === "/settings/accounts"
    ) {
      return <Navigate to={loginRouteForSessionLoss()} replace />;
    }
    return <Outlet />;
  }
  if (
    completionGate({ path: p, role, hasProfile }) === "redirect-to-completion"
  ) {
    return <Navigate to={COMPLETION_PATH} replace />;
  }
  if (p === "/") return <Navigate to={homeRouteForRole(role)} replace />;
  return <Outlet />;
}

const APP_PREFIXES = [
  "/student",
  "/queue",
  "/officer",
  "/instructor",
  "/admin",
];
const AUTH_PATHS = new Set([
  "/login",
  "/login/register",
  "/login/forgot-password",
  "/login/reset-password",
  "/loading",
  "/auth/error",
]);

export function RequireNoAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useLaunchSession();
  const location = useLocation();
  if (isPending) return <PageLoader label="Loading session" />;
  const role = data?.user.role;
  const p = location.pathname;
  if (role && (AUTH_PATHS.has(p) || p === "/" || p.startsWith("/login/"))) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }
  return <>{children}</>;
}

export function RequireApp({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useLaunchSession();
  const location = useLocation();
  if (isPending) return <PageLoader label="Loading session" />;
  const role = data?.user.role;
  if (!role) return <Navigate to={loginRouteForSessionLoss()} replace />;
  if (
    !APP_PREFIXES.some((prefix) => location.pathname.startsWith(prefix)) &&
    location.pathname !== "/"
  ) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }
  return <>{children}</>;
}
