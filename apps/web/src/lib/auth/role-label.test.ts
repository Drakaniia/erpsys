import { describe, expect, it } from "vitest";
import { roleLabel } from "./role-label";

describe("roleLabel", () => {
  it("names every role the way the UI and reports print it", () => {
    expect(roleLabel("STUDENT")).toBe("Student");
    expect(roleLabel("SBO_OFFICER")).toBe("SBO Officer");
    expect(roleLabel("ENROLLMENT_ADVISER")).toBe("Instructor");
    expect(roleLabel("ADMIN")).toBe("Admin");
  });

  it("falls back to Student for a missing role", () => {
    expect(roleLabel(undefined)).toBe("Student");
    expect(roleLabel(null)).toBe("Student");
  });
});
