/**
 * Persisted query cache.
 *
 * `main.tsx` awaits `restorePersistedCache()` before `createRoot`, so the first
 * React render already has the previous visit's data. That is the only reason
 * this module does not use `PersistQueryClientProvider`: the provider restores
 * in an effect, after the first paint.
 *
 * Failure is always "no cache": quota errors, private-mode throws, and corrupt
 * JSON are swallowed. Development warns once per cause; users see nothing.
 */

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
  persistQueryClient,
  removeOldestQuery,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import { queryClient } from "$lib/api";
import {
  CACHE_MAX_AGE_MS,
  INTEGRATIONS_BROADCAST_KEY,
  MAX_CACHE_BYTES,
  PERSIST_CACHE_KEY,
  PERSIST_KEY_PREFIX,
  SIGNED_OUT_BROADCAST_KEY,
  byteSize,
  cacheBuster,
  isPersistableQuery,
} from "./cache-policy";
import { APP_BUILD_ID } from "./launch-metrics";
import { clearSessionSnapshot } from "./session-cache";

const RESTORE_TIMEOUT_MS = 150;
const warned = new Set<string>();

function warnOnce(cause: string, error: unknown): void {
  if (!import.meta.env.DEV || warned.has(cause)) return;
  warned.add(cause);
  console.warn(`[perf] persisted cache: ${cause}`, error);
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage;
    const probe = `${PERSIST_CACHE_KEY}:probe`;
    value.setItem(probe, "1");
    value.removeItem(probe);
    return value;
  } catch (error) {
    warnOnce("storage unavailable", error);
    return null;
  }
}

/** Drop old schema-version keys, keeping the current one plus one previous. */
export function pruneStaleKeys(store: Storage): void {
  const versionKeys: { key: string; version: number }[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key || !key.startsWith(PERSIST_KEY_PREFIX)) continue;
    const suffix = key.slice(PERSIST_KEY_PREFIX.length);
    if (/^\d+$/.test(suffix)) {
      versionKeys.push({ key, version: Number(suffix) });
    }
  }
  versionKeys.sort((a, b) => b.version - a.version);
  const keep = new Set([PERSIST_CACHE_KEY, versionKeys[0]?.key]);
  for (const { key } of versionKeys) {
    if (keep.has(key)) continue;
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Keep the stored snapshot under `MAX_CACHE_BYTES` by dropping the oldest
 * entries first. Writes happen once, after trimming — not once per dropped
 * query.
 */
function cappedPersister(store: Storage): Persister {
  const base = createSyncStoragePersister({
    storage: store,
    key: PERSIST_CACHE_KEY,
    throttleTime: 1_000,
    retry: removeOldestQuery,
  });

  return {
    ...base,
    persistClient(client: PersistedClient) {
      const queries = [...client.clientState.queries].sort(
        (a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt,
      );
      const kept: typeof queries = [];
      let bytes = 2; // `[]`
      for (const query of queries) {
        let size: number;
        try {
          size = byteSize(JSON.stringify(query)) + 1;
        } catch (error) {
          warnOnce("unserializable query", error);
          continue;
        }
        if (bytes + size > MAX_CACHE_BYTES) continue;
        bytes += size;
        kept.push(query);
      }
      return base.persistClient({
        ...client,
        clientState: { ...client.clientState, queries: kept },
      });
    },
  };
}

let restorePromise: Promise<boolean> | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Restore the previous visit's cache. Resolves `true` when at least one query
 * is in the cache afterwards. Never rejects.
 */
export function restorePersistedCache(): Promise<boolean> {
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    const store = storage();
    if (!store) return false;
    try {
      pruneStaleKeys(store);
      const persister = cappedPersister(store);
      const [stop, restored] = persistQueryClient({
        queryClient,
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        buster: cacheBuster(APP_BUILD_ID),
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            if (query.state.data === undefined) return false;
            try {
              return isPersistableQuery({
                queryKey: query.queryKey,
                dataUpdatedAt: query.state.dataUpdatedAt,
                serialized: JSON.stringify(query.state.data),
              });
            } catch (error) {
              warnOnce("unserializable data", error);
              return false;
            }
          },
        },
      });
      unsubscribe = stop;
      await Promise.race([
        restored,
        new Promise<void>((resolve) => setTimeout(resolve, RESTORE_TIMEOUT_MS)),
      ]);
      return queryClient
        .getQueryCache()
        .getAll()
        .some((query) => query.state.data !== undefined);
    } catch (error) {
      warnOnce("restore failed", error);
      return false;
    }
  })();
  return restorePromise;
}

/** Remove the persisted snapshot (and the session snapshot) for this origin. */
export function clearPersistedCache(): void {
  clearSessionSnapshot();
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && key.startsWith(PERSIST_KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Tell the other tabs of this browser that an integration switch moved. The
 * tab that flipped has already invalidated its own cache; every other tab
 * needs the same signal, because the cache is per tab. The value changes on
 * every flip so the `storage` event always fires. Never throws: private mode
 * can refuse the write, and the flipping tab is already correct.
 */
export function broadcastIntegrationsChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INTEGRATIONS_BROADCAST_KEY,
      String(Date.now()),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Sign-out in another tab reaches this tab as a `storage` event. The existing
 * `erpsys:signed-out` flag is consumed by the login page, so this listener only
 * reads it (and the key is `sessionStorage`, which does not cross tabs — the
 * query cache still has to be cleared by this tab's own sign-out path).
 *
 * Cross-tab delivery of a sessionStorage flag is not guaranteed by the
 * platform, so the listener also reacts to the persisted cache being removed
 * by another tab, which is the observable half of the contract.
 *
 * It also carries the integration-toggle broadcast (see
 * `broadcastIntegrationsChanged`), which is how a login page open in another
 * tab stops offering a provider the admin just switched off.
 */
export function connectCacheLifecycle(): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage) return;
    if (event.key === null) {
      // Another tab called localStorage.clear().
      queryClient.clear();
      return;
    }
    if (
      event.key === INTEGRATIONS_BROADCAST_KEY &&
      event.newValue !== null
    ) {
      // An integration was switched off or on elsewhere: every flag this tab
      // renders (the Google button, Turnstile, uploads, chat) is now suspect.
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      return;
    }
    if (event.key === SIGNED_OUT_BROADCAST_KEY && event.newValue !== null) {
      // Read and remove; the login page owns its own sessionStorage flag.
      queryClient.clear();
      clearPersistedCache();
      try {
        window.localStorage.removeItem(SIGNED_OUT_BROADCAST_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    if (event.key === PERSIST_CACHE_KEY && event.newValue === null) {
      queryClient.clear();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** Test-only: forget the one-shot restore state. */
export function resetPersistForTest(): void {
  unsubscribe?.();
  unsubscribe = null;
  restorePromise = null;
  warned.clear();
}
