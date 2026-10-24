/**
 * Copied from `apps/server/src/config/roles.ts` when the web stopped importing
 * server code. Keep the two in step by hand.
 */

export type SurfaceId = "student" | "officer" | "instructor" | "admin";

export type Role = "STUDENT" | "SBO_OFFICER" | "ENROLLMENT_ADVISER" | "ADMIN";

export const SURFACES_FOR_ROLE: Record<Role, readonly SurfaceId[]> = {
  ADMIN: ["officer", "instructor", "admin", "student"],
  SBO_OFFICER: ["officer", "student"],
  ENROLLMENT_ADVISER: ["instructor"],
  STUDENT: ["student"],
};

export function canEnterSurface(
  role: string | null | undefined,
  surface: SurfaceId,
): boolean {
  if (!role) return false;
  return SURFACES_FOR_ROLE[role as Role]?.includes(surface) ?? false;
}

export function canUseStudentSurface(role: string | null | undefined): boolean {
  return canEnterSurface(role, "student");
}

/**
 * The console a role lands on. Deliberately not `SURFACES_FOR_ROLE[role][0]`:
 * ADMIN's surface list starts with `officer`, but ADMIN lands on `/admin`.
 */
export function landingSurfaceForRole(
  role: string | null | undefined,
): SurfaceId {
  switch (role) {
    case "ADMIN":
      return "admin";
    case "SBO_OFFICER":
      return "officer";
    case "ENROLLMENT_ADVISER":
      return "instructor";
    default:
      return "student";
  }
}
