import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Toaster, toast } from "sonner";

import { queryClient } from "$lib/api";
import IntegrationsPanel from "./IntegrationsPanel";

/**
 * The master list, the detail pane, the optimistic flip, the 5-second undo and
 * the Turnstile warning. `fetch` answers the one GET and every PATCH; the
 * server sends the rows already in blast-radius order, so the panel must not
 * re-sort. The switch lives in the detail pane, so a flip test selects its
 * integration through the URL first.
 */

const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();

const BASE_ROWS = [
  {
    key: "googleAuth",
    label: "Google sign-in",
    description: "Sign in and link accounts with Google.",
    enabled: true,
    configured: true,
    consequence: "Email and password become the only sign-in.",
    updatedByName: "Ana Reyes",
    updatedAt: threeDaysAgo,
  },
  {
    key: "turnstile",
    label: "Bot protection",
    description: "Challenge every sign-in and registration.",
    enabled: true,
    configured: true,
    consequence: "Sign-in and registration become unchallenged.",
    updatedByName: "Ana Reyes",
    updatedAt: threeDaysAgo,
  },
  {
    key: "r2",
    label: "File uploads",
    description: "Store evidence photos in Cloudflare R2.",
    enabled: true,
    configured: false,
    consequence: "New uploads are refused.",
    updatedByName: null,
    updatedAt: null,
  },
  {
    key: "cloudflareChat",
    label: "Student chat",
    description: "Cloudflare Workers AI answers student questions.",
    enabled: true,
    configured: true,
    consequence: "The student chat disappears.",
    updatedByName: "Ana Reyes",
    updatedAt: threeDaysAgo,
  },
];

// The detail pane always mounts the credential editor, so every row carries
// the fields the real admin payload has.
const ROWS = BASE_ROWS.map((row) => ({
  ...row,
  credentials: [],
  version: 1,
  pendingRestart: false,
  overridesLoaded: true,
}));

type Row = (typeof ROWS)[number];

/** The GET always succeeds; `onPatch` decides what a flip gets back. */
function stubFetch(
  rows: Row[],
  onPatch?: (url: string, init: RequestInit | undefined) => Response,
) {
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PATCH" && onPatch) return onPatch(url, init);
    return new Response(
      JSON.stringify(method === "GET" ? { data: rows } : { data: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderPanel(url = "/admin?tab=integrations") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <IntegrationsPanel />
        <Toaster />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function theSwitch() {
  return screen.getByRole("switch") as HTMLButtonElement;
}

function listLinks() {
  const nav = screen.getByRole("navigation", { name: "Integrations" });
  return Array.from(nav.querySelectorAll("a"));
}

function patchCalls(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.filter(([, init]) => init?.method === "PATCH");
}

afterEach(() => {
  vi.unstubAllGlobals();
  toast.dismiss();
  queryClient.clear();
});

describe("IntegrationsPanel", () => {
  it("lists every integration in server order with its status in words", async () => {
    stubFetch(ROWS);
    renderPanel();
    await screen.findByRole("navigation", { name: "Integrations" });

    expect(listLinks().map((a) => a.textContent)).toEqual([
      "Google sign-inLive",
      "Bot protectionLive",
      "File uploadsNeeds credentials",
      "Student chatLive",
    ]);
    // Live count is derived from the rows, not invented.
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "3 of 4 live"),
    ).toBeTruthy();
  });

  it("opens the first integration that needs attention by default", async () => {
    stubFetch(ROWS);
    renderPanel();
    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("File uploads");
    expect(screen.getByText("Never changed")).toBeTruthy();
    const current = listLinks().find((a) => a.getAttribute("aria-current") === "true");
    expect(current?.textContent).toContain("File uploads");
  });

  it("shows the integration named in the URL with attribution and its switch", async () => {
    stubFetch(ROWS);
    renderPanel("/admin?tab=integrations&integration=googleAuth");
    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Google sign-in");
    expect(screen.getByText("Last changed by Ana Reyes · 3d ago")).toBeTruthy();
    expect(theSwitch().getAttribute("aria-label")).toBe(
      "Google sign-in, currently enabled",
    );
    expect(screen.getByText("What it enables")).toBeTruthy();
    expect(screen.getByText("When it is off")).toBeTruthy();
  });

  it("moves the detail pane when another integration is chosen", async () => {
    stubFetch(ROWS);
    renderPanel("/admin?tab=integrations&integration=googleAuth");
    await screen.findByRole("heading", { level: 2 });
    fireEvent.click(listLinks()[3]);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Student chat"),
    );
  });

  it("flips optimistically, PATCHes, and offers a 5-second undo", async () => {
    const mock = stubFetch(ROWS);
    renderPanel("/admin?tab=integrations&integration=turnstile");
    await screen.findByRole("heading", { name: "Bot protection" });

    fireEvent.click(theSwitch());

    // Optimistic: the switch reads off before the PATCH resolves.
    expect(theSwitch().getAttribute("aria-checked")).toBe("false");

    await waitFor(() => expect(patchCalls(mock)).toHaveLength(1));
    const [url, init] = patchCalls(mock)[0];
    expect(url).toContain("/api/v1/integrations/turnstile");
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false });

    expect(
      await screen.findByText(
        "Bot protection disabled. Sign-in and registration become unchallenged.",
      ),
    ).toBeTruthy();

    // The Undo has to be a real, focusable button — even 5 seconds is a long time
    // to hunt for a div.
    const undo = await screen.findByText("Undo");
    const undoButton = undo.closest("button");
    expect(undoButton).toBeTruthy();
    undoButton!.focus();
    expect(document.activeElement).toBe(undoButton);
  });

  it("undo issues the inverse PATCH", async () => {
    const mock = stubFetch(ROWS);
    renderPanel("/admin?tab=integrations&integration=turnstile");
    await screen.findByRole("heading", { name: "Bot protection" });

    fireEvent.click(theSwitch());
    const undo = await screen.findByText("Undo");
    fireEvent.click(undo.closest("button")!);

    await waitFor(() => expect(patchCalls(mock)).toHaveLength(2));
    const [, init] = patchCalls(mock)[1];
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true });
    await waitFor(() =>
      expect(theSwitch().getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("rolls the switch back and shows an error toast with no Undo", async () => {
    const mock = stubFetch(
      ROWS,
      () => new Response(JSON.stringify({ error: "nope" }), { status: 503 }),
    );
    renderPanel("/admin?tab=integrations&integration=turnstile");
    await screen.findByRole("heading", { name: "Bot protection" });

    fireEvent.click(theSwitch());
    expect(theSwitch().getAttribute("aria-checked")).toBe("false");

    expect(
      await screen.findByText(
        "Could not change Bot protection. The switch was restored.",
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(theSwitch().getAttribute("aria-checked")).toBe("true"),
    );
    expect(screen.queryByText("Undo")).toBeNull();
    expect(patchCalls(mock)).toHaveLength(1);
  });

  it("shows the Turnstile warning only while bot protection is off", async () => {
    const warning =
      "Bot protection is off. Sign-in and registration are unchallenged.";
    stubFetch(ROWS);
    renderPanel("/admin?tab=integrations&integration=turnstile");
    await screen.findByRole("heading", { name: "Bot protection" });
    expect(screen.queryByText(warning)).toBeNull();

    const rows = ROWS.map((r) =>
      r.key === "turnstile" ? { ...r, enabled: false } : r,
    );
    queryClient.clear();
    stubFetch(rows);
    renderPanel("/admin?tab=integrations&integration=turnstile");
    const el = await screen.findByText(warning);
    expect(el.getAttribute("role")).toBe("status");
  });
});
