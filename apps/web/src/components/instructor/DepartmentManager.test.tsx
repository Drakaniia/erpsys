import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, queryClient } from "$lib/api";
import DepartmentManager from "./DepartmentManager";

vi.mock("$lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "me", role: "ENROLLMENT_ADVISER" } },
    }),
  },
}));
let writes: { url: string; body: Record<string, unknown> }[];
beforeEach(() => {
  writes = [];
  queryClient.clear();
  vi.spyOn(api.presence.touch, "call").mockResolvedValue([]);
  vi.spyOn(api.presence.leave, "call").mockResolvedValue({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method !== "GET")
        writes.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      const data = url.endsWith("/transfers")
        ? { incoming: [], outgoing: [] }
        : url.includes("/departments")
          ? [
              {
                id: "d1",
                name: "Department One",
                code: "D1",
                isActive: true,
                assigned: false,
                yearLevels: ["FIRST"],
                myYearLevels: [],
                owners: [
                  { adviserId: "other", name: "Other", yearLevels: ["FIRST"] },
                ],
              },
            ]
          : {};
      return new Response(JSON.stringify({ data }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([true, false])(
  "updates confirmed assignment %s without waiting for directory refetch or fetching transfers",
  async (assigned) => {
    let directoryReads = 0;
    let transferReads = 0;
    const own = {
      id: "old",
      name: "Old Department",
      code: "OLD",
      isActive: true,
      assigned: true,
      yearLevels: ["FIRST"],
      myYearLevels: ["FIRST"],
      owners: [{ adviserId: "me", name: "Me", yearLevels: ["FIRST"] }],
    };
    const target = {
      id: "d1",
      name: "New Department",
      code: "NEW",
      isActive: true,
      assigned: false,
      yearLevels: ["FIRST"],
      myYearLevels: [],
      owners: [],
    };
    const queueKey = api.instructor.getMyQueues.queryKey();
    queryClient.setQueryData(queueKey, {
      hasActiveYear: true,
      departments: [
        { ...own, entries: [], servingEntry: null, waitingCount: 0 },
      ],
    });
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PUT")
          return new Response(
            JSON.stringify({
              data: {
                departmentIds: assigned ? ["d1"] : [],
                yearLevels: assigned ? ["FIRST"] : [],
              },
            }),
          );
        if (url.endsWith("/transfers")) {
          transferReads++;
          return new Response(
            JSON.stringify({ data: { incoming: [], outgoing: [] } }),
          );
        }
        if (++directoryReads > 1) return new Promise<Response>(() => {});
        return new Response(JSON.stringify({ data: [own, target] }));
      },
    );
    const nativeConfirm = vi.spyOn(window, "confirm");
    const onassigned = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <DepartmentManager ontoast={vi.fn()} onassigned={onassigned} />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "Unassign" });
    if (assigned) {
      fireEvent.click(screen.getByRole("button", { name: "Assign" }));
      await waitFor(() =>
        expect(
          screen.getByRole("checkbox", { name: "1st Year" }),
        ).toBeEnabled(),
      );
      fireEvent.click(screen.getByRole("checkbox", { name: "1st Year" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Assign",
        }),
      );
    } else fireEvent.click(screen.getByRole("button", { name: "Unassign" }));
    const confirmation = await screen.findByRole("dialog", {
      name: assigned ? "Switch to NEW?" : "Unassign OLD?",
    });
    expect(directoryReads).toBe(1);
    expect(nativeConfirm).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: assigned ? "Switch department" : "Unassign",
      }),
    );
    await waitFor(() => expect(directoryReads).toBe(2));
    const cached = queryClient.getQueryData<{
      data: { id: string; assigned: boolean; owners: unknown[] }[];
    }>(api.instructor.listDepartments.queryKey())!;
    expect(cached.data.find((row) => row.id === "old")).toMatchObject({
      assigned: false,
      owners: [],
    });
    expect(cached.data.find((row) => row.id === "d1")?.assigned).toBe(assigned);
    expect(queryClient.getQueryData(queueKey)).toMatchObject({
      departments: assigned
        ? [
            {
              id: "d1",
              name: "New Department",
              myYearLevels: ["FIRST"],
              queueLoading: true,
            },
          ]
        : [],
    });
    if (assigned) expect(onassigned).toHaveBeenCalledWith("d1");
    else expect(onassigned).not.toHaveBeenCalled();
    expect(transferReads).toBe(1);
  },
);
it("cancels unassignment without saving and blocks dismissal while saving", async () => {
  queryClient.setQueryData(api.instructor.listDepartments.queryKey(), {
    data: [
      {
        id: "d1",
        name: "Department One",
        code: "D1",
        isActive: true,
        assigned: true,
        yearLevels: ["FIRST"],
        myYearLevels: ["FIRST"],
        owners: [],
      },
    ],
  });
  let finish: (response: Response) => void = () => {};
  (fetch as ReturnType<typeof vi.fn>).mockImplementation(
    async (input: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") {
        writes.push({
          url: String(input),
          body: JSON.parse(String(init.body)),
        });
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }
      if (String(input).includes("/departments"))
        return new Promise<Response>(() => {});
      return new Response(
        JSON.stringify({ data: { incoming: [], outgoing: [] } }),
      );
    },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <DepartmentManager ontoast={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Unassign" }));
  let dialog = screen.getByRole("dialog", { name: "Unassign D1?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Unassign" }));
  dialog = screen.getByRole("dialog", { name: "Unassign D1?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Unassign" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Cancel",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent.click(dialog);
  expect(screen.getByRole("dialog", { name: "Unassign D1?" })).toBeTruthy();
  finish(
    new Response(
      JSON.stringify({ data: { departmentIds: [], yearLevels: [] } }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("lets an instructor request held levels without exposing another department's edit/delete actions", async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <DepartmentManager ontoast={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Request transfer" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: "1st Year" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "1st Year" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Request transfer",
    }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    url: "/api/v1/transfers",
    body: { departmentId: "d1", yearLevels: ["FIRST"] },
  });
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});
