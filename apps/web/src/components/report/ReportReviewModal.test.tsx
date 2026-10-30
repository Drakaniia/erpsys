import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PreparedReview } from "$lib/report/review";
import ReportReviewModal from "./ReportReviewModal";

/**
 * The step every export now goes through. What has to hold: the modal shows the
 * REAL rendered document, repeats the facts printed in its header, and writes
 * nothing until its own Download button is pressed.
 */

const REVIEW: PreparedReview = {
  summary: {
    title: "Step Verification Register",
    description:
      "A detailed list of every student at a single step, with their status, evidence, and reply history.",
    generatedBy: "R. Dela Cruz",
    period: "AY 2025-2026 \u00b7 1st Sem",
    filters: ["Step: Assessment", "Status: Pending"],
    returnedCount: 1000,
    matchedCount: 3412,
    capNotice: "Showing 1,000 of 3,412 rows - narrow your filters.",
    filename: "officer-step-register-assessment-2026-03-04.pdf",
    authenticityNote: null,
  },
  blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  url: "blob:report-preview",
};

describe("ReportReviewModal", () => {
  it("previews the rendered document rather than promising a later one", () => {
    const { container } = render(
      <ReportReviewModal
        review={REVIEW}
        onclose={() => {}}
        onconfirm={() => {}}
      />,
    );

    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("blob:report-preview");
    expect(frame.getAttribute("title")).toContain(
      "officer-step-register-assessment-2026-03-04.pdf",
    );
    expect(
      screen
        .getByRole("link", { name: /open full page/i })
        .getAttribute("href"),
    ).toBe("blob:report-preview");
  });

  it("repeats the row counts, the cap sentence and the active filters", () => {
    render(
      <ReportReviewModal
        review={REVIEW}
        onclose={() => {}}
        onconfirm={() => {}}
      />,
    );

    expect(screen.getByText("1,000")).toBeTruthy();
    expect(screen.getByText(/rows in this PDF/)).toBeTruthy();
    expect(screen.getByText(/of 3,412 matching rows/)).toBeTruthy();
    expect(
      screen.getByText("Showing 1,000 of 3,412 rows - narrow your filters."),
    ).toBeTruthy();
    expect(screen.getByText("Step: Assessment")).toBeTruthy();
    expect(screen.getByText("Status: Pending")).toBeTruthy();
    expect(screen.getByText("AY 2025-2026 \u00b7 1st Sem")).toBeTruthy();
  });

  it("downloads only when the user presses Download PDF", async () => {
    const user = userEvent.setup();
    const onconfirm = vi.fn();
    const onclose = vi.fn();
    render(
      <ReportReviewModal
        review={REVIEW}
        onclose={onclose}
        onconfirm={onconfirm}
      />,
    );

    // Opening the modal saves nothing by itself.
    expect(onconfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(onconfirm).toHaveBeenCalledTimes(1);
    expect(onclose).not.toHaveBeenCalled();
  });

  it("closes without downloading when cancelled", async () => {
    const user = userEvent.setup();
    const onconfirm = vi.fn();
    const onclose = vi.fn();
    render(
      <ReportReviewModal
        review={REVIEW}
        onclose={onclose}
        onconfirm={onconfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(onconfirm).not.toHaveBeenCalled();
  });

  it("says explicitly when no filter narrowed the report", () => {
    render(
      <ReportReviewModal
        review={{
          ...REVIEW,
          summary: {
            ...REVIEW.summary,
            filters: [],
            returnedCount: null,
            matchedCount: null,
            capNotice: "",
          },
        }}
        onclose={() => {}}
        onconfirm={() => {}}
      />,
    );

    expect(
      screen.getByText(/no filters . this report covers everything/i),
    ).toBeTruthy();
    expect(screen.queryByText(/rows in this PDF/)).toBeNull();
  });
});
