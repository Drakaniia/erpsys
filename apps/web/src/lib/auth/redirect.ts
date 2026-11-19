import { landingSurfaceForRole } from "$lib/domain/roles";
import type { SurfaceId } from "$lib/domain/roles";

const ROUTE_BY_SURFACE: Record<
  SurfaceId,
  "/admin" | "/officer" | "/instructor" | "/student"
> = {
  admin: "/admin",
  officer: "/officer",
  instructor: "/instructor",
  student: "/student",
};

/**
 * One source of truth: the server owns `landingSurfaceForRole`, the launch
 * endpoint reports the surface it used, and this maps it to a URL. There is no
 * second role switch to drift.
 */
export function homeRouteForRole(
  role: string | undefined | null,
): "/admin" | "/officer" | "/instructor" | "/student" {
  return ROUTE_BY_SURFACE[landingSurfaceForRole(role)];
}
