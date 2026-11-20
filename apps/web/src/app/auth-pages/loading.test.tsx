import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingPage } from "./loading";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  signOut: vi.fn(),
  cancelQueries: vi.fn(),
  clearQueries: vi.fn(),
  clearPersisted: vi.fn(),
  status: vi.fn(),
  connect: vi.fn(),
  navigate: vi.fn(),
  assign: vi.fn(),
  warning: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.params],
}));
vi.mock("$lib/auth-client", () => ({
  authClient: { getSession: mocks.session, signOut: mocks.signOut },
}));
vi.mock("$lib/api", () => ({
  queryClient: {
    cancelQueries: mocks.cancelQueries,
    clear: mocks.clearQueries,
  },
  api: {
    instructor: {
      getMyCalendar: { call: mocks.status },
      connectCalendar: { call: mocks.connect },
    },
  },
}));
vi.mock("$lib/notifications", () => ({ notify: { warning: mocks.warning } }));
vi.mock("$lib/perf/persist", () => ({
  clearPersistedCache: mocks.clearPersisted,
}));
vi.mock("../../components/ui/DitherLoader", () => ({ default: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.cancelQueries.mockResolvedValue(undefined);
  mocks.params = new URLSearchParams("provider=google");
  mocks.session.mockResolvedValue({
    data: { user: { role: "ENROLLMENT_ADVISER" } },
  });
  mocks.status.mockResolvedValue({ available: true, status: "NOT_CONNECTED" });
  mocks.connect.mockResolvedValue({
    url: "https://accounts.google.com/consent",
  });
  const originalWindow = window;
  vi.stubGlobal(
    "window",
    new Proxy(originalWindow, {
      get(target, key) {
        if (key === "location") return { assign: mocks.assign };
        return Reflect.get(target, key);
      },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.removeItem("erpsys:signed-out");
});

async function finishLogin() {
  render(
    <StrictMode>
      <LoadingPage />
    </StrictMode>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
}

describe("wrong-door sign-in", () => {
  it("names the actual role and waits for Continue before Calendar or navigation", async () => {
    mocks.params.set("dest", "/officer");
    mocks.status.mockResolvedValue({ available: true, status: "CONNECTED" });
    await finishLogin();

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Enrollment Officer")).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Continue" }));
    });
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/instructor", {
      replace: true,
    });
  });

  it("signs out and returns to the original door when choosing another account", async () => {
    const destination = "/instructor?tab=schedule";
    mocks.params.set("dest", destination);
    mocks.session.mockResolvedValue({
      data: { user: { role: "SBO_OFFICER" } },
    });
    await finishLogin();

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("SBO Officer")).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        dialog.getByRole("button", { name: "Choose another account" }),
      );
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.clearPersisted).toHaveBeenCalledTimes(1);
    const [target, options] = mocks.navigate.mock.lastCall!;
    const url = new URL(target, "https://erpsys.invalid");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("dest")).toBe(destination);
    expect(options).toEqual({ replace: true });
  });

  it("keeps the confirmation open if sign-out fails", async () => {
    mocks.params.set("dest", "/admin");
    mocks.signOut.mockResolvedValue({ error: { message: "offline" } });
    await finishLogin();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Choose another account" }),
      );
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not sign out",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("Google login Calendar connection", () => {
  it.each(["NOT_CONNECTED", "NEEDS_RECONNECT"])(
    "starts consent once for %s instructors",
    async (status) => {
      mocks.status.mockResolvedValue({ available: true, status });
      await finishLogin();
      expect(mocks.connect).toHaveBeenCalledTimes(1);
      expect(mocks.assign).toHaveBeenCalledWith(
        "https://accounts.google.com/consent",
      );
      expect(mocks.navigate).not.toHaveBeenCalled();
    },
  );

  it.each(["STUDENT", "SBO_OFFICER", "ADMIN"])(
    "does not request Calendar for %s",
    async (role) => {
      mocks.session.mockResolvedValue({ data: { user: { role } } });
      await finishLogin();
      expect(mocks.status).not.toHaveBeenCalled();
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalled();
    },
  );

  it("does not start Calendar after password login", async () => {
    mocks.params = new URLSearchParams();
    await finishLogin();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/instructor", {
      replace: true,
    });
  });

  it.each([
    { available: true, status: "CONNECTED" },
    { available: false, status: "NOT_CONNECTED" },
  ])("skips consent for %j", async (calendar) => {
    mocks.status.mockResolvedValue(calendar);
    await finishLogin();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/instructor", {
      replace: true,
    });
  });

  it.each(["status", "connect"] as const)(
    "keeps sign-in working when %s fails",
    async (method) => {
      mocks[method].mockRejectedValueOnce(new Error("unavailable"));
      await finishLogin();
      expect(mocks.warning).toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledWith("/instructor", {
        replace: true,
      });
    },
  );

  it("preserves an internal destination when already connected", async () => {
    mocks.params.set("dest", "/instructor?tab=schedule");
    mocks.status.mockResolvedValue({ available: true, status: "CONNECTED" });
    await finishLogin();
    expect(mocks.navigate).toHaveBeenCalledWith("/instructor?tab=schedule", {
      replace: true,
    });
  });

  it("rejects an external destination", async () => {
    mocks.params.set("dest", "//evil.example");
    mocks.status.mockResolvedValue({ available: true, status: "CONNECTED" });
    await finishLogin();
    expect(mocks.navigate).toHaveBeenCalledWith("/instructor", {
      replace: true,
    });
  });

  it("returns to login without a session", async () => {
    mocks.session.mockResolvedValue({ data: null });
    await finishLogin();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});
