/**
 * What may be written to the persisted cache, and for how long.
 *
 * The allowlist is by query-key prefix. Keys are `[role, procedure, input]`
 * from `makeLeaf` in `lib/api.ts`; list endpoints keep the whole envelope in
 * the cache, so seeding and persistence only have to agree with the key.
 *
 * Filtered queries are deliberately absent: the filter set lives in the key,
 * so caching them multiplies entries without helping any launch.
 */

/** Bumped by hand when a cached payload's shape changes. */
export const SCHEMA_VERSION = 1;

/** Hard ceiling for a rendered entry and for the stored snapshot. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** How long a launch-seeded entry counts as fresh. */
export const LAUNCH_STALE_MS = 60 * 1000;

/** A cached queue position older than this is not shown at all. */
export const QUEUE_POSITION_FRESH_MS = 2 * 60 * 1000;

export const MAX_ENTRY_BYTES = 64 * 1024;
export const MAX_CACHE_BYTES = 256 * 1024;

export const PERSIST_KEY_PREFIX = "erpsys:query-cache:";

/** localStorage broadcast — sessionStorage does not cross tabs. */
export const SIGNED_OUT_BROADCAST_KEY = "erpsys:signed-out-broadcast";
/**
 * Another tab flipped an integration switch. Each tab owns its own query
 * cache, so the tab that wrote cannot invalidate the others by itself.
 */
export const INTEGRATIONS_BROADCAST_KEY = "erpsys:integrations-broadcast";
export const PERSIST_CACHE_KEY = `${PERSIST_KEY_PREFIX}${SCHEMA_VERSION}`;
export const PERSIST_OWNER_KEY = `${PERSIST_KEY_PREFIX}owner`;

type CacheablePrefix = readonly [role: string, procedure: string];

const CACHEABLE_PREFIXES: readonly CacheablePrefix[] = [
  ["student", "getMySteps"],
  ["student", "getMyQueueStatus"],
  ["student", "profileStatus"],
  ["notifications", "listMine"],
  ["admin", "getIntegrations"],
  ["officer", "getOverview"],
  ["officer", "getBell"],
  ["officer", "getProfilingForm"],
  ["officer", "listSocialMediaLinks"],
  ["instructor", "getMyQueues"],
  ["instructor", "listDepartments"],
  ["instructor", "listMyTransferRequests"],
  ["admin", "getOverview"],
  ["admin", "getProfilingForm"],
  // The integrations hook uses its own two-key namespace.
  ["integrations", "public"],
  ["integrations", "admin"],
];

export function isCacheableQueryKey(queryKey: readonly unknown[]): boolean {
  const [role, procedure] = queryKey;
  if (typeof role !== "string" || typeof procedure !== "string") return false;
  return CACHEABLE_PREFIXES.some(
    ([cachedRole, cachedProcedure]) =>
      cachedRole === role && cachedProcedure === procedure,
  );
}

/** UTF-8 byte length, with a String-length fallback for old runtimes. */
export function byteSize(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length * 2;
}

/**
 * The queue position is the one cached value that misleads if shown stale.
 * Beyond `QUEUE_POSITION_FRESH_MS` the card keeps its state but renders
 * "checking your place…" instead of a number.
 */
export function visibleQueuePosition(
  position: number | null | undefined,
  dataUpdatedAt: number,
  now = Date.now(),
): number | null {
  if (position == null) return null;
  if (dataUpdatedAt <= 0) return null;
  if (now - dataUpdatedAt > QUEUE_POSITION_FRESH_MS) return null;
  return position;
}

export function isOlderThan(updatedAt: number, now = Date.now()): boolean {
  return !Number.isFinite(updatedAt) || now - updatedAt > CACHE_MAX_AGE_MS;
}

/**
 * Whether one query state is small enough and recent enough to persist.
 * `data === undefined` queries (disabled leaves) are never written.
 */
export function isPersistableQuery(args: {
  queryKey: readonly unknown[];
  dataUpdatedAt: number;
  serialized: string;
  now?: number;
}): boolean {
  if (!isCacheableQueryKey(args.queryKey)) return false;
  if (args.dataUpdatedAt <= 0) return false;
  if (isOlderThan(args.dataUpdatedAt, args.now)) return false;
  return byteSize(args.serialized) <= MAX_ENTRY_BYTES;
}

export function cacheBuster(buildId: string): string {
  return `${SCHEMA_VERSION}:${buildId}`;
}
