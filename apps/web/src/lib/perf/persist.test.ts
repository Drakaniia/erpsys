import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "$lib/api";
import {
  INTEGRATIONS_BROADCAST_KEY,
  PERSIST_CACHE_KEY,
  PERSIST_KEY_PREFIX,
  cacheBuster,
} from "./cache-policy";
import { APP_BUILD_ID } from "./launch-metrics";
import {
  clearPersistedCache,
  connectCacheLifecycle,
  pruneStaleKeys,
  resetPersistForTest,
  restorePersistedCache,
} from "./persist";

const KEY = ["student", "getMySteps", undefined];

function persistedClient(buster: string, timestamp = Date.now()) {
  return JSON.stringify({
    buster,
    timestamp,
    clientState: {
      mutations: [],
      queries: [
        {
          queryKey: KEY,
          queryHash: JSON.stringify(KEY),
          state: {
            data: { steps: [] },
            dataUpdateCount: 1,
            dataUpdatedAt: timestamp,
            error: null,
            errorUpdateCount: 0,
            errorUpdatedAt: 0,
            fetchFailureCount: 0,
            fetchFailureReason: null,
            fetchMeta: null,
            isInvalidated: false,
            status: "success",
            fetchStatus: "idle",
          },
        },
      ],
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetPersistForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pruneStaleKeys", () => {
  it("keeps the current schema key plus one previous", () => {
    window.localStorage.setItem(`${PERSIST_KEY_PREFIX}0`, "old");
    window.localStorage.setItem(PERSIST_CACHE_KEY, "current");
    window.localStorage.setItem(`${PERSIST_KEY_PREFIX}2`, "newer");
    window.localStorage.setItem(`${PERSIST_KEY_PREFIX}3`, "newest");
    window.localStorage.setItem(`${PERSIST_KEY_PREFIX}session`, "session");

    pruneStaleKeys(window.localStorage);

    expect(window.localStorage.getItem(`${PERSIST_KEY_PREFIX}0`)).toBeNull();
    expect(window.localStorage.getItem(`${PERSIST_KEY_PREFIX}2`)).toBeNull();
    expect(window.localStorage.getItem(PERSIST_CACHE_KEY)).toBe("current");
    expect(window.localStorage.getItem(`${PERSIST_KEY_PREFIX}3`)).toBe(
      "newest",
    );
    // Non-version keys are not touched.
    expect(window.localStorage.getItem(`${PERSIST_KEY_PREFIX}session`)).toBe(
      "session",
    );
  });
});

describe("restorePersistedCache", () => {
  it("restores a fresh client with the matching buster", async () => {
    window.localStorage.setItem(
      PERSIST_CACHE_KEY,
      persistedClient(cacheBuster(APP_BUILD_ID)),
    );
    await expect(restorePersistedCache()).resolves.toBe(true);
    expect(queryClient.getQueryData(KEY)).toEqual({ steps: [] });
  });

  it("discards a client with a different buster", async () => {
    window.localStorage.setItem(PERSIST_CACHE_KEY, persistedClient("0:old"));
    await expect(restorePersistedCache()).resolves.toBe(false);
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it("discards a client older than 24h", async () => {
    window.localStorage.setItem(
      PERSIST_CACHE_KEY,
      persistedClient(
        cacheBuster(APP_BUILD_ID),
        Date.now() - 25 * 60 * 60 * 1000,
      ),
    );
    await expect(restorePersistedCache()).resolves.toBe(false);
  });

  it("treats corrupt JSON as no cache", async () => {
    window.localStorage.setItem(PERSIST_CACHE_KEY, "{not json");
    await expect(restorePersistedCache()).resolves.toBe(false);
  });

  it("treats a quota/setItem failure as no cache", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    await expect(restorePersistedCache()).resolves.toBe(false);
  });
});

describe("connectCacheLifecycle", () => {
  const FLAGS = ["integrations", "public"];

  function storageEvent(key: string, newValue: string | null): StorageEvent {
    return new StorageEvent("storage", {
      key,
      newValue,
      storageArea: window.localStorage,
    });
  }

  it("marks the integration flags stale when another tab flips a switch", () => {
    queryClient.setQueryData(FLAGS, { data: { flags: { googleAuth: true } } });
    const stop = connectCacheLifecycle();
    try {
      // The flipping tab writes this; it must reach every other tab, because
      // each tab owns its own query cache.
      window.dispatchEvent(
        storageEvent(INTEGRATIONS_BROADCAST_KEY, String(Date.now())),
      );
      expect(queryClient.getQueryState(FLAGS)?.isInvalidated).toBe(true);
    } finally {
      stop();
    }
  });

  it("leaves the flags alone for an unrelated storage key", () => {
    queryClient.setQueryData(FLAGS, { data: { flags: { googleAuth: true } } });
    const stop = connectCacheLifecycle();
    try {
      window.dispatchEvent(storageEvent("unrelated", "1"));
      expect(queryClient.getQueryState(FLAGS)?.isInvalidated).toBe(false);
    } finally {
      stop();
    }
  });
});

describe("clearPersistedCache", () => {
  it("removes every persisted key for this origin", () => {
    window.localStorage.setItem(PERSIST_CACHE_KEY, "x");
    window.localStorage.setItem(`${PERSIST_KEY_PREFIX}owner`, "x");
    window.localStorage.setItem(`${PERSIST_KEY_PREFIX}session`, "x");
    window.localStorage.setItem("unrelated", "keep");

    clearPersistedCache();

    expect(window.localStorage.getItem(PERSIST_CACHE_KEY)).toBeNull();
    expect(
      window.localStorage.getItem(`${PERSIST_KEY_PREFIX}owner`),
    ).toBeNull();
    expect(
      window.localStorage.getItem(`${PERSIST_KEY_PREFIX}session`),
    ).toBeNull();
    expect(window.localStorage.getItem("unrelated")).toBe("keep");
  });
});
