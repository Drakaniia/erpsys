import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import { queryClient } from "$lib/api";
import IntegrationsPanel from "./IntegrationsPanel";
import type { AdminIntegrationRow } from "$lib/integrations/use-integrations";

beforeAll(() => {
  // The disclosure measures its content and jsdom ships no observer.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const FIELD = {
  hint: "One line about the field.",
  helpUrl: null,
  required: true,
  updatedAt: null,
  updatedByName: null,
  unreadable: false,
};

function rows(overrides: Partial<AdminIntegrationRow> = {}): AdminIntegrationRow[] {
  return [
    {
      key: "googleAuth",
      label: "Google sign-in",
      description: "Sign in and link accounts with Google.",
      enabled: true,
      configured: true,
      consequence: "Email and password become the only sign-in.",
      updatedByName: "Ana Reyes",
      updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      version: 4,
      pendingRestart: true,
      overridesLoaded: true,
      credentials: [
        {
          ...FIELD,
          envKey: "GOOGLE_CLIENT_ID",
          label: "Client ID",
          class: "secret",
          value: null,
          masked: "12345••••••••••••",
          source: "stored",
        },
      ],
      ...overrides,
    },
    {
      key: "r2",
      label: "File uploads",
      description: "Upload evidence photos and documents.",
      enabled: true,
      configured: true,
      consequence: "New uploads are refused.",
      updatedByName: null,
      updatedAt: null,
      version: 0,
      pendingRestart: false,
      overridesLoaded: true,
      credentials: [
        {
          ...FIELD,
          envKey: "R2_BUCKET",
          label: "Bucket",
          class: "plain",
          value: "erpsys-prod",
          masked: null,
          source: "env",
        },
      ],
    },
  ];
}

function stubFetch(data: AdminIntegrationRow[], content = "# exported block") {
  const mock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/credentials/export")) {
      return new Response(
        JSON.stringify({
          data: { filename: "erpsys-integrations.env", content },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderPanel(
  _data: AdminIntegrationRow[],
  url = "/admin?tab=integrations",
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <IntegrationsPanel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("credentials", () => {
  it("shows the selected integration's fields in the detail pane", async () => {
    stubFetch(rows());
    renderPanel(rows(), "/admin?tab=integrations&integration=googleAuth");
    await screen.findByRole("heading", { level: 2, name: "Google sign-in" });

    // The editor is part of the pane now, not a second disclosure.
    expect(screen.getByRole("heading", { level: 3, name: "Credentials" })).toBeTruthy();
    expect(screen.getByText("Client ID")).toBeTruthy();
    expect(screen.queryByText("Bucket")).toBeNull();
  });

  it("swaps the fields when another integration is chosen", async () => {
    stubFetch(rows());
    renderPanel(rows(), "/admin?tab=integrations&integration=googleAuth");
    await screen.findByText("Client ID");

    fireEvent.click(screen.getByRole("link", { name: /File uploads/ }));
    expect(await screen.findByText("Bucket")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Client ID")).toBeNull());
  });
});

describe("setup guidance", () => {
  it("explains the Google Forms dependency without opening credentials", async () => {
    const forms = rows({
      key: "googleForms",
      label: "Google Forms",
      description: "Create and read profiling forms.",
      credentials: [],
      pendingRestart: false,
    });
    stubFetch(forms);
    renderPanel(forms, "/admin?tab=integrations&integration=googleForms");
    await screen.findByRole("heading", { level: 2, name: "Google Forms" });

    expect(screen.getByText(/Uses the Client ID and Client secret saved under Google sign-in/)).toBeTruthy();
    // One guide, for the selected integration only.
    expect(screen.getAllByText("Setup guide")).toHaveLength(1);
  });
});

describe("restart banner", () => {
  it("names the unit and the count only when a restart is pending", async () => {
    stubFetch(rows());
    renderPanel(rows());
    await screen.findByRole("navigation", { name: "Integrations" });

    expect(screen.getByText("1 credential change is waiting")).toBeTruthy();
    expect(
      screen.getAllByText("sudo systemctl restart erpsys").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Restart to apply").length).toBeGreaterThan(0);
  });

  it("stays absent when nothing is pending", async () => {
    const clean = rows({ pendingRestart: false });
    stubFetch(clean);
    renderPanel(clean);
    await screen.findByRole("navigation", { name: "Integrations" });

    expect(screen.queryByText(/^\d+ credential changes? (is|are) waiting$/)).toBeNull();
    expect(screen.queryByText("sudo systemctl restart erpsys")).toBeNull();
  });

  it("says stored credentials were not applied when the boot read failed", async () => {
    const failed = rows({ pendingRestart: false, overridesLoaded: false });
    stubFetch(failed);
    renderPanel(failed);
    await screen.findByRole("navigation", { name: "Integrations" });

    expect(
      screen.getByText("Stored credentials were not applied at boot."),
    ).toBeTruthy();
  });
});

describe("export", () => {
  it("shows nothing until the admin asks a second time", async () => {
    const mock = stubFetch(rows(), "GOOGLE_CLIENT_ID=abc");
    renderPanel(rows());
    await screen.findByRole("navigation", { name: "Integrations" });

    expect(screen.queryByText(/live credentials/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Export .env" }));
    expect(screen.getByText(/live credentials/i)).toBeTruthy();
    expect(screen.queryByText("GOOGLE_CLIENT_ID=abc")).toBeNull();
    expect(
      mock.mock.calls.some(([url]) =>
        String(url).includes("/credentials/export"),
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Show and copy" }));
    const block = await screen.findByText("GOOGLE_CLIENT_ID=abc");
    expect(block.tagName).toBe("PRE");
  });
});
