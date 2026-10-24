/**
 * The same dynamic imports the router uses, keyed by surface.
 *
 * Route-level laziness otherwise adds a chunk hop after the session resolves;
 * the launch path calls this while the session and launch requests are still in
 * flight. Vite dedupes identical import specifiers, so this warms the exact
 * chunk the route will ask for.
 */

import type { SurfaceId } from "$lib/domain/roles";

export const SURFACE_LOADERS: Record<SurfaceId, () => Promise<unknown>> = {
  student: () => import("../../app/student-page"),
  officer: () => import("../../app/officer-page"),
  instructor: () => import("../../app/instructor-page"),
  admin: () => import("../../app/admin-page"),
};

export function preloadSurface(surface: SurfaceId): void {
  void SURFACE_LOADERS[surface]().catch(() => {
    /* a failed prefetch must not affect navigation */
  });
}

/** Which console chunk a pathname belongs to, or null for non-console paths. */
export function surfaceForPath(pathname: string): SurfaceId | null {
  if (pathname.startsWith("/student") || pathname.startsWith("/queue")) {
    return "student";
  }
  if (pathname.startsWith("/officer")) return "officer";
  if (pathname.startsWith("/instructor")) return "instructor";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

export function preloadSurfaceForPath(pathname: string): void {
  const surface = surfaceForPath(pathname);
  if (surface) preloadSurface(surface);
}
