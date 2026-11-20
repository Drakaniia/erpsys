import { useEffect, useSyncExternalStore } from "react";
import { authClient } from "$lib/auth-client";
import { queryClient } from "$lib/api";
import { clearPersistedCache } from "./persist";
import {
  persistedOwnerId,
  sessionCacheGeneration,
  subscribeSessionCache,
  validateSessionOwner,
  validatedSessionOwner,
  writeSessionSnapshot,
  type CachedSessionUser,
} from "./session-cache";

type LiveSession = ReturnType<typeof authClient.useSession>;

/** Reconcile the cache before exposing a live identity to any consumers. */
export function useLaunchSession(): {
  data: { user: CachedSessionUser } | undefined;
  user: CachedSessionUser | null;
  isPending: boolean;
  usingFallback: boolean;
  live: LiveSession;
} {
  const live = authClient.useSession();
  const generation = useSyncExternalStore(
    subscribeSessionCache,
    sessionCacheGeneration,
    sessionCacheGeneration,
  );
  const liveUser = (live.data?.user ?? null) as CachedSessionUser | null;
  const owner = liveUser?.id ?? null;

  const ready = !live.isPending && validatedSessionOwner() === owner;

  useEffect(() => {
    if (live.isPending) return;
    if (validatedSessionOwner() !== owner) {
      // Missing/expired ownership is unsafe too: shared query keys can still
      // hold the previous account's data in memory after the disk cap expires.
      const previousOwner = validatedSessionOwner();
      if (
        owner === null ||
        (previousOwner !== undefined && previousOwner !== owner) ||
        persistedOwnerId() !== owner
      ) {
        queryClient.clear();
        clearPersistedCache();
      }
      if (liveUser) {
        writeSessionSnapshot(liveUser as unknown as Record<string, unknown>);
      }
      validateSessionOwner(owner);
    }

  }, [live.isPending, live.data, owner, generation]);

  const user = ready ? liveUser : null;
  return {
    data: user ? { user } : undefined,
    user,
    isPending: !ready,
    usingFallback: false,
    live,
  };
}
