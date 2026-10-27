import { useEffect } from "react";
import { useNavigate } from "react-router";
import { authClient } from "$lib/auth-client";
import { homeRouteForRole } from "$lib/auth/redirect";
import { canEnterSurface, type SurfaceId } from "$lib/domain/roles";
import { SIGNED_OUT_BROADCAST_KEY } from "$lib/perf/cache-policy";

export function loginWithReason(reason?: string): string {
  if (!reason) return "/login";
  return `/login?reason=${encodeURIComponent(reason)}`;
}

/** Set before an intentional sign-out so the guard shows "signed out", not "expired". */
export const SIGNED_OUT_KEY = "erpsys:signed-out";

export function markSignedOut(): void {
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    // Storage unavailable (private mode) — guard falls back to "expired".
  }
  // sessionStorage is per-tab, so other tabs need a localStorage signal to
  // drop the persisted snapshot they would otherwise render for this account.
  try {
    localStorage.setItem(SIGNED_OUT_BROADCAST_KEY, String(Date.now()));
  } catch {
    /* storage blocked */
  }
}

function consumedSignedOutFlag(): boolean {
  try {
    const hit = sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
    if (hit) sessionStorage.removeItem(SIGNED_OUT_KEY);
    return hit;
  } catch {
    return false;
  }
}

/** Peek without consuming — guards race on the same render, so only the login page clears. */
export function peekSignedOut(): boolean {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSignedOutFlag(): void {
  try {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Intentional sign-out → "signed-out", anything else → "expired". */
export function loginRouteForSessionLoss(): string {
  return loginWithReason(peekSignedOut() ? "signed-out" : "expired");
}

/**
 * Role decides where a signed-in user belongs. A surface the role cannot
 * enter sends them to their own console instead of asking them to pick.
 */
export function useSessionGuard(surface: SurfaceId) {
  const navigate = useNavigate();
  const { data, isPending } = authClient.useSession();
  const user = (data?.user ?? null) as {
    email?: string;
    name?: string;
    role?: string;
    isOutsideOrg?: boolean;
  } | null;
  const role = user?.role;
  const signedIn = !!user;
  const isRedirecting = signedIn && !canEnterSurface(role, surface);

  useEffect(() => {
    if (isPending) return;
    if (!signedIn) {
      const justSignedOut = consumedSignedOutFlag();
      navigate(loginWithReason(justSignedOut ? "signed-out" : "expired"), {
        replace: true,
      });
      return;
    }
    if (isRedirecting) navigate(homeRouteForRole(role), { replace: true });
  }, [isPending, signedIn, role, isRedirecting, navigate]);

  return { isPending, user, isRedirecting };
}
