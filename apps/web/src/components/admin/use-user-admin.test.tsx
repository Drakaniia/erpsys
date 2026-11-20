import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, queryClient, timestampOf } from "$lib/api";
import { registerStepUpHost } from "$lib/auth/step-up";
import { useUserAdmin } from "./use-user-admin";

vi.mock("$lib/notifications", () => ({ notify: { error: vi.fn() } }));

afterEach(() => {
  queryClient.clear();
  registerStepUpHost(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const ontoast = vi.fn();
  const removeSelected = vi.fn();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(
    () =>
      useUserAdmin({
        selectedPromotable: [],
        selectedDemotable: [],
        selectedDeletable: [],
        selectedCount: 0,
        clearSelection: vi.fn(),
        removeSelected,
        ontoast,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );
  return { result, ontoast, removeSelected, invalidate };
}

describe("account reactivation mutation", () => {
  it("requires confirmation, retries after step-up, and refreshes the table on success", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "reactivate-user", name: "Student", blocked: true }],
            ts: 42,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Confirm first",
            data: { code: "STEP_UP_REQUIRED" },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { userId: "reactivate-user", blocked: false },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const stepUp = vi.fn((waiter) => queueMicrotask(waiter.ok));
    registerStepUpHost(stepUp);
    const directory = await api.admin.listUsers.call();
    const target = directory.data[0];
    expect(timestampOf(target)).toBe(42);
    const { result, ontoast, removeSelected, invalidate } = setup();
    act(() => result.current.setReactivateTarget(target));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.confirmReactivate();
    });
    expect(stepUp).toHaveBeenCalledOnce();
    for (const [url, init] of fetcher.mock.calls.slice(1)) {
      expect(url).toBe("/api/v1/users/reactivate-user/reactivate");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({});
    }
    expect(ontoast).toHaveBeenCalledWith("Reactivated Student");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(removeSelected).toHaveBeenCalledWith("reactivate-user");
    expect(result.current.reactivateTarget).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("reports failure without claiming success or clearing the selected row", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "User not found." }), {
            status: 404,
          }),
        ),
    );
    const { result, ontoast, removeSelected, invalidate } = setup();
    act(() =>
      result.current.setReactivateTarget({ id: "missing", name: "Missing" }),
    );
    await act(async () => {
      await result.current.confirmReactivate();
    });
    expect(ontoast).toHaveBeenCalledWith("User not found.", "error");
    expect(invalidate).not.toHaveBeenCalled();
    expect(removeSelected).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it("canceling confirmation does not send a request", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { result } = setup();
    act(() =>
      result.current.setReactivateTarget({ id: "blocked", name: "Student" }),
    );
    act(() => result.current.closeReactivate());
    expect(result.current.reactivateTarget).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
