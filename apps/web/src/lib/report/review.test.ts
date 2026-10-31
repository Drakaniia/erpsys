import { describe, expect, it } from "vitest";
import type { GenerateReportInput } from "./download";
import { summarizeReview } from "./review";

const BASE: GenerateReportInput = {
  role: "officer",
  kind: "step-register",
  title: "Step Verification Register",
  generatedBy: "R. Dela Cruz",
  yearLabel: "2025-2026",
  semester: "1st Sem",
  load: async () => null,
};

describe("summarizeReview", () => {
  it("prints only the filters the user actually narrowed", () => {
    const summary = summarizeReview(
      {
        ...BASE,
        filters: [
          { label: "Step", value: "Assessment" },
          { label: "Status", value: "" },
          { label: "Search", value: "  reyes  " },
          { label: "Evidence", value: null },
        ],
      },
      "officer-step-register-assessment-2026-03-04.pdf",
    );

    expect(summary.filters).toEqual(["Step: Assessment", "Search: reyes"]);
  });

  it("joins the active year and semester into the printed period", () => {
    expect(summarizeReview(BASE, "file.pdf").period).toBe(
      "AY 2025-2026 \u00b7 1st Sem",
    );
  });

  it("repeats the server's cap sentence only when the cap bit", () => {
    expect(
      summarizeReview(
        {
          ...BASE,
          counts: { matchedCount: 3412, returnedCount: 1000, truncated: true },
        },
        "file.pdf",
      ).capNotice,
    ).toBe("Showing 1,000 of 3,412 rows - narrow your filters.");

    expect(
      summarizeReview(
        {
          ...BASE,
          counts: { matchedCount: 40, returnedCount: 40, truncated: false },
        },
        "file.pdf",
      ).capNotice,
    ).toBe("");
  });

  it("carries no row block for a report without a rowset", () => {
    const summary = summarizeReview(BASE, "file.pdf");

    expect(summary.returnedCount).toBeNull();
    expect(summary.matchedCount).toBeNull();
    expect(summary.capNotice).toBe("");
  });

  it("turns a blank description and note into null rather than empty lines", () => {
    const summary = summarizeReview(
      { ...BASE, description: "   ", authenticityNote: "" },
      "file.pdf",
    );

    expect(summary.description).toBeNull();
    expect(summary.authenticityNote).toBeNull();
  });
});
