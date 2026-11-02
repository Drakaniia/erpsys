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
}));

// The root .env ships a real site key, so the widget's presence must not depend
// on whoever runs the tests. Stamped before the module graph reads it.
vi.hoisted(() => vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key"));

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

const googleButton = () => screen.queryByRole("button", { name: /^google$/i });
const divider = () => screen.queryByText(/or sign in with/i);
const turnstile = () => screen.queryByTestId("turnstile-container");

describe("RegisterCard integration flags", () => {
  it("renders both when googleAuth and turnstile are on", () => {
    renderCard();
    expect(googleButton()).toBeTruthy();
    expect(turnstile()).toBeTruthy();
  });

  it("renders no Google button when googleAuth is off", () => {
    integration.flags.googleAuth = false;
    renderCard();
    expect(googleButton()).toBeNull();
  });

  it("drops the divider with the button, so no rule is left orphaned", () => {
    integration.flags.googleAuth = false;
    renderCard();
    expect(divider()).toBeNull();
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
