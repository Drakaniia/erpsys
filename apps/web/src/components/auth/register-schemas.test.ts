import { describe, expect, it } from "vitest";
import { YEAR_LEVELS } from "$lib/domain/constants";
import type { SignupOptions } from "$lib/auth/register-placement";
import {
  emailSchema,
  firstErrorMessage,
  placementSchemaFor,
  studentNumberSchema,
} from "./register-schemas";

const options: SignupOptions = {
  academicYears: [
    { id: "y1", label: "2025–2026", semesterLabel: "1st", isActive: true },
  ],
  departments: [
    { id: "d1", name: "Computer Science", code: "CS", yearLevels: [] },
  ],
};

describe("emailSchema", () => {
  it("rejects an institutional address", () => {
    expect(emailSchema.safeParse("juan@student.buksu.edu.ph").success).toBe(
      false,
    );
  });

  it("accepts a personal address", () => {
    expect(emailSchema.safeParse("juan@gmail.com").success).toBe(true);
  });
});

describe("studentNumberSchema", () => {
  it("accepts a number and trims surrounding whitespace", () => {
    expect(studentNumberSchema.parse("  2401117979  ")).toBe("2401117979");
  });

  it("rejects punctuation the pattern forbids", () => {
    expect(studentNumberSchema.safeParse("24/01").success).toBe(false);
  });
});

describe("placementSchemaFor", () => {
  const placement = placementSchemaFor(options);

  it("accepts ids the catalogue offers", () => {
    expect(placement.academicYearId.safeParse("y1").success).toBe(true);
    expect(placement.departmentId.safeParse("d1").success).toBe(true);
  });

  it("rejects an id the catalogue does not offer", () => {
    expect(placement.academicYearId.safeParse("nope").success).toBe(false);
    expect(placement.departmentId.safeParse("nope").success).toBe(false);
  });

  it("requires a year level in the domain enum", () => {
    expect(placement.yearLevel.safeParse(YEAR_LEVELS[0]).success).toBe(true);
    expect(placement.yearLevel.safeParse("NOT_A_LEVEL").success).toBe(false);
  });
});

describe("firstErrorMessage", () => {
  it("reads a string error", () => {
    expect(firstErrorMessage({ state: { meta: { errors: ["bad"] } } })).toBe(
      "bad",
    );
  });

  it("reads an issue object's message", () => {
    expect(
      firstErrorMessage({
        state: { meta: { errors: [{ message: "worse" }] } },
      }),
    ).toBe("worse");
  });

  it("returns null when there is no error", () => {
    expect(firstErrorMessage({ state: { meta: { errors: [] } } })).toBeNull();
  });
});
