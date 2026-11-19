import { describe, expect, it } from "vitest";
import { canEnterSurface, landingSurfaceForRole } from "$lib/domain/roles";
import { homeRouteForRole, surfaceForAppPath } from "./redirect";

describe("homeRouteForRole", () => {
  it("agrees with the server's landing surface for every role", () => {
    const expected = {
      STUDENT: "/student",
      SBO_OFFICER: "/officer",
      ENROLLMENT_ADVISER: "/instructor",
      ADMIN: "/admin",
    } as const;
    for (const [role, route] of Object.entries(expected)) {
      expect(homeRouteForRole(role)).toBe(route);
      expect(landingSurfaceForRole(role)).toBe(route.slice(1));
    }
  });

  it("defaults an unknown role to the student console", () => {
    expect(homeRouteForRole(undefined)).toBe("/student");
  });
});

describe("protected app paths", () => {
  it.each(["/student", "/queue?dept=tech#status", "/officer", "/instructor?tab=schedule"])("does not let admins into %s", (path) => {
    const surface = surfaceForAppPath(path);
    expect(surface).toBeDefined();
    expect(canEnterSurface("ADMIN", surface!)).toBe(false);
  });

  it("preserves the staff and student doors for SBO officers only", () => {
    expect(surfaceForAppPath("/queue?dept=tech#status")).toBe("student");
    expect(canEnterSurface("SBO_OFFICER", "student")).toBe(true);
    expect(canEnterSurface("SBO_OFFICER", "officer")).toBe(true);
    expect(canEnterSurface("SBO_OFFICER", "instructor")).toBe(false);
    expect(canEnterSurface("ENROLLMENT_ADVISER", "instructor")).toBe(true);
    expect(canEnterSurface("ENROLLMENT_ADVISER", "officer")).toBe(false);
    expect(canEnterSurface("ADMIN", "admin")).toBe(true);
  });
});
