import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditTimestamp } from "./edit-timestamp";

const stamps = vi.hoisted(() => new WeakMap<object, number>());
vi.mock("$lib/api", () => ({
  timestampOf: (data: object) => data && stamps.get(data),
  recordTimestamp: () => undefined,
}));
afterEach(cleanup);

describe("edit timestamp", () => {
  it("freezes a draft across refetches and advances after a successful save", () => {
    const first = {}, second = {}, saved = {};
    stamps.set(first, 10); stamps.set(second, 20); stamps.set(saved, 30);
    const { result, rerender } = renderHook(({ source, id }) => useEditTimestamp("department", id, source), {
      initialProps: { source: first, id: "one" },
    });
    expect(result.current.ts).toBe(10);
    rerender({ source: second, id: "one" });
    expect(result.current.ts).toBe(10);
    act(() => result.current.saved(saved));
    rerender({ source: second, id: "one" });
    expect(result.current.ts).toBe(30);
    rerender({ source: second, id: "two" });
    expect(result.current.ts).toBe(20);
  });

  it("accepts a delayed initial read without making any network requests", () => {
    const source = {}; stamps.set(source, 40);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    try {
      const { result, rerender } = renderHook(({ data }: { data: object | undefined }) => useEditTimestamp("schedule", "one", data), {
        initialProps: { data: undefined as object | undefined },
      });
      expect(result.current.ts).toBeUndefined();
      rerender({ data: source });
      expect(result.current.ts).toBe(40);
      expect(fetcher).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
