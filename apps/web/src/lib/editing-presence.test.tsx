import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditingPresence } from "./editing-presence";

const mocks = vi.hoisted(() => ({ join: vi.fn(), leave: vi.fn(), stamps: new WeakMap<object, number>() }));
vi.mock("$lib/api", () => ({
  api: { editingPresence: { join: { call: mocks.join }, leave: { call: mocks.leave } } },
  timestampOf: (data: object) => data && mocks.stamps.get(data), recordTimestamp: () => undefined,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); mocks.join.mockReset(); mocks.leave.mockReset(); });

describe("editing presence", () => {
  it("freezes the edit snapshot across refetches and advances only after an explicit successful save", async () => {
    mocks.join.mockResolvedValue({ editors: [{ userId: "one" }] });
    mocks.leave.mockResolvedValue({ editors: [] });
    const first = {}, second = {}, saved = {};
    mocks.stamps.set(first, 10); mocks.stamps.set(second, 20); mocks.stamps.set(saved, 30);
    const { result, rerender, unmount } = renderHook(({ source }) => useEditingPresence("department", "one", source), { initialProps: { source: first } });
    await waitFor(() => expect(mocks.join).toHaveBeenCalledTimes(1));
    expect(result.current.ts).toBe(10);
    rerender({ source: second });
    expect(result.current.ts).toBe(10);
    act(() => result.current.saved(saved));
    rerender({ source: second });
    expect(result.current.ts).toBe(30);
    unmount();
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledTimes(1));
    expect(mocks.leave.mock.calls[0][0]).toEqual(mocks.join.mock.calls[0][0]);
  });
  it("waits for an in-flight join before leaving and renews every 20 seconds", async () => {
    let finish!: (value: unknown) => void;
    mocks.join.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    mocks.leave.mockResolvedValue({});
    const { unmount } = renderHook(() => useEditingPresence("department", "one"));
    unmount();
    expect(mocks.leave).not.toHaveBeenCalled();
    await act(async () => { finish({ editors: [] }); });
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledTimes(1));
    mocks.join.mockResolvedValue({ editors: [] });
    vi.useFakeTimers();
    const next = renderHook(() => useEditingPresence("department", "two"));
    await act(async () => {});
    const count = mocks.join.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(mocks.join).toHaveBeenCalledTimes(count + 1);
    next.unmount();
  });
  it("does not join when no record is being edited", () => {
    renderHook(() => useEditingPresence("department", null));
    expect(mocks.join).not.toHaveBeenCalled();
  });
});
