import { describe, expect, it } from "vitest";
import { landingSurfaceForRole } from "$lib/domain/roles";
import { homeRouteForRole } from "./redirect";

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
