import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STEP_CODES } from "$lib/domain/constants";
import RequirementPreview from "./RequirementPreview";

describe("RequirementPreview", () => {
  it.each(STEP_CODES)("provides an example for %s", (step) => {
    const { container } = render(<RequirementPreview step={step} />);
    expect(screen.getByText("Requirement preview")).toBeInTheDocument();
    expect(container.querySelectorAll("details p")).toHaveLength(2);
    if (step === "CONSENT") {
      expect(screen.getByAltText(/^Blank Annex E/)).toHaveAttribute(
        "src",
        "/images/consent-form-preview.svg",
      );
      expect(screen.getByAltText(/^Blank Annex F/)).toHaveAttribute(
        "src",
        "/images/medical-form-preview.svg",
      );
    }
  });
});
