import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IntegrationSetupGuide, { setupGuideFor } from "./IntegrationSetupGuide";
import type { IntegrationKey } from "$lib/integrations/use-integrations";

const INTEGRATIONS: IntegrationKey[] = [
  "googleAuth", "googleForms", "googleCalendar", "turnstile", "r2", "cloudflareChat", "email",
];

describe("integration setup guide", () => {
  it.each(INTEGRATIONS)("is a collapsed, expandable step list for %s", (integration) => {
    const { container } = render(<IntegrationSetupGuide integration={integration} />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Setup guide"));
    expect(details.open).toBe(true);
    expect(screen.getByText("Check it works")).toBeTruthy();
    const steps = details.querySelector("ol")!.children.length;
    expect(steps).toBeGreaterThanOrEqual(3);
    // The summary's step count must match the real list, not a hard-coded number.
    expect(screen.getByText(`${steps} steps`)).toBeTruthy();
    for (const link of details.querySelectorAll("a")) {
      expect(link.href).toMatch(/^https:\/\//);
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it.each(INTEGRATIONS)("says what %s enables", (integration) => {
    expect(setupGuideFor(integration).enables.length).toBeGreaterThan(20);
  });

  it("starts open when asked, for an integration that still needs keys", () => {
    const { container } = render(
      <IntegrationSetupGuide integration="r2" defaultOpen />,
    );
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("explains shared credentials, exact Forms scopes and token issuance", () => {
    const { container } = render(<IntegrationSetupGuide integration="googleForms" />);
    const guide = within(container);
    expect(guide.getByText(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/)).toBeTruthy();
    expect(guide.getByText(/currently loaded client, not pending changes/)).toBeTruthy();
    for (const scope of ["forms.body", "forms.responses.readonly", "drive.file"]) {
      expect(guide.getByText(`https://www.googleapis.com/auth/${scope}`)).toBeTruthy();
    }
    expect(guide.getByRole("link", { name: "Google Forms API", hidden: true }).getAttribute("href")).toContain("forms.googleapis.com");
    expect(guide.getByRole("link", { name: "Google Drive API", hidden: true }).getAttribute("href")).toContain("drive.googleapis.com");
    expect(guide.getByText(/Use your own OAuth credentials/)).toBeTruthy();
    expect(guide.getByText(/Refresh token, not the access token/)).toBeTruthy();
    expect(guide.getByText(/expire after 7 days/)).toBeTruthy();
    expect(guide.getByText(/does not delete linked Google forms/)).toBeTruthy();
  });

  it("asks for both Workers AI permissions on a custom Cloudflare token", () => {
    const { container } = render(<IntegrationSetupGuide integration="cloudflareChat" />);
    // Cloudflare's REST guide: a custom token needs Workers AI Read and Edit.
    expect(within(container).getByText(/Workers AI Read and Workers AI Edit/)).toBeTruthy();
  });

  it("builds the Google callback from the current site origin", () => {
    render(<IntegrationSetupGuide integration="googleAuth" />);
    expect(screen.getByText(`${window.location.origin}/api/auth/callback/google`)).toBeTruthy();
  });
});
