import { describe, expect, it } from "vitest";
import {
  CACHE_MAX_AGE_MS,
  MAX_ENTRY_BYTES,
  QUEUE_POSITION_FRESH_MS,
  byteSize,
  cacheBuster,
  isCacheableQueryKey,
  isOlderThan,
  isPersistableQuery,
  visibleQueuePosition,
} from "./cache-policy";

const now = Date.now();

describe("isCacheableQueryKey", () => {
  it("allows the launch surfaces", () => {
    for (const key of [
      ["student", "getMySteps", undefined],
      ["student", "getMyQueueStatus", undefined],
      ["student", "profileStatus", undefined],
      ["notifications", "listMine", undefined],
      ["admin", "getIntegrations", undefined],
      ["officer", "getOverview", undefined],
      ["officer", "getBell", { status: "PENDING" }],
      ["officer", "getProfilingForm", undefined],
      ["officer", "listSocialMediaLinks", undefined],
      ["instructor", "getMyQueues", undefined],
      ["instructor", "listDepartments", undefined],
      ["instructor", "listMyTransferRequests", undefined],
      ["admin", "getOverview", undefined],
      ["admin", "getProfilingForm", undefined],
      ["integrations", "public", undefined],
      ["integrations", "admin", undefined],
    ]) {
      expect(isCacheableQueryKey(key)).toBe(true);
    }
  });

  it("rejects filtered, large, and report queries", () => {
    for (const key of [
      ["officer", "listByStep", { step: "MUGSHOT" }],
      ["officer", "searchStudents", { q: "a" }],
      ["officer", "getStudentRecord", { id: "s1" }],
      ["instructor", "getRosterReport", undefined],
      ["student", "getMyRecord", undefined],
      ["storage", "getContent", { id: "u1" }],
      ["not-a-role", "getMySteps", undefined],
      ["student"],
      [],
    ]) {
      expect(isCacheableQueryKey(key)).toBe(false);
    }
  });
});

describe("size and age limits", () => {
  it("caps one entry at 64 KB", () => {
    const small = { ok: true };
    const big = { blob: "x".repeat(MAX_ENTRY_BYTES) };
    expect(
      isPersistableQuery({
        queryKey: ["student", "getMySteps"],
        dataUpdatedAt: now,
        serialized: JSON.stringify(small),
        now,
      }),
    ).toBe(true);
    expect(
      isPersistableQuery({
        queryKey: ["student", "getMySteps"],
        dataUpdatedAt: now,
        serialized: JSON.stringify(big),
        now,
      }),
    ).toBe(false);
  });

  it("drops entries older than 24h and keeps the boundary", () => {
    expect(isOlderThan(now - CACHE_MAX_AGE_MS + 1, now)).toBe(false);
    expect(isOlderThan(now - CACHE_MAX_AGE_MS - 1, now)).toBe(true);
    expect(isOlderThan(0, now)).toBe(true);
  });

  it("never persists a query with no timestamp", () => {
    expect(
      isPersistableQuery({
        queryKey: ["student", "getMySteps"],
        dataUpdatedAt: 0,
        serialized: "{}",
        now,
      }),
    ).toBe(false);
  });

  it("measures UTF-8 bytes", () => {
    expect(byteSize("abc")).toBe(3);
    expect(byteSize("é")).toBe(2);
  });
});

describe("visibleQueuePosition", () => {
  it("shows a fresh position", () => {
    expect(visibleQueuePosition(4, now - 30_000, now)).toBe(4);
  });

  it("hides a position older than two minutes", () => {
    expect(
      visibleQueuePosition(4, now - QUEUE_POSITION_FRESH_MS - 1, now),
    ).toBeNull();
  });

  it("hides a missing position", () => {
    expect(visibleQueuePosition(null, now, now)).toBeNull();
    expect(visibleQueuePosition(undefined, now, now)).toBeNull();
  });
});

describe("cacheBuster", () => {
  it("combines the hand-maintained schema version with the build id", () => {
    expect(cacheBuster("abc123")).toBe("1:abc123");
  });
});
