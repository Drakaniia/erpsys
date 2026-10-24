/**
 * Seed the surface query keys from `GET /api/v1/me/launch`.
 *
 * The endpoint only needs the cookie, so it is issued at boot alongside the
 * session revalidation instead of after it. Every key seeded here is the key
 * the surface's own `useQuery` will read, and each of those queries carries
 * `staleTime: LAUNCH_STALE_MS` so the seed is not immediately refetched.
 */

import type { SurfaceId } from "$lib/domain/roles";
import { ApiClientError, api, queryClient } from "$lib/api";
import { markLaunch } from "./launch-metrics";
import { preloadSurface } from "./preload-surface";

type LaunchPayload = {
  surface: SurfaceId;
  generatedAt: string;
  schemaVersion: number;
  data: Record<string, unknown>;
};

const APP_PATH_PREFIXES = [
  "/student",
  "/queue",
  "/officer",
  "/instructor",
  "/admin",
  "/settings",
  "/complete-profile",
] as const;

/** Paths that should not pay for a launch request. */
export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

type Seed = readonly [queryKey: readonly unknown[], data: unknown];

function seedsFor(payload: LaunchPayload): Seed[] {
  const d = payload.data;
  switch (payload.surface) {
    case "student":
      return [
        [api.student.getMySteps.queryKey(), d.getMySteps],
        [api.student.getMyQueueStatus.queryKey(), d.getMyQueueStatus],
        [api.notifications.listMine.queryKey(), d.notifications],
        [api.student.profileStatus.queryKey(), d.profileStatus],
        [["integrations", "public"], d.integrations],
      ];
    case "officer":
      return [
        [api.officer.getOverview.queryKey(), d.getOverview],
        [
          api.officer.getBell.queryKey({
            status: "PENDING",
            dir: "desc",
            pageSize: 20,
          }),
          d.getBell,
        ],
        [api.officer.getProfilingForm.queryKey(), d.getProfilingForm],
        [api.officer.listSocialMediaLinks.queryKey(), d.listSocialMediaLinks],
      ];
    case "instructor":
      return [
        [api.instructor.getMyQueues.queryKey(), d.getMyQueues],
        [api.instructor.listDepartments.queryKey(), d.listDepartments],
        [
          api.instructor.listMyTransferRequests.queryKey(),
          d.listMyTransferRequests,
        ],
        [api.notifications.listMine.queryKey(), d.notifications],
      ];
    case "admin":
      return [
        [api.admin.getOverview.queryKey(), d.getOverview],
        [api.admin.getProfilingForm.queryKey(), d.getProfilingForm],
      ];
  }
}

function hasSeededData(seeds: Seed[]): boolean {
  return seeds.some(
    ([key]) =>
      queryClient.getQueryCache().find({ queryKey: key })?.state.data !==
      undefined,
  );
}

export function applyLaunchSeed(payload: LaunchPayload): void {
  const seeds = seedsFor(payload);
  const wasCached = hasSeededData(seeds);
  for (const [queryKey, data] of seeds) {
    if (data === undefined) continue;
    queryClient.setQueryData(queryKey, data);
  }
  markLaunch("launch", { cached: wasCached });
}

/**
 * Fire at boot for app paths only. Never throws: a 401/403 is the guards'
 * business, and any other failure just means the persisted snapshot (or the
 * normal per-surface queries) carries the launch.
 */
export async function prefetchLaunch(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isAppPath(window.location.pathname)) return;
  try {
    const payload = (await api.me.getLaunch.call()) as LaunchPayload;
    if (!payload?.surface) return;
    applyLaunchSeed(payload);
    // The route chunk downloads while the session request is still in flight.
    preloadSurface(payload.surface);
  } catch (error) {
    if (error instanceof ApiClientError && [401, 403].includes(error.status)) {
      return;
    }
    // Network errors fall through to the persisted snapshot.
  }
}
