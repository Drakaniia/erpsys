import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "$lib/api";
import ScheduleDialog from "./ScheduleDialog";

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
    json({ data: { departmentId: "dept-1", windows: [WEEKLY], sync: "NOT_CONNECTED" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return putResponse();
      }
      if (url.includes("/api/v1/me/calendar")) return json({ data: calendar });
      return json({
        data: { departmentId: "dept-1", windows: [WEEKLY], sync: "NOT_CONNECTED" },
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
    await waitFor(() =>
      expect((screen.getByLabelText("Start") as HTMLInputElement).value).toBe("09:00"),
    );
    expect((screen.getByLabelText("End") as HTMLInputElement).value).toBe("12:00");
    expect((screen.getByLabelText("Weekday") as HTMLSelectElement).value).toBe("1");
  });

  it("says nothing is posted when the schedule is empty", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: unknown) =>
      String(input).includes("/me/calendar")
        ? json({ data: calendar })
        : json({ data: { departmentId: "dept-1", windows: [], sync: "NOT_CONNECTED" } }),
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
    expect(screen.queryByRole("button", { name: /Google Calendar/ })).toBeNull();
  });

  it("offers Reconnect when Google revoked access", async () => {
    calendar = { ...calendar, status: "NEEDS_RECONNECT", sync: "NEEDS_RECONNECT" };
    open();
    expect(
      await screen.findByRole("button", { name: "Reconnect Google Calendar" }),
    ).toBeTruthy();
  });

  it("saves the rows as server windows and closes", async () => {
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(puts).toEqual([{ departmentId: "dept-1", windows: [WEEKLY] }]);
  });

  it("shows the server's overlap message and stays open", async () => {
    putResponse = () => json({ error: "Overlaps another window (10:00–13:00)." }, 409);
    const onclose = open();
    await screen.findByLabelText("Start");
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Overlaps/);
    expect(onclose).not.toHaveBeenCalled();
  });

  it("blocks a one-off day with no date before calling the server", async () => {
    open();
    await screen.findByLabelText("Start");
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "EXTRA" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Pick a date/);
    expect(puts).toHaveLength(0);
  });

  it("removes a row", async () => {
    open();
    await screen.findByLabelText("Start");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("No hours posted yet.")).toBeTruthy();
  });
});
