import { beforeEach, describe, expect, it } from "vitest";
import { CACHE_MAX_AGE_MS, PERSIST_OWNER_KEY } from "./cache-policy";
import {
  SESSION_SNAPSHOT_KEY,
  clearSessionSnapshot,
  persistedOwnerId,
  readSessionSnapshot,
  resetSessionCacheForTest,
  writeSessionSnapshot,
} from "./session-cache";

beforeEach(() => {
  window.localStorage.clear();
  resetSessionCacheForTest();
});

describe("session snapshot", () => {
  it("round-trips the minimal user and the owner id", () => {
    writeSessionSnapshot({
      id: "u1",
      email: "a@b.c",
      name: "Ada",
      role: "STUDENT",
      extra: "dropped",
    });
    expect(readSessionSnapshot()).toEqual({
      id: "u1",
      email: "a@b.c",
      name: "Ada",
      image: null,
      role: "STUDENT",
      isOutsideOrg: undefined,
    });
    expect(persistedOwnerId()).toBe("u1");
  });

  it("ignores a snapshot older than 24h", () => {
    writeSessionSnapshot(
      { id: "u1", email: "a@b.c" },
      Date.now() - CACHE_MAX_AGE_MS - 1,
    );
    expect(readSessionSnapshot()).toBeNull();
  });

  it("ignores corrupt JSON", () => {
    window.localStorage.setItem(SESSION_SNAPSHOT_KEY, "{nope");
    expect(readSessionSnapshot()).toBeNull();
  });

  it("ignores a user without an id", () => {
    window.localStorage.setItem(
      SESSION_SNAPSHOT_KEY,
      JSON.stringify({ savedAt: Date.now(), user: { email: "a@b.c" } }),
    );
    expect(readSessionSnapshot()).toBeNull();
  });

  it("clears the snapshot", () => {
    writeSessionSnapshot({ id: "u1", email: "a@b.c" });
    clearSessionSnapshot();
    expect(readSessionSnapshot()).toBeNull();
  });

  it("expires the persisted owner with the same 24h cap", () => {
    writeSessionSnapshot(
      { id: "u1", email: "a@b.c" },
      Date.now() - CACHE_MAX_AGE_MS - 1,
    );
    expect(window.localStorage.getItem(PERSIST_OWNER_KEY)).not.toBeNull();
    expect(persistedOwnerId()).toBeNull();
  });
});
