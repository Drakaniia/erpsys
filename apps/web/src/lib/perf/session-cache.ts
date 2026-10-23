/**
 * Session snapshot for a warm launch.
 *
 * Better Auth's React `useSession` is a nanostore, not a TanStack Query — there
 * is no library query key to pin and persist. The spec's documented fallback is
 * to keep the launch useful without it, but a warm launch cannot render the
 * gate before `get-session` resolves unless the last session result is kept.
 * So we persist a minimal, 24h-capped snapshot and put it *behind* the live
 * session: it only chooses what to render, never what is authorized, and every
 * mutation and non-GET still reaches the server.
 *
 * The snapshot is cleared on sign-out, account switch, cross-tab sign-out, and
 * a live "signed out" result.
 */

import {
  CACHE_MAX_AGE_MS,
  PERSIST_OWNER_KEY,
  PERSIST_KEY_PREFIX,
} from "./cache-policy";

export const SESSION_SNAPSHOT_KEY = `${PERSIST_KEY_PREFIX}session`;

export type CachedSessionUser = {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  role?: string;
  isOutsideOrg?: boolean;
};

type SessionSnapshot = {
  savedAt: number;
  user: CachedSessionUser;
};

let memo: SessionSnapshot | null | undefined;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage;
    const probe = `${SESSION_SNAPSHOT_KEY}:probe`;
    value.setItem(probe, "1");
    value.removeItem(probe);
    return value;
  } catch {
    return null;
  }
}

function isUser(value: unknown): value is CachedSessionUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === "string" && user.id.length > 0;
}

/** Last persisted session user, or null when absent/expired/unreadable. */
export function readSessionSnapshot(
  now = Date.now(),
): CachedSessionUser | null {
  if (memo !== undefined) {
    return memo && now - memo.savedAt <= CACHE_MAX_AGE_MS ? memo.user : null;
  }
  const store = storage();
  if (!store) {
    memo = null;
    return null;
  }
  try {
    const raw = store.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) {
      memo = null;
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    if (
      typeof parsed.savedAt !== "number" ||
      now - parsed.savedAt > CACHE_MAX_AGE_MS ||
      !isUser(parsed.user)
    ) {
      memo = null;
      return null;
    }
    memo = { savedAt: parsed.savedAt, user: parsed.user };
    return memo.user;
  } catch {
    memo = null;
    return null;
  }
}

/** Record the live session and its owner id for the mismatch check. */
export function writeSessionSnapshot(
  user: Record<string, unknown>,
  now = Date.now(),
): void {
  if (typeof user.id !== "string" || !user.id) return;
  const snapshot: CachedSessionUser = {
    id: user.id,
    email: typeof user.email === "string" ? user.email : "",
    name: typeof user.name === "string" ? user.name : undefined,
    image: typeof user.image === "string" ? user.image : null,
    role: typeof user.role === "string" ? user.role : undefined,
    isOutsideOrg:
      typeof user.isOutsideOrg === "boolean" ? user.isOutsideOrg : undefined,
  };
  memo = { savedAt: now, user: snapshot };
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      SESSION_SNAPSHOT_KEY,
      JSON.stringify({
        savedAt: now,
        user: snapshot,
      } satisfies SessionSnapshot),
    );
    store.setItem(
      PERSIST_OWNER_KEY,
      JSON.stringify({ savedAt: now, ownerId: user.id }),
    );
  } catch {
    /* quota/private mode — no snapshot, today's behaviour */
  }
}

export function clearSessionSnapshot(): void {
  memo = null;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SESSION_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Owner id of the persisted query cache. Under `erpsys:query-cache:owner` so a
 * stale entry is ignored with the same 24h rule as the cache itself.
 */
export function persistedOwnerId(now = Date.now()): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PERSIST_OWNER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; ownerId?: unknown };
    if (
      typeof parsed.savedAt !== "number" ||
      now - parsed.savedAt > CACHE_MAX_AGE_MS
    ) {
      return null;
    }
    return typeof parsed.ownerId === "string" ? parsed.ownerId : null;
  } catch {
    return null;
  }
}

/** Test-only: drop the in-memory memo. */
export function resetSessionCacheForTest(): void {
  memo = undefined;
}
