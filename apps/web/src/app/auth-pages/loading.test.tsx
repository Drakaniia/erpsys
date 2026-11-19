import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingPage } from "./loading";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
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
  authClient: { getSession: mocks.session },
}));
vi.mock("$lib/api", () => ({
  api: {
    instructor: {
      getMyCalendar: { call: mocks.status },
      connectCalendar: { call: mocks.connect },
    },
  },
}));
vi.mock("$lib/notifications", () => ({ notify: { warning: mocks.warning } }));
vi.mock("../../components/ui/DitherLoader", () => ({ default: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
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
