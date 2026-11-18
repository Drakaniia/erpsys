import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { markNotificationsRead, useNotificationReadState } from "./notification-read-state";

beforeEach(() => localStorage.clear());

it("keeps read state per account, survives remount, and leaves new alerts unread", () => {
  const items = [{ id: "a", readAt: null }, { id: "b", readAt: null }];
  const { result, unmount } = renderHook(() => useNotificationReadState("reader", items));
  act(() => result.current.markRead());
  expect(result.current.items.every((item) => item.readAt)).toBe(true);
  unmount();
  const again = renderHook(() => useNotificationReadState("reader", [...items, { id: "c", readAt: null }]));
  expect(again.result.current.items.map((item) => Boolean(item.readAt))).toEqual([true, true, false]);
  const other = renderHook(() => useNotificationReadState("other", items));
  expect(other.result.current.items.every((item) => !item.readAt)).toBe(true);
});

it("handles malformed storage and storage failures without a server write", () => {
  localStorage.setItem("erpsys:notifications:read:broken", "{bad");
  const hook = renderHook(() => useNotificationReadState("broken", [{ id: "x", readAt: null }]));
  expect(hook.result.current.items[0].readAt).toBeNull();
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
  act(() => markNotificationsRead("offline", ["y"]));
  const offline = renderHook(() => useNotificationReadState("offline", [{ id: "y", readAt: null }]));
  expect(offline.result.current.items[0].readAt).toBeTruthy();
  spy.mockRestore();
});

it("refreshes other tabs and preserves legacy read markers", () => {
  const hook = renderHook(() => useNotificationReadState("tabs", [{ id: "x", readAt: null }, { id: "legacy", readAt: "2026-01-01" }]));
  act(() => {
    localStorage.setItem("erpsys:notifications:read:tabs", '["x"]');
    window.dispatchEvent(new StorageEvent("storage"));
  });
  expect(hook.result.current.items.every((item) => item.readAt)).toBe(true);
});
