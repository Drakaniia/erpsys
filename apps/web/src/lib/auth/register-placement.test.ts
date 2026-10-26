import { describe, expect, it } from "vitest";
import { defaultAcademicYearId } from "./register-placement";
import type { AcademicYearOption, SignupOptions } from "./register-placement";

const year = (id: string, isActive: boolean): AcademicYearOption => ({
  id,
  label: "AY",
  semesterLabel: "1st Semester",
  isActive,
});

const opts = (academicYears: AcademicYearOption[]): SignupOptions => ({
  academicYears,
  departments: [],
});

describe("defaultAcademicYearId", () => {
  it("preselects the active year the admin set", () => {
    expect(
      defaultAcademicYearId(
        opts([
          year("AY-2025", false),
          year("AY-2026", true),
          year("AY-2027", false),
        ]),
      ),
    ).toBe("AY-2026");
  });

  it("prefers the active year over the first in the list", () => {
    // The list is not ordered by "current first", so index 0 is not a
    // safe fallback while an active year exists.
    expect(
      defaultAcademicYearId(
        opts([year("AY-2025", false), year("AY-2026", true)]),
      ),
    ).toBe("AY-2026");
  });

  it("falls back to the first year when none is active", () => {
    // A year can be configured but not yet activated. Better to
    // preselect something the admin can see and change than nothing.
    expect(
      defaultAcademicYearId(
        opts([year("AY-2025", false), year("AY-2026", false)]),
      ),
    ).toBe("AY-2025");
  });

  it("falls back to the first year when options have not loaded", () => {
    expect(defaultAcademicYearId(undefined)).toBeNull();
    expect(defaultAcademicYearId(opts([]))).toBeNull();
  });

  it("ignores an active year that is not in the list", () => {
    // Defensive: the helper reads only what it was given, so a caller
    // that passes a filtered list gets an answer about that list.
    expect(defaultAcademicYearId(opts([year("AY-2025", false)]))).toBe(
      "AY-2025",
    );
  });
});
