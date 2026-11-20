import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { loginRouteForSessionLoss } from "$lib/auth/session-guard";
import { homeRouteForRole, surfaceForAppPath } from "$lib/auth/redirect";
import { canEnterSurface } from "$lib/domain/roles";
import {
  COMPLETION_ALLOWED_PATHS,
  COMPLETION_DEST_KEY,
  COMPLETION_PATH,
  completionGate,
  isInternalPath,
} from "$lib/auth/completion-gate";
import { api } from "$lib/api";
import { markLaunch } from "$lib/perf/launch-metrics";
import { useLaunchSession } from "$lib/perf/use-launch-session";
import PageLoader from "../components/ui/PageLoader";

// ponytail: component guards instead of Data Router loaders — one redirect
// mechanism matching App.svelte $effect semantics; upgrade to loaders when
// route prefetch measurably matters.
export function HashRedirect() {
  const { hash, search } = window.location;
  const target = hash.slice(1) + (hash.includes("?") ? "" : search);
  if (hash.startsWith("#/") && isInternalPath(target)) {
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

  const profile = useQuery({
    ...api.student.profileStatus.queryOptions({
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }),
    enabled: !isPending && role === "STUDENT",
  });
  const hasProfile = (profile.data as { hasProfile?: boolean } | undefined)
    ?.hasProfile;

  useEffect(() => {
    if (!isPending) markLaunch("session", { cached: usingFallback });
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
      surfaceForAppPath(p) ||
      p === COMPLETION_PATH ||
      p === "/settings/accounts"
    ) {
      const dest = surfaceForAppPath(p)
        ? `${p}${location.search}${location.hash}`
        : undefined;
      return <Navigate to={loginRouteForSessionLoss(dest)} replace />;
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

const AUTH_PATHS = new Set([
  "/login",
  "/login/register",
  "/login/forgot-password",
  "/login/reset-password",
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
  if (!role) {
    const dest = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={loginRouteForSessionLoss(dest)} replace />;
  }
  const surface = surfaceForAppPath(location.pathname);
  if (!surface || !canEnterSurface(role, surface)) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }
  return <>{children}</>;
}
