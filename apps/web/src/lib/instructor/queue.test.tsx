import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "$lib/api";
import { useQueueState } from "./queue";
vi.mock("$lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "adv1" } } }) },
}));
let fail = false;
const toast = vi.fn();
const serving = { entryId: "e1", status: "IN_PROGRESS", servedById: "adv1" };
const waiting = { entryId: "e2", status: "WAITING", locked: false };
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
beforeEach(() => {
  fail = false;
  toast.mockClear();
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            fail
              ? { error: "Offline" }
              : {
                  data: {
                    hasActiveYear: true,
                    departments: [
                      {
                        id: "d1",
                        myOpen: false,
                        entries: [serving, waiting],
                        servingEntry: serving,
                      },
                    ],
                  },
                },
          ),
          {
            status: fail ? 503 : 200,
            headers: { "content-type": "application/json" },
          },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([true, false])(
  "applies confirmed availability %s before the queue refetch finishes",
  async (open) => {
    const cached = {
      hasActiveYear: true,
      departments: [
        {
          id: "d1",
          myOpen: !open,
          isOpen: !open,
          autoClosedAt: "old",
          waitingCount: 1,
          entries: [serving, waiting],
          servingEntry: serving,
        },
        { id: "d2", myOpen: false, entries: [], servingEntry: null },
      ],
    };
    let reads = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (_input: unknown, init?: RequestInit) => {
        if (init?.method === "PUT")
          return new Response(
            JSON.stringify({
              data: {
                departmentId: "d1",
                myOpen: open,
                isOpen: open,
                openBy: null,
              },
            }),
          );
        if (init?.method === "POST")
          return new Response(JSON.stringify({ data: { touched: 1 } }));
        if (++reads > 1) return new Promise<Response>(() => {});
        return new Response(JSON.stringify({ data: cached }));
      },
    );
    const { result } = renderHook(() => useQueueState(() => "d1", toast), {
      wrapper,
    });
    await waitFor(() => expect(result.current.queueQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.applyAvailability(open);
    });
    await waitFor(() =>
      expect(result.current.queueQuery.isFetching).toBe(true),
    );
    expect(result.current.activeDept).toMatchObject({
      myOpen: open,
      isOpen: open,
      autoClosedAt: null,
      waitingCount: open ? 1 : 2,
    });
    expect(result.current.departments[1]).toEqual(cached.departments[1]);
    expect(result.current.serveEntry?.entryId ?? null).toBe(open ? "e1" : null);
    if (!open)
      expect(
        result.current.waitingEntries.map((entry) => entry.entryId),
      ).toEqual(["e1", "e2"]);
    expect(reads).toBe(2);
  },
);

it("keeps cached availability unchanged when the save fails", async () => {
  const { result } = renderHook(() => useQueueState(() => "d1", toast), {
    wrapper,
  });
  await waitFor(() => expect(result.current.queueQuery.isSuccess).toBe(true));
  (fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (_input: unknown, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ error: "Rejected" }), { status: 409 })
        : new Promise<Response>(() => {}),
  );
  await act(async () => {
    expect(await result.current.applyAvailability(true)).toBe(false);
  });
  expect(result.current.activeDept.myOpen).toBe(false);
});

it("closes confirmation when the serving student or active department changes", async () => {
  const { result, rerender } = renderHook(
    ({ id }) => useQueueState(() => id, toast),
    { wrapper, initialProps: { id: "d1" } },
  );
  await waitFor(() => expect(result.current.queueQuery.isSuccess).toBe(true));
  act(() => result.current.openValidateDialog());
  expect(result.current.showValidateDialog).toBe(true);
  act(() =>
    queryClient.setQueryData(["instructor", "getMyQueues", undefined], {
      hasActiveYear: true,
      departments: [
        { id: "d1", myOpen: false, entries: [waiting], servingEntry: null },
      ],
    }),
  );
  await waitFor(() => expect(result.current.showValidateDialog).toBe(false));
  rerender({ id: "another-department" });
  expect(result.current.showValidateDialog).toBe(false);
});

it("does not advertise serving while my queue is closed", async () => {
  const { result } = renderHook(() => useQueueState(() => "d1", toast), {
    wrapper,
  });
  await waitFor(() => expect(result.current.queueQuery.isSuccess).toBe(true));
  expect(result.current.canServeFirst).toBe(false);
});

it("keeps serving students out of waiting navigation and reports refresh failures", async () => {
  const { result } = renderHook(() => useQueueState(() => "d1", toast), {
    wrapper,
  });
  await waitFor(() => expect(result.current.queueQuery.isSuccess).toBe(true));
  expect(result.current.waitingEntries.map((entry) => entry.entryId)).toEqual([
    "e2",
  ]);
  expect(result.current.serveEntry.entryId).toBe("e1");
  act(() => result.current.moveSelection(1));
  expect(result.current.selectedId).toBe("e2");
  fail = true;
  await act(async () => {
    await result.current.refreshQueues();
  });
  expect(toast).toHaveBeenCalledWith("Could not refresh the queue.", "error");
  expect(toast).not.toHaveBeenCalledWith("Refreshed");
});
