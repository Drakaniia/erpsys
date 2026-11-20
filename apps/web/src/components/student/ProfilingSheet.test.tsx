import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ProfilingSheet from "./ProfilingSheet";

const integrations = vi.hoisted(() => ({ flags: { googleForms: true } }));

vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => integrations,
}));

const response = {
  status: "COMPLETE" as const,
  submittedAt: "2026-11-19T09:00:00.000Z",
  answers: [{ label: "Preferred name", value: "Student Example" }],
  missingRequired: [] as string[],
};

const step = {
  code: "PROFILING" as const,
  status: "PENDING" as const,
  evidence: [],
  reply: null,
  stamp: null,
  profilingFormUrl: "https://docs.google.com/forms/d/e/example/viewform",
  profilingResponse: response,
};

function expectNoManualActions() {
  expect(
    screen.queryByRole("button", { name: /submitted|submit|cancel/i }),
  ).toBeNull();
}

beforeEach(() => {
  integrations.flags.googleForms = true;
});

describe("ProfilingSheet automatic Google Forms status", () => {
  it("shows not submitted without requiring a manual action", () => {
    render(
      <ProfilingSheet
        step={{
          ...step,
          profilingResponse: {
            ...response,
            status: "NOT_SUBMITTED",
            submittedAt: null,
            answers: [],
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Not submitted");
    expect(screen.getByText(/update automatically here/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the form" })).toHaveAttribute(
      "href",
      step.profilingFormUrl,
    );
    expectNoManualActions();
  });

  it("keeps missing required answers incomplete even when the step was submitted", () => {
    render(
      <ProfilingSheet
        step={{
          ...step,
          status: "SUBMITTED",
          profilingResponse: {
            ...response,
            status: "INCOMPLETE",
            missingRequired: ["Emergency contact", "Home address"],
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Incomplete");
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "awaiting officer review",
    );
    expect(screen.getByText("Emergency contact")).toBeVisible();
    expect(screen.getByText("Home address")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the form" })).toBeVisible();
    expectNoManualActions();
  });

  it("shows complete submission awaiting review and a native answer preview without cancellation", () => {
    render(<ProfilingSheet step={{ ...step, status: "SUBMITTED" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Submitted — awaiting officer review",
    );
    expect(screen.getByRole("link", { name: "Open the form" })).toBeVisible();
    expectNoManualActions();

    const summary = screen.getByText("Your response");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("term")).toHaveTextContent("Preferred name");
    expect(screen.getByRole("definition")).toHaveTextContent("Student Example");
    expect(summary.closest("details")?.querySelector("time")).toHaveAttribute(
      "dateTime",
      response.submittedAt,
    );
  });

  it.each(["UNAVAILABLE", null] as const)(
    "does not infer submission from legacy step status when response is %s",
    (status) => {
      render(
        <ProfilingSheet
          step={{
            ...step,
            status: "SUBMITTED",
            profilingResponse: status ? { ...response, status } : null,
          }}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "Submission status is temporarily unavailable",
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(
        "awaiting officer review",
      );
      expect(screen.getByRole("link", { name: "Open the form" })).toBeVisible();
      expectNoManualActions();
    },
  );

  it("preserves the integration unavailable path and any available preview", () => {
    integrations.flags.googleForms = false;
    render(<ProfilingSheet step={step} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Profiling is temporarily unavailable",
    );
    expect(screen.queryByRole("link", { name: "Open the form" })).toBeNull();
    expect(screen.getByText("Your response")).toBeInTheDocument();
    expectNoManualActions();
  });

  it("preserves the not-configured path", () => {
    render(
      <ProfilingSheet
        step={{ ...step, profilingFormUrl: null, profilingResponse: null }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "The profiling form isn't set up yet",
    );
    expect(screen.queryByRole("link", { name: "Open the form" })).toBeNull();
    expectNoManualActions();
  });

  it("retains officer replies alongside the synced status", () => {
    render(
      <ProfilingSheet
        step={{
          ...step,
          status: "RETURNED",
          reply: {
            chips: ["Correct your details"],
            note: "Please update your address.",
            respondedByName: "Officer Example",
            respondedAt: response.submittedAt,
          },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "changes are needed before officer review",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "awaiting officer review",
    );
    expect(screen.getByText("Returned by the officer")).toBeVisible();
    expect(screen.getByText("Please update your address.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the form" })).toBeVisible();
    expectNoManualActions();
  });

  it.each(["COMPLETE", "UNAVAILABLE"] as const)(
    "retains a verified stamp and %s preview but hides the form link",
    (status) => {
      render(
        <ProfilingSheet
          step={{
            ...step,
            status: "VERIFIED",
            profilingResponse: { ...response, status },
            stamp: {
              stampName: "SBO",
              stampGraphicUrl: null,
              stampSignatureUrl: null,
              verifiedAt: response.submittedAt,
              verifiedByName: "Officer Example",
            },
          }}
        />,
      );

      expect(
        within(screen.getByRole("region", { name: "Verified" })).getByText(
          "SBO",
        ),
      ).toBeVisible();
      if (status === "UNAVAILABLE") {
        expect(screen.getByRole("status")).toHaveTextContent(
          "response preview may be out of date",
        );
      }
      expect(screen.queryByRole("link", { name: "Open the form" })).toBeNull();
      fireEvent.click(screen.getByText("Your response"));
      expect(screen.getByRole("definition")).toHaveTextContent(
        "Student Example",
      );
      expectNoManualActions();
    },
  );

  it("shows the verified fallback without a stamp", () => {
    render(<ProfilingSheet step={{ ...step, status: "VERIFIED" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Verified — you're done with this step.",
    );
    expect(screen.queryByRole("link", { name: "Open the form" })).toBeNull();
    expect(screen.getByText("Your response")).toBeInTheDocument();
    expectNoManualActions();
  });
});
