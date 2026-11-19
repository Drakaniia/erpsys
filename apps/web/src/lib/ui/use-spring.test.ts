import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpring } from "./use-spring";

/** Drive rAF by hand, at 60fps, so the spring's convergence is deterministic. */
function frames() {
  let queue: Array<FrameRequestCallback | undefined> = [];
  // rAF timestamps share `performance.now()`'s clock; start well clear of the
  // real clock so the spring's first frame is never a negative elapsed time.
  let now = performance.now() + 10_000;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue[id - 1] = undefined;
  });
  return {
    step() {
      now += 1000 / 60;
      const current = queue;
      queue = [];
      for (const cb of current) cb?.(now);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useSpring", () => {
  it("travels to the target instead of snapping", () => {
    const raf = frames();
    const { result } = renderHook(() => useSpring(0));
    act(() => result.current[1](1));
    act(() => raf.step());
    expect(result.current[0]).toBeGreaterThan(0);
    expect(result.current[0]).toBeLessThan(1);
  });

  it("settles on the target", () => {
    const raf = frames();
    const { result } = renderHook(() => useSpring(0));
    act(() => result.current[1](1));
    act(() => {
      for (let i = 0; i < 200; i += 1) raf.step();
    });
    expect(result.current[0]).toBe(1);
  });

  it("snaps on a hard set and stops running", () => {
    const raf = frames();
    const { result } = renderHook(() => useSpring(0));
    act(() => result.current[1](1, true));
    expect(result.current[0]).toBe(1);
    act(() => raf.step());
    expect(result.current[0]).toBe(1);
  });

  it("tracks a target that moves mid-flight", () => {
    const raf = frames();
    const { result } = renderHook(() => useSpring(0));
    act(() => result.current[1](1));
    act(() => raf.step());
    const partial = result.current[0];
    act(() => result.current[1](0));
    act(() => {
      for (let i = 0; i < 200; i += 1) raf.step();
    });
    expect(partial).toBeLessThan(1);
    expect(result.current[0]).toBe(0);
  });
});
