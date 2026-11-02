import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api, queryClient } from "$lib/api";
import { LAUNCH_STALE_MS } from "./cache-policy";
import { applyLaunchSeed, isAppPath } from "./launch-seed";

function Probe() {
  const query = useQuery({
    ...api.student.getMySteps.queryOptions({ staleTime: LAUNCH_STALE_MS }),
    // Proves the seeded entry is served from cache: a fetch here would never
    // resolve, so the only way to render "cached" is the seeded data.
    queryFn: () => new Promise<never>(() => {}),
  });
  return <div>{query.data ? "cached" : "empty"}</div>;
}

beforeEach(() => {
  queryClient.clear();
  delete window.__erpsysLaunch;
});

describe("applyLaunchSeed", () => {
  it("seeds the student surface so the first render has data and no loader", () => {
    applyLaunchSeed({
      surface: "student",
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      data: {
        getMySteps: { steps: [], verifiedCount: 0 },
        getMyQueueStatus: { status: "WAITING", position: 3 },
        notifications: { data: [], page: 1, pageSize: 50, total: 0 },
        profileStatus: { hasProfile: true, studentNumber: "20210001" },
        integrations: { data: { turnstile: true } },
      },
    });

    expect(queryClient.getQueryData(api.student.getMySteps.queryKey())).toEqual(
      { steps: [], verifiedCount: 0 },
    );
    expect(
      queryClient.getQueryData(api.notifications.listMine.queryKey()),
    ).toEqual({ data: [], page: 1, pageSize: 50, total: 0 });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
    expect(screen.getByText("cached")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("seeds the officer bell under its input-bearing key", () => {
    const bell = { data: [], page: 1, pageSize: 20, total: 0 };
    applyLaunchSeed({
      surface: "officer",
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      data: {
        getOverview: { steps: [] },
        getBell: bell,
        getProfilingForm: null,
        listSocialMediaLinks: { data: [], page: 1, pageSize: 50, total: 0 },
      },
    });
    expect(
      queryClient.getQueryData(
        api.officer.getBell.queryKey({
          status: "PENDING",
          dir: "desc",
          pageSize: 20,
        }),
      ),
    ).toEqual(bell);
  });

  it("seeds admin overview and profiling form", () => {
    applyLaunchSeed({
      surface: "admin",
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      data: { getOverview: { activeYear: null }, getProfilingForm: null },
    });
    expect(queryClient.getQueryData(api.admin.getOverview.queryKey())).toEqual({
      activeYear: null,
    });
  });
});

describe("isAppPath", () => {
  it("only fires on app paths", () => {
    for (const path of [
      "/student",
      "/student/",
      "/queue",
      "/officer",
      "/instructor",
      "/admin",
      "/settings/accounts",
      "/complete-profile",
    ]) {
      expect(isAppPath(path)).toBe(true);
    }
    for (const path of ["/", "/login", "/login/register", "/auth/error"]) {
      expect(isAppPath(path)).toBe(false);
    }
  });
});

describe("prefetchLaunch", () => {
  it("swallows a 401 without throwing or seeding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "no" }), { status: 401 }),
      ),
    );
    window.history.pushState({}, "", "/student");
    const { prefetchLaunch } = await import("./launch-seed");
    await expect(prefetchLaunch()).resolves.toBeUndefined();
    expect(queryClient.getQueryData(api.student.getMySteps.queryKey())).toBe(
      undefined,
    );
    vi.unstubAllGlobals();
  });
});
