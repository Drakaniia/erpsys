import { describe, expect, it } from "vitest";
import { profilingFormUrl } from "./profiling";

describe("profilingFormUrl", () => {
  it("selects the student's Google account and preserves the form URL", () => {
    expect(
      profilingFormUrl(
        "https://docs.google.com/forms/d/e/form-id/viewform?usp=sharing&authuser=0",
        " 2401117078@student.buksu.edu.ph ",
      ),
    ).toBe(
      "https://docs.google.com/forms/d/e/form-id/viewform?usp=sharing&authuser=2401117078%40student.buksu.edu.ph",
    );
  });
});
