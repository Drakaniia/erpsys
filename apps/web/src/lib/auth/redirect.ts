import { landingSurfaceForRole } from "$lib/domain/roles";
import type { SurfaceId } from "$lib/domain/roles";
import { isInternalPath } from "./completion-gate";

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

export function surfaceForAppPath(path: string | null): SurfaceId | undefined {
  if (!path || !isInternalPath(path)) return;
  const url = new URL(path, "https://erpsys.invalid");
  if (url.origin !== "https://erpsys.invalid") return;
  const prefix = url.pathname.toLowerCase().split("/")[1];
  switch (prefix) {
    case "queue":
      return "student";
    case "student":
    case "officer":
    case "instructor":
    case "admin":
      return prefix;
  }
}
