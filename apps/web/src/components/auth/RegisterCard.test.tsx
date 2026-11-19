import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "$lib/api";
import RegisterCard from "./RegisterCard";

/**
 * Registration is the second unauthenticated surface, and it renders its own
 * Google button and its own Turnstile widget rather than sharing LoginCard's.
 * Both therefore need their own gate, or turning an integration off only takes
 * effect on one of the two pages.
 */
const integration = vi.hoisted(() => ({
  flags: {
    turnstile: true,
    r2: true,
    googleAuth: true,
    cloudflareChat: true,
  },
  pending: false,
  turnstileSiteKey: "runtime-site-key",
}));





vi.mock("$lib/integrations/use-integrations", () => ({
  useIntegrations: () => integration,
}));

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  integration.flags = {
    turnstile: true,
    r2: true,
    googleAuth: true,
    cloudflareChat: true,
  };
  integration.pending = false;
  integration.turnstileSiteKey = "runtime-site-key";
});

function renderCard() {
  // RegisterCard reads the signup-options query, so it needs a client.
  return render(
    <MemoryRouter initialEntries={["/login/register"]}>
      <QueryClientProvider client={queryClient}>
        <RegisterCard />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const googleButton = () =>
  screen.queryByRole("button", { name: /continue with google/i });
const turnstile = () => screen.queryByTestId("turnstile-container");

describe("RegisterCard integration flags", () => {
  it("renders both when googleAuth and turnstile are on", () => {
    renderCard();
    expect(googleButton()).toBeTruthy();
    expect(turnstile()).toBeTruthy();
  });

  it("uses the current server-provided Turnstile key", () => {
    integration.turnstileSiteKey = "updated-runtime-key";
    renderCard();
    expect(turnstile()?.getAttribute("data-sitekey")).toBe("updated-runtime-key");
  });

  it("does not use a build-time fallback when the runtime key is absent", () => {
    integration.turnstileSiteKey = "";
    renderCard();
    expect(turnstile()).toBeNull();
  });

  it("renders no Google button when googleAuth is off", () => {
    integration.flags.googleAuth = false;
    renderCard();
    expect(googleButton()).toBeNull();
  });

  it("renders no Turnstile when turnstile is off", () => {
    integration.flags.turnstile = false;
    renderCard();
    expect(turnstile()).toBeNull();
    expect(screen.queryByText(/verification disabled/i)).toBeNull();
  });

  it("keeps both while the query is pending", () => {
    integration.pending = true;
    renderCard();
    expect(googleButton()).toBeTruthy();
    expect(turnstile()).toBeTruthy();
  });
});
