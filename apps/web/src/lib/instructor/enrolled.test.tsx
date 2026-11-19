import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { queryClient } from "$lib/api";
import { useEnrolledState } from "./enrolled";

let fail = false;
const urls: string[] = [];
const toast = vi.fn();
const entry = { entryId: "entry-1", name: "Student" };
const department = { id: "dept-1" };
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
function useSubject() {
  return useEnrolledState(
    () => "dept-1",
    () => "enrolled",
    () => "today",
    () => "Ana",
    toast,
    vi.fn(),
    vi.fn(),
  );
}
beforeEach(() => {
  fail = false;
  urls.length = 0;
  toast.mockClear();
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      urls.push(String(input));
      const write = init?.method !== "GET";
      return new Response(
        JSON.stringify(
          write && fail
            ? { error: "Try again" }
            : write
              ? { data: { studentName: "Student", revertedCount: 1 } }
              : { data: [{ enrollmentId: "entry-1" }], total: 100 },
        ),
        {
          status: write && fail ? 503 : 200,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("instructor enrolled actions", () => {
  it("sends flat range, search and growing limit query parameters", async () => {
    const { result } = renderHook(useSubject, { wrapper });
    await waitFor(() =>
      expect(result.current.enrolledQuery.isSuccess).toBe(true),
    );
    let search = new URL(urls[0], "http://localhost").searchParams;
    expect(search.get("range")).toBe("today");
    expect(search.get("q")).toBe("Ana");
    expect(search.get("limit")).toBe("50");
    expect(search.has("filter")).toBe(false);
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(urls.some((url) => url.includes("limit=100"))).toBe(true),
    );
  });

  it("reports completion failure so the caller keeps confirmation open", async () => {
    const { result } = renderHook(useSubject, { wrapper });
    fail = true;
    let completed: boolean | undefined;
    await act(async () => {
      completed = await result.current.confirmServe(entry, department);
    });
    expect(completed).toBe(false);
    fail = false;
    await act(async () => {
      completed = await result.current.confirmServe(entry, department);
    });
    expect(completed).toBe(true);
  });

  it("keeps bulk confirmation and selection after failure, then clears them after success", async () => {
    const { result } = renderHook(useSubject, { wrapper });
    await waitFor(() =>
      expect(result.current.enrolledQuery.isSuccess).toBe(true),
    );
    act(() => result.current.toggleSelect("entry-1"));
    act(() => result.current.openBulkRevert());
    fail = true;
    await act(async () => {
      await result.current.confirmBulkRevert("Correction", department);
    });
    expect(result.current.bulkConfirmOpen).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    fail = false;
    await act(async () => {
      await result.current.confirmBulkRevert("Correction", department);
    });
    expect(result.current.bulkConfirmOpen).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });
});
