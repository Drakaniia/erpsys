import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "$lib/api";
import ScheduleDialog from "./ScheduleDialog";
const activeEditors = vi.hoisted(() =>
  vi.fn(
    ({ children }: { children?: import("react").ReactNode }) =>
      children ?? null,
  ),
);
vi.mock("../ActiveEditors", () => ({
  default: activeEditors,
  useEditingLock: () => ({ blocked: false, onBlockedChange: () => {} }),
}));

const DEPARTMENT = { id: "dept-1", name: "College of Technologies" };
const WEEKLY = { kind: "WEEKLY", weekday: 1, startMinute: 540, endMinute: 720 };

type CalendarState = {
  available: boolean;
  status: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_RECONNECT";
  sync: string;
  googleEmail: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

let calendar: CalendarState;
let putResponse: () => Response;
let puts: unknown[];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calendar = {
    available: true,
    status: "NOT_CONNECTED",
    sync: "NOT_CONNECTED",
    googleEmail: null,
    lastSyncAt: null,
    lastError: null,
  };
  puts = [];
  putResponse = () =>
    json({
      data: {
        departmentId: "dept-1",
        windows: [WEEKLY],
        sync: "NOT_CONNECTED",
      },
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);

      if (
        init?.method === "PUT" &&
        new URL(url, "http://localhost").pathname === "/api/v1/me/schedule"
      ) {
        puts.push(JSON.parse(String(init.body)));
        return putResponse();
      }
      if (url.includes("/api/v1/me/calendar")) return json({ data: calendar });
      return json({
        data: {
          departmentId: "dept-1",
          windows: [WEEKLY],
          sync: "NOT_CONNECTED",
        },
      });
    }),
  );
  queryClient.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(onclose = vi.fn()) {
  render(
    <QueryClientProvider client={queryClient}>
      <ScheduleDialog open department={DEPARTMENT} onclose={onclose} />
    </QueryClientProvider>,
  );
  return onclose;
}

describe("ScheduleDialog", () => {
  it("loads the posted hours into editable rows", async () => {
    open();
    expect(activeEditors.mock.lastCall?.[0]).toMatchObject({
      resource: "schedule",
      scope: "dept-1",
      enabled: true,
    });
    expect(activeEditors.mock.lastCall?.[0]).not.toHaveProperty("id");
    await waitFor(() =>
      expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe(
        "09:00",
      ),
    );
    expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe(
      "12:00",
    );
    expect(screen.getByRole("combobox", { name: "Weekday" })).toHaveTextContent(
      "Monday",
    );
  });

  it("says nothing is posted when the schedule is empty", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: unknown) =>
        String(input).includes("/me/calendar")
          ? json({ data: calendar })
          : json({
              data: {
                departmentId: "dept-1",
                windows: [],
                sync: "NOT_CONNECTED",
              },
            }),
    );
    open();
    expect(await screen.findByText("No hours posted yet.")).toBeTruthy();
  });

  it("explains that the schedule never opens the queue", async () => {
    open();
    expect(await screen.findByText(/never open or close/i)).toBeTruthy();
  });

  it("offers Connect Google Calendar only while the integration is available", async () => {
    open();
    expect(
      await screen.findByRole("button", { name: "Connect Google Calendar" }),
    ).toBeTruthy();
    cleanup();
    queryClient.clear();
    calendar = { ...calendar, available: false };
    open();
    await screen.findByLabelText("Start");
    expect(
      screen.queryByRole("button", { name: /Google Calendar/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Open Google Calendar/ }),
    ).toBeNull();
  });

  it.each<CalendarState["status"]>([
    "NOT_CONNECTED",
    "CONNECTED",
    "NEEDS_RECONNECT",
  ])("opens Google Calendar in a new tab while %s", async (status) => {
    calendar = { ...calendar, status };
    open();
    const link = await screen.findByRole("link", {
      name: "Open Google Calendar (opens in a new tab)",
    });
    expect(link.getAttribute("href")).toBe("https://calendar.google.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("offers Reconnect when Google revoked access", async () => {
    calendar = {
      ...calendar,
      status: "NEEDS_RECONNECT",
      sync: "NEEDS_RECONNECT",
    };
    open();
    expect(
      await screen.findByRole("button", { name: "Reconnect Google Calendar" }),
    ).toBeTruthy();
  });

  it("saves the rows as server windows and closes", async () => {
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "13:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(puts).toEqual([
      { departmentId: "dept-1", windows: [{ ...WEEKLY, endMinute: 780 }] },
    ]);
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.every(
        ([url]) => !String(url).includes("editing-presence"),
      ),
    ).toBe(true);
  });

  it("shows the server's overlap message and stays open", async () => {
    putResponse = () =>
      json({ error: "Overlaps another window (10:00–13:00)." }, 409);
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "13:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Overlaps/);
    expect(onclose).not.toHaveBeenCalled();
  });

  it("blocks a one-off day with no date before calling the server", async () => {
    open();
    await screen.findByLabelText("Start");
    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(screen.getByRole("option", { name: "One extra day" }));
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Pick a date/,
    );
    expect(puts).toHaveLength(0);
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.every(
        ([url]) => !String(url).includes("editing-presence"),
      ),
    ).toBe(true);
  });

  it("disables save until a meaningful change, including after undoing an edit", async () => {
    open();
    await screen.findByLabelText("Start");
    const save = screen.getByRole("button", {
      name: "Save schedule",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "13:00" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "12:00" },
    });
    expect(save.disabled).toBe(true);
  });

  it("saves an empty schedule after removing the last posted slot", async () => {
    putResponse = () =>
      json({
        data: { departmentId: "dept-1", windows: [], sync: "NOT_CONNECTED" },
      });
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(puts).toEqual([{ departmentId: "dept-1", windows: [] }]);
  });

  it("blocks save and row creation when the initial schedule fails to load", async () => {
    queryClient.setDefaultOptions({ queries: { retry: false } });
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: unknown) =>
        String(input).includes("/me/calendar")
          ? json({ data: calendar })
          : json({ error: "Offline" }, 503),
    );
    open();
    await screen.findByText(/Couldn't load your schedule\./);
    expect(
      (
        screen.getByRole("button", {
          name: "Save schedule",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "+ Add hours" }).closest("fieldset")
        ?.disabled,
    ).toBe(true);
    expect(screen.queryByText("No hours posted yet.")).toBeNull();
  });

  it("marks a pending-sync save clean and advances its timestamp for the next edit", async () => {
    putResponse = () =>
      json({
        data: { departmentId: "dept-1", windows: [WEEKLY], sync: "PENDING" },
        ts: 30,
      });
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "13:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await screen.findByText("Saved. Google sync will retry shortly.");
    expect(onclose).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("button", {
          name: "Save schedule",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "14:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({ ts: 30 });
  });

  it("preserves a conflict draft until explicit reload", async () => {
    putResponse = () =>
      json({ error: "Stale schedule", data: { code: "TS_ABORTED" } }, 409);
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "13:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await screen.findByRole("button", { name: "Reload saved schedule" });
    expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe(
      "13:00",
    );
    expect(onclose).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved schedule" }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe(
        "12:00",
      ),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save schedule",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    vi.restoreAllMocks();
  });

  it("rejects reversed times before saving", async () => {
    open();
    await screen.findByLabelText("Start");
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "08:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /30-minute grid/,
    );
    expect(puts).toHaveLength(0);
  });

  it("removes a row", async () => {
    open();
    await screen.findByLabelText("Start");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("No hours posted yet.")).toBeTruthy();
  });
});
