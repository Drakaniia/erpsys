import { useEffect, useRef } from "react";
import { authClient } from "$lib/auth-client";
import {
  clearSessionSnapshot,
  readSessionSnapshot,
  writeSessionSnapshot,
  type CachedSessionUser,
} from "./session-cache";

type LiveSession = ReturnType<typeof authClient.useSession>;

/**
 * The live Better Auth session, with the persisted snapshot behind it.
 *
 * While the store is pending, a snapshot from the last visit lets the guards
 * render the shell instead of a full-page loader. The moment the live result
 * lands it wins — including a signed-out result, which also removes the
 * snapshot so the next launch starts clean.
 */
export function useLaunchSession(): {
  data: { user: CachedSessionUser } | undefined;
  user: CachedSessionUser | null;
  isPending: boolean;
  usingFallback: boolean;
  live: LiveSession;
} {
  const live = authClient.useSession();
  const fallback = useRef<CachedSessionUser | null | undefined>(undefined);

  if (fallback.current === undefined) {
    fallback.current = live.isPending ? readSessionSnapshot() : null;
  }

  useEffect(() => {
    if (live.isPending) return;
    if (live.data?.user) {
      writeSessionSnapshot(live.data.user as Record<string, unknown>);
      fallback.current = null;
      return;
    }
    clearSessionSnapshot();
    fallback.current = null;
  }, [live.isPending, live.data]);

  const usingFallback = live.isPending && fallback.current != null;
  const liveUser = (live.data?.user ?? null) as CachedSessionUser | null;
  const user = liveUser ?? (usingFallback ? fallback.current : null);

  return {
    data: user ? { user } : undefined,
    user,
    isPending: live.isPending && !usingFallback,
    usingFallback,
    live,
  };
}
